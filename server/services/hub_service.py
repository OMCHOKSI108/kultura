import asyncio
import json
import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple, AsyncGenerator
import httpx

from config import settings
from schemas.hub_schemas import (
    HubModelSearchItem,
    HubModelFile,
    HubModelDetails,
    DownloadStatusItem,
)
from services.docker_manager import docker_manager
from services.providers import get_provider

logger = logging.getLogger("kultura.hub")

QUANT_REGEX = re.compile(
    r"(?:[._-]|^)(iq\d+_[a-z0-9_]+|q\d+_[a-z0-9_]+|q\d+_[0-9]|q\d+|fp16|f16|bf16|f32)(?:[._-]|$|\.gguf)",
    re.IGNORECASE,
)
PARAM_REGEX = re.compile(
    r"(?:^|[._-])(\d+(?:\.\d+)?[bmBM])(?:[._-]|$)",
    re.IGNORECASE,
)


def format_bytes(num_bytes: int) -> str:
    if num_bytes <= 0:
        return "0 MB"
    mb = num_bytes / (1024 * 1024)
    if mb >= 1024:
        return f"{mb / 1024:.2f} GB"
    return f"{mb:.1f} MB"


class HubService:
    def __init__(self):
        self._search_cache: Dict[str, Tuple[float, List[HubModelSearchItem]]] = {}
        self._cache_ttl = 300.0  # 5 minutes
        self.downloads: Dict[str, DownloadStatusItem] = {}
        self._active_tasks: Dict[str, asyncio.Task] = {}
        self._client_headers = {
            "User-Agent": "Kultura-Inference-Gateway/1.0",
            "Accept": "application/json",
        }

    def _resolve_models_dir(self, provider: str) -> Path:
        """Resolve and ensure target directory for downloaded models."""
        base_dir = Path(settings.MODELS_DIR) if Path(settings.MODELS_DIR).exists() else Path("./models").resolve()
        base_dir.mkdir(parents=True, exist_ok=True)
        prov_clean = provider.lower().replace(".", "").strip()

        if prov_clean in ["ollama", "llamacpp", "koboldcpp"]:
            return base_dir
        else:
            # lmstudio, jan
            sub_dir = base_dir / prov_clean
            sub_dir.mkdir(parents=True, exist_ok=True)
            return sub_dir

    async def search_hf_models(
        self,
        q: Optional[str] = None,
        sort: str = "downloads",
        limit: int = 20,
    ) -> List[HubModelSearchItem]:
        """Proxy Hugging Face Hub API for GGUF models with in-memory caching."""
        cache_key = f"{q or ''}:{sort}:{limit}"
        now = time.time()

        if cache_key in self._search_cache:
            ts, cached_data = self._search_cache[cache_key]
            if now - ts < self._cache_ttl:
                return cached_data

        hf_sort_map = {
            "downloads": "downloads",
            "likes": "likes",
            "lastModified": "lastModified",
        }
        hf_sort = hf_sort_map.get(sort, "downloads")

        NON_LLM_PIPELINES = {
            "automatic-speech-recognition",
            "text-to-speech",
            "audio-to-audio",
            "text-to-audio",
            "audio-classification",
            "voice-activity-detection",
        }
        AUDIO_KEYWORDS = {"audio", "speech", "asr", "tts", "whisper", "voice"}
        is_audio_query = bool(q and any(k in q.lower() for k in AUDIO_KEYWORDS))

        params = {
            "filter": "gguf",
            "full": "true",
            "sort": hf_sort,
            "direction": "-1",
            "limit": min(limit, 60),
        }
        if q and q.strip():
            params["search"] = q.strip()

        url = "https://huggingface.co/api/models"
        items: List[HubModelSearchItem] = []

        try:
            async with httpx.AsyncClient(timeout=10.0, headers=self._client_headers) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    raw_models = resp.json()
                    for m in raw_models:
                        m_id = m.get("id", "")
                        if not m_id:
                            continue

                        author = m.get("author") or (m_id.split("/")[0] if "/" in m_id else "community")
                        name = m_id.split("/")[-1]
                        tags = m.get("tags", [])
                        pipeline_tag = m.get("pipeline_tag")

                        # 1. Filter out non-text/audio models unless explicitly searched
                        if pipeline_tag in NON_LLM_PIPELINES and not is_audio_query:
                            continue

                        lower_name = name.lower()
                        if not is_audio_query and any(k in lower_name for k in ["-asr", "whisper", "parakeet", "audio.cpp", "piper", "bark"]):
                            continue

                        # 2. Inspect siblings and drop repos with 0 .gguf weights
                        siblings = m.get("siblings") or []
                        gguf_files = [
                            f for f in siblings
                            if isinstance(f, dict) and f.get("rfilename", "").lower().endswith(".gguf")
                        ]
                        gguf_count = len(gguf_files)
                        if gguf_count == 0:
                            continue

                        # 3. Parse parameters and float param_size_b
                        param_str = None
                        param_match = PARAM_REGEX.search(name)
                        if param_match:
                            param_str = param_match.group(1).upper()
                        else:
                            for tag in tags:
                                if tag.endswith("b") and tag[:-1].replace(".", "").isdigit():
                                    param_str = tag.upper()
                                    break

                        param_size_b = None
                        if param_str:
                            try:
                                val_str = param_str.upper().replace("B", "").replace("M", "").strip()
                                val = float(val_str)
                                if "M" in param_str.upper():
                                    param_size_b = round(val / 1000.0, 3)
                                else:
                                    param_size_b = round(val, 2)
                            except Exception:
                                param_size_b = None

                        if param_size_b is None:
                            for tag in tags:
                                m_tag = re.search(r'(?:^|[._/-])(\d+(?:\.\d+)?)[bB](?:$|[._/-])', tag)
                                if m_tag:
                                    try:
                                        param_size_b = float(m_tag.group(1))
                                        if not param_str:
                                            param_str = f"{m_tag.group(1)}B"
                                        break
                                    except Exception:
                                        pass

                        # Parse architecture
                        arch = None
                        config = m.get("config", {}) or {}
                        if isinstance(config, dict) and config.get("architectures"):
                            arch = config["architectures"][0]
                        if not arch:
                            for tag in tags:
                                if tag in ["llama", "qwen2", "gemma", "mistral", "phi3", "deepseek"]:
                                    arch = tag.capitalize()
                                    break

                        context_length = None
                        if isinstance(config, dict) and config.get("max_position_embeddings"):
                            context_length = config["max_position_embeddings"]

                        items.append(
                            HubModelSearchItem(
                                id=m_id,
                                author=author,
                                name=name,
                                downloads=m.get("downloads", 0),
                                likes=m.get("likes", 0),
                                tags=tags[:12],
                                architecture=arch,
                                context_length=context_length,
                                total_params_formatted=param_str,
                                param_size_b=param_size_b,
                                gguf_count=gguf_count,
                                last_modified=m.get("lastModified"),
                                pipeline_tag=pipeline_tag,
                                description=m.get("description"),
                            )
                        )

            self._search_cache[cache_key] = (now, items)
            return items

        except Exception as e:
            logger.error(f"Error searching HuggingFace Hub: {e}")
            if cache_key in self._search_cache:
                return self._search_cache[cache_key][1]
            return []

    async def get_model_files(self, repo_id: str) -> HubModelDetails:
        """Fetch files in HF repository, parse quantizations, and compute VRAM fit."""
        tree_url = f"https://huggingface.co/api/models/{repo_id}/tree/main"
        files: List[HubModelFile] = []
        author = repo_id.split("/")[0] if "/" in repo_id else "community"
        name = repo_id.split("/")[-1]

        vram_info = docker_manager.get_vram_usage()
        total_vram_mb = vram_info.get("total_mb", 4096.0)

        raw_files = []
        try:
            async with httpx.AsyncClient(timeout=12.0, headers=self._client_headers) as client:
                tree_resp = await client.get(tree_url)
                if tree_resp.status_code == 200:
                    raw_files = tree_resp.json()
                elif tree_resp.status_code == 404:
                    # Fallback to model detail endpoint
                    info_resp = await client.get(f"https://huggingface.co/api/models/{repo_id}")
                    if info_resp.status_code == 200:
                        detail = info_resp.json()
                        for s in detail.get("siblings", []):
                            raw_files.append({"type": "file", "path": s.get("rfilename", ""), "size": 0})
        except Exception as e:
            logger.warning(f"Failed to fetch model tree for {repo_id}: {e}")

        for f in raw_files:
            path_str = f.get("path", "")
            if not path_str.lower().endswith(".gguf"):
                continue

            # Skip mmproj files from main quantization listing (can be paired)
            filename = Path(path_str).name
            size_bytes = f.get("size") or f.get("lfs", {}).get("size", 0)

            quant_match = QUANT_REGEX.search(filename)
            quant = quant_match.group(1).upper() if quant_match else "GGUF"

            # Compute VRAM estimate: file size MB * 1.15 (15% KV-cache overhead)
            size_mb = size_bytes / (1024 * 1024)
            vram_est_mb = round(size_mb * 1.15, 1)

            if vram_est_mb <= total_vram_mb * 0.85:
                vram_fit = "fits"
            elif vram_est_mb <= total_vram_mb * 1.05:
                vram_fit = "tight"
            else:
                vram_fit = "too_large"

            download_url = f"https://huggingface.co/{repo_id}/resolve/main/{filename}"

            files.append(
                HubModelFile(
                    filename=filename,
                    size_bytes=size_bytes,
                    size_formatted=format_bytes(size_bytes),
                    quant=quant,
                    vram_estimate_mb=vram_est_mb,
                    vram_fit=vram_fit,
                    download_url=download_url,
                )
            )

        # Sort files by size ascending so user sees accessible models first
        files.sort(key=lambda x: x.size_bytes)

        return HubModelDetails(
            id=repo_id,
            author=author,
            name=name,
            files=files,
        )

    async def start_download(
        self,
        repo_id: str,
        filename: str,
        quant: str,
        provider: str,
    ) -> DownloadStatusItem:
        """Initiate background streaming download for the given provider."""
        prov_norm = provider.lower().replace(".", "").strip()
        download_id = f"dl_{prov_norm}_{uuid.uuid4().hex[:8]}"

        item = DownloadStatusItem(
            download_id=download_id,
            repo_id=repo_id,
            filename=filename,
            quant=quant,
            provider=provider,
            bytes_downloaded=0,
            total_bytes=0,
            progress_pct=0.0,
            speed_mbps=0.0,
            eta_seconds=None,
            status="pending",
        )
        self.downloads[download_id] = item

        task = asyncio.create_task(self._execute_download(item))
        self._active_tasks[download_id] = task
        return item

    async def _execute_download(self, item: DownloadStatusItem):
        prov_norm = item.provider.lower().replace(".", "").strip()
        try:
            if prov_norm == "ollama":
                await self._download_ollama(item)
            else:
                await self._download_file(item)
        except asyncio.CancelledError:
            logger.info(f"Download {item.download_id} cancelled.")
            item.status = "cancelled"
            item.speed_mbps = 0.0
            item.eta_seconds = None
        except Exception as e:
            logger.error(f"Download {item.download_id} failed: {e}")
            item.status = "failed"
            item.error = str(e)
            item.speed_mbps = 0.0
            item.eta_seconds = None
        finally:
            self._active_tasks.pop(item.download_id, None)

    async def _download_ollama(self, item: DownloadStatusItem):
        """Stream pull directly through Ollama using hf.co/{repo_id}:{quant}."""
        ollama_p = get_provider("ollama")
        base_url = await ollama_p._resolve_url()
        ollama_model_name = f"hf.co/{item.repo_id}:{item.quant.lower()}"

        item.status = "downloading"
        pull_url = f"{base_url}/api/pull"
        payload = {"name": ollama_model_name, "stream": True}

        logger.info(f"Starting Ollama pull: {ollama_model_name} from {pull_url}")
        start_time = time.time()
        last_calc_time = start_time
        last_completed = 0

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", pull_url, json=payload) as resp:
                if resp.status_code != 200:
                    err_msg = await resp.aread()
                    raise RuntimeError(f"Ollama pull returned {resp.status_code}: {err_msg.decode('utf-8', errors='ignore')}")

                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    status_msg = data.get("status", "")
                    total = data.get("total", 0)
                    completed = data.get("completed", 0)

                    if total > 0:
                        item.total_bytes = total
                    if completed > 0:
                        item.bytes_downloaded = completed

                    now = time.time()
                    if total > 0 and completed > 0:
                        item.progress_pct = round((completed / total) * 100, 1)

                    if now - last_calc_time >= 0.5:
                        dt = now - last_calc_time
                        if dt > 0:
                            speed = ((completed - last_completed) / dt) / (1024 * 1024)
                            item.speed_mbps = max(0.0, round(speed, 2))
                            if total > completed and speed > 0:
                                rem_mb = (total - completed) / (1024 * 1024)
                                item.eta_seconds = round(rem_mb / speed, 1)
                        last_calc_time = now
                        last_completed = completed

                    if status_msg == "success":
                        item.status = "completed"
                        item.progress_pct = 100.0
                        item.speed_mbps = 0.0
                        item.eta_seconds = 0.0
                        logger.info(f"Ollama pull completed successfully: {ollama_model_name}")
                        return

        # If stream completed
        item.status = "completed"
        item.progress_pct = 100.0
        item.speed_mbps = 0.0
        item.eta_seconds = 0.0

    async def _download_file(self, item: DownloadStatusItem):
        """Async stream download HuggingFace file into models directory with .part renaming."""
        target_dir = self._resolve_models_dir(item.provider)
        final_file = target_dir / item.filename
        part_file = target_dir / f"{item.filename}.part"

        url = f"https://huggingface.co/{item.repo_id}/resolve/main/{item.filename}"
        logger.info(f"Downloading {url} to {part_file}")

        item.status = "downloading"
        start_time = time.time()
        last_calc_time = start_time
        last_bytes = 0
        downloaded = 0

        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=None, headers=self._client_headers) as client:
                async with client.stream("GET", url) as resp:
                    if resp.status_code != 200:
                        raise RuntimeError(f"HuggingFace download failed with HTTP {resp.status_code}")

                    total = int(resp.headers.get("content-length", 0))
                    item.total_bytes = total

                    with open(part_file, "wb") as f:
                        async for chunk in resp.aiter_bytes(chunk_size=512 * 1024):
                            f.write(chunk)
                            downloaded += len(chunk)
                            item.bytes_downloaded = downloaded

                            now = time.time()
                            if total > 0:
                                item.progress_pct = round((downloaded / total) * 100, 1)

                            if now - last_calc_time >= 0.5:
                                dt = now - last_calc_time
                                if dt > 0:
                                    speed = ((downloaded - last_bytes) / dt) / (1024 * 1024)
                                    item.speed_mbps = max(0.0, round(speed, 2))
                                    if total > downloaded and speed > 0:
                                        rem_mb = (total - downloaded) / (1024 * 1024)
                                        item.eta_seconds = round(rem_mb / speed, 1)
                                last_calc_time = now
                                last_bytes = downloaded

            # File fully received, atomic rename
            if part_file.exists():
                part_file.replace(final_file)

            item.status = "completed"
            item.progress_pct = 100.0
            item.speed_mbps = 0.0
            item.eta_seconds = 0.0
            logger.info(f"Download complete: {final_file}")

        except asyncio.CancelledError:
            if part_file.exists():
                part_file.unlink(missing_ok=True)
            raise
        except Exception as e:
            if part_file.exists():
                part_file.unlink(missing_ok=True)
            raise e

    def cancel_download(self, download_id: str) -> bool:
        """Cancel an active download and clean up temp files."""
        if download_id in self._active_tasks:
            self._active_tasks[download_id].cancel()
        if download_id in self.downloads:
            item = self.downloads[download_id]
            item.status = "cancelled"
            item.speed_mbps = 0.0
            item.eta_seconds = None

            # Clean up part file if exists
            target_dir = self._resolve_models_dir(item.provider)
            part_file = target_dir / f"{item.filename}.part"
            if part_file.exists():
                part_file.unlink(missing_ok=True)
            return True
        return False

    async def stream_download_status(self) -> AsyncGenerator[str, None]:
        """SSE generator emitting list of all downloads every 500ms."""
        while True:
            items = list(self.downloads.values())
            data = [i.model_dump() for i in items]
            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(0.5)


hub_service = HubService()
