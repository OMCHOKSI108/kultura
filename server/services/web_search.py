import asyncio
import html
import logging
import re
import urllib.parse
from datetime import datetime
from typing import Any, Dict, List, Optional
import httpx

from config import settings

logger = logging.getLogger("kultura.services.web_search")

SPAM_DOMAINS = {
    "zhihu.com",
    "baidu.com",
    "csdn.net",
    "bilibili.com",
    "weibo.com",
    "qq.com",
    "163.com",
    "sohu.com",
    "sina.com",
    "douban.com",
    "toutiao.com",
    "tieba.baidu.com",
    "zhidao.baidu.com",
}

CJK_REGEX = re.compile(r"[\u4e00-\u9fff]")


def clean_query(q: str) -> str:
    """
    Strips trailing punctuation, conversational question prefixes, and fixes common typos.
    """
    cleaned = re.sub(r"[\?!.,;:]+$", "", q).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)

    typo_map = {
        r"\bwhther\b": "weather",
        r"\bwether\b": "weather",
        r"\bweathr\b": "weather",
        r"\btemprature\b": "temperature",
        r"\btempreature\b": "temperature",
    }
    for pat, rep in typo_map.items():
        cleaned = re.sub(pat, rep, cleaned, flags=re.IGNORECASE)

    # Strip common conversational query prefixes for better search engine precision
    cleaned = re.sub(
        r"^(what\s+is\s+(the\s+)?|who\s+is\s+(the\s+)?|tell\s+me\s+about\s+|can\s+you\s+tell\s+me\s+(the\s+)?|search\s+for\s+)",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()

    return cleaned


def is_english_query(q: str) -> bool:
    """Detects whether query is in English / ASCII."""
    return not bool(CJK_REGEX.search(q))


def get_timelimit(q: str) -> Optional[str]:
    """Sets a recent timelimit for time-sensitive queries."""
    low = q.lower()
    if any(k in low for k in ("current", "today", "latest", "now", "weather", "breaking", "score")):
        return "d"
    if any(k in low for k in ("news", "update", "this week")):
        return "w"
    return None


class WebSearchService:
    """
    Pluggable async web search service supporting:
    - Default (Zero-Config): DuckDuckGo search (via ddgs/duckduckgo_search with lite/html backends)
    - Region locking (us-en) & strict CJK / spam domain filtering for English queries
    - Self-hosted: SearXNG (via SEARXNG_URL)
    - Optional Cloud: Tavily (via TAVILY_API_KEY) or Brave Search (via BRAVE_API_KEY)
    """

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }

    async def search(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Executes web search with a strict 6-second timeout.
        Returns top clean, filtered sources.
        """
        cleaned = clean_query(query)
        if not cleaned:
            return []

        try:
            return await asyncio.wait_for(self._search_internal(cleaned, limit), timeout=6.0)
        except asyncio.TimeoutError:
            logger.warning(f"Web search timed out after 6.0s for query: {cleaned[:50]}")
            return []
        except Exception as e:
            logger.warning(f"Web search failed gracefully: {e}")
            return []

    async def _search_internal(self, query: str, limit: int) -> List[Dict[str, Any]]:
        is_eng = is_english_query(query)

        # 1. Tavily if key provided
        if settings.TAVILY_API_KEY:
            try:
                results = await self._search_tavily(query, limit, is_eng)
                if results:
                    return results
            except Exception as e:
                logger.debug(f"Tavily search failed, falling back: {e}")

        # 2. SearXNG if URL provided
        if settings.SEARXNG_URL:
            try:
                results = await self._search_searxng(query, limit, is_eng)
                if results:
                    return results
            except Exception as e:
                logger.debug(f"SearXNG search failed, falling back: {e}")

        # 3. Brave if key provided
        if settings.BRAVE_API_KEY:
            try:
                results = await self._search_brave(query, limit, is_eng)
                if results:
                    return results
            except Exception as e:
                logger.debug(f"Brave search failed, falling back: {e}")

        # 4. Fast, reliable Bing zero-config web search
        try:
            results = await self._search_bing(query, limit, is_eng)
            if results:
                return results
        except Exception as e:
            logger.debug(f"Bing search failed, falling back: {e}")

        # 5. DuckDuckGo Search (ddgs or duckduckgo_search) with locked region & spam filter
        try:
            results = await self._search_ddgs(query, limit, is_eng)
            if results:
                return results
        except Exception as e:
            logger.debug(f"DDGS search failed, falling back to direct DDG HTTP: {e}")

        # 6. Direct async DDG Lite HTTP parser (Zero API Key, self-contained)
        return await self._search_ddg_http(query, limit, is_eng)

    async def _search_bing(self, query: str, limit: int, is_english: bool) -> List[Dict[str, Any]]:
        from lxml import html

        url = f"https://www.bing.com/search?q={urllib.parse.quote(query)}"
        async with httpx.AsyncClient(timeout=4.0, headers=self.headers, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return []

            doc = html.fromstring(resp.text)
            raw = []
            for li in doc.xpath("//li[contains(@class, 'b_algo')]"):
                h2 = li.xpath(".//h2/a")
                caption = li.xpath(".//div[contains(@class, 'b_caption')]//p") or li.xpath(".//p")
                if h2 and caption:
                    title = h2[0].text_content().strip()
                    raw_url = h2[0].get("href", "")
                    clean_url = self._unwrap_bing_url(raw_url)
                    snippet = caption[0].text_content().strip()
                    raw.append({"title": title, "url": clean_url, "snippet": snippet})

            return self._filter_results(raw, limit, is_english)

    def _unwrap_bing_url(self, url: str) -> str:
        import base64

        if "bing.com/ck/a" in url and "u=" in url:
            try:
                parsed = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
                u_val = parsed.get("u", [""])[0]
                if u_val.startswith("a1"):
                    b64 = u_val[2:]
                    b64 += "=" * (-len(b64) % 4)
                    return base64.urlsafe_b64decode(b64).decode("utf-8")
            except Exception:
                pass
        return url

    def _filter_results(
        self,
        raw_items: List[Dict[str, Any]],
        limit: int,
        is_english: bool,
    ) -> List[Dict[str, Any]]:
        if limit <= 0:
            return []

        clean_sources: List[Dict[str, Any]] = []
        seen_urls = set()

        for r in raw_items:
            url = r.get("url") or r.get("href") or ""
            if not url or url in seen_urls:
                continue

            # Validate URL scheme to prevent javascript:, file://, data: injections
            if not (url.startswith("http://") or url.startswith("https://")):
                continue

            domain = self._extract_domain(url)
            title = r.get("title") or ""
            snippet = r.get("snippet") or r.get("body") or ""

            # 1. Filter blacklisted spam / Chinese aggregator domains
            if any(spam in domain for spam in SPAM_DOMAINS):
                continue

            # 2. Filter non-English noise if the user's query is English
            if is_english:
                if CJK_REGEX.search(title) or CJK_REGEX.search(snippet):
                    continue

            seen_urls.add(url)
            clean_sources.append(
                {
                    "index": len(clean_sources) + 1,
                    "title": title.strip(),
                    "url": url,
                    "domain": domain,
                    "snippet": snippet.strip(),
                }
            )

            if len(clean_sources) >= limit:
                break

        return clean_sources

    async def _search_ddgs(self, query: str, limit: int, is_english: bool) -> List[Dict[str, Any]]:
        try:
            from ddgs import DDGS  # type: ignore
        except ImportError:
            from duckduckgo_search import DDGS  # type: ignore

        loop = asyncio.get_running_loop()
        timelimit = get_timelimit(query)

        def _run_search(backend_mode: str):
            with DDGS() as ddgs:
                kwargs = {
                    "region": "us-en",
                    "safesearch": "moderate",
                    "max_results": 15,
                }
                if timelimit:
                    kwargs["timelimit"] = timelimit
                if backend_mode:
                    kwargs["backend"] = backend_mode
                return list(ddgs.text(query, **kwargs))

        # Try backend="lite" first
        raw = []
        for b in ["lite", "html", "api"]:
            try:
                raw = await loop.run_in_executor(None, _run_search, b)
                if raw:
                    filtered = self._filter_results(raw, limit, is_english)
                    if filtered:
                        return filtered
            except Exception as e:
                logger.debug(f"DDGS backend '{b}' failed for '{query}': {e}")
                continue

        return []

    async def _search_ddg_http(self, query: str, limit: int, is_english: bool) -> List[Dict[str, Any]]:
        url = "https://lite.duckduckgo.com/lite/"
        async with httpx.AsyncClient(timeout=4.5, headers=self.headers, follow_redirects=True) as client:
            resp = await client.post(url, data={"q": query, "kl": "us-en"})
            if resp.status_code != 200:
                return []

            text = resp.text
            matches = re.findall(
                r"<a[^>]+href=[\"']([^\"']+)[\"'][^>]*class=[\"']result-link[\"'][^>]*>(.*?)</a>.*?<td[^>]*class=[\"']result-snippet[\"'][^>]*>(.*?)</td>",
                text,
                re.DOTALL,
            )

            raw = []
            for res_url, title_raw, snip_raw in matches:
                clean_title = html.unescape(re.sub(r"<[^>]+>", "", title_raw)).strip()
                clean_snip = html.unescape(re.sub(r"<[^>]+>", "", snip_raw)).strip()
                raw.append({"url": res_url, "title": clean_title, "snippet": clean_snip})

            return self._filter_results(raw, limit, is_english)

    async def _search_searxng(self, query: str, limit: int, is_english: bool) -> List[Dict[str, Any]]:
        base = settings.SEARXNG_URL.rstrip("/")
        url = f"{base}/search?q={urllib.parse.quote(query)}&format=json&language=en"
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                raw = [
                    {"url": r.get("url", ""), "title": r.get("title", ""), "snippet": r.get("content", "")}
                    for r in data.get("results", [])
                ]
                return self._filter_results(raw, limit, is_english)
        return []

    async def _search_tavily(self, query: str, limit: int, is_english: bool) -> List[Dict[str, Any]]:
        url = "https://api.tavily.com/search"
        payload = {
            "api_key": settings.TAVILY_API_KEY,
            "query": query,
            "max_results": 15,
            "search_depth": "basic",
        }
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                raw = [
                    {"url": r.get("url", ""), "title": r.get("title", ""), "snippet": r.get("content", "")}
                    for r in data.get("results", [])
                ]
                return self._filter_results(raw, limit, is_english)
        return []

    async def _search_brave(self, query: str, limit: int, is_english: bool) -> List[Dict[str, Any]]:
        url = f"https://api.search.brave.com/res/v1/web/search?q={urllib.parse.quote(query)}&count=15"
        headers = {"X-Subscription-Token": settings.BRAVE_API_KEY}
        async with httpx.AsyncClient(timeout=5.0, headers=headers) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                raw = [
                    {"url": r.get("url", ""), "title": r.get("title", ""), "snippet": r.get("description", "")}
                    for r in data.get("web", {}).get("results", [])
                ]
                return self._filter_results(raw, limit, is_english)
        return []

    def _extract_domain(self, url: str) -> str:
        try:
            domain = urllib.parse.urlparse(url).netloc
            return domain.replace("www.", "").lower()
        except Exception:
            return "web"

    def format_grounding_block(self, sources: List[Dict[str, Any]]) -> str:
        """
        Formats retrieved sources into a structured grounding block with strict anti-hallucination boundaries.
        Synthesized from DeepSeek-R1, OpenAI o1, and Claude Extended Thinking architectures.
        """
        if not sources:
            return ""

        today_str = datetime.now().strftime("%Y-%m-%d")
        lines = [
            f"<search_results date=\"{today_str}\">",
            "The following verified search snippets represent ground truth for this query:",
        ]
        for s in sources:
            clean_snippet = html.escape(re.sub(r"\s+", " ", s.get("snippet", "")).strip())
            safe_domain = html.escape(str(s.get("domain", "")), quote=True)
            safe_title = html.escape(str(s.get("title", "")), quote=True)
            safe_url = html.escape(str(s.get("url", "")), quote=True)
            lines.append(
                f'  <source index="{s["index"]}" domain="{safe_domain}" title="{safe_title}" url="{safe_url}">\n'
                f"    {clean_snippet}\n"
                f"  </source>"
            )
        lines.append("</search_results>")
        lines.append(
            "\n<grounding_instructions>\n"
            "1. Ground all factual assertions strictly on the verified <search_results> above.\n"
            "2. Cite your sources inline using [1], [2], etc., corresponding to the source index.\n"
            "3. Epistemic Honesty: If the search results do not provide a definitive answer, state clearly that the "
            "information is not available in the retrieved sources. Do NOT invent, guess, or extrapolate unverified details.\n"
            "4. In your internal reasoning, evaluate the sources directly against the query, identify what is confirmed vs unconfirmed, "
            "and synthesize the final response without circular self-doubt.\n"
            "</grounding_instructions>"
        )
        return "\n".join(lines)


web_search_service = WebSearchService()
