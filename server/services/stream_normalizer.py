import json
import logging
import re
import time
from typing import AsyncGenerator, Dict, Any, Optional, Tuple, List
from schemas.chat_schemas import AttachmentInput, ChatMessageInput

logger = logging.getLogger("kultura.normalizer")


from services.context_manager import prepare_cross_model_context


def build_provider_payload(
    messages: List[ChatMessageInput],
    model: str,
    provider: str = "ollama",
    system_prompt: Optional[str] = None,
    grounding_block: Optional[str] = None,
    enable_thinking: bool = True,
    reasoning_budget: Optional[int] = None,
    temperature: float = 0.7,
    repeat_penalty: float = 1.1,
    max_tokens: int = 1024,
    num_ctx: int = 2048,
) -> Dict[str, Any]:
    """
    Normalizes chat messages into OpenAI-compatible payload with cross-model context handoff:
    - Strips previous model's reasoning/thought traces
    - Normalizes roles to strict alternation (system -> user -> assistant)
    - Injects grounding search results block if present
    - Enforces sliding window against num_ctx
    """
    # Convert input messages to dict representations
    raw_msgs = []
    for m in messages:
        if isinstance(m, dict):
            raw_msgs.append(dict(m))
        else:
            raw_msgs.append({
                "role": m.role,
                "content": m.content,
                "attachments": [
                    {
                        "id": getattr(a, "id", ""),
                        "name": getattr(a, "name", ""),
                        "type": getattr(a, "type", ""),
                        "data": getattr(a, "data", ""),
                    }
                    for a in (m.attachments or [])
                ] if m.attachments else None
            })

    # Default generous context and token headroom when thinking is enabled
    effective_max_tokens = max(max_tokens, 4096) if enable_thinking else max_tokens
    effective_num_ctx = max(num_ctx, 8192) if enable_thinking else num_ctx

    # Prepare normalized, thought-stripped, sliding-window context with cognitive protocol
    context_msgs = prepare_cross_model_context(
        messages=raw_msgs,
        system_prompt=system_prompt,
        grounding_block=grounding_block,
        enable_thinking=enable_thinking,
        num_ctx=effective_num_ctx,
    )

    formatted_messages: List[Dict[str, Any]] = []
    for msg in context_msgs:
        # Check if message has image attachments
        image_attachments = [
            att for att in (msg.get("attachments") or [])
            if att.get("data") and (att.get("type", "").startswith("image/") or att.get("data", "").startswith("data:image"))
        ]

        if image_attachments:
            content_parts: List[Dict[str, Any]] = []
            if msg.get("content"):
                content_parts.append({"type": "text", "text": msg["content"]})

            for att in image_attachments:
                data_val = att.get("data", "")
                url_val = data_val if data_val.startswith("data:") else f"data:{att.get('type')};base64,{data_val}"
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": url_val}
                })

            formatted_messages.append({
                "role": msg.get("role", "user"),
                "content": content_parts
            })
        else:
            formatted_messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })

    # If reasoning_budget is set and max_tokens <= reasoning_budget,
    # bump max_tokens so the model always has room for the answer after thinking.
    if enable_thinking and reasoning_budget and reasoning_budget > 0:
        if effective_max_tokens <= reasoning_budget:
            effective_max_tokens = reasoning_budget + 1024

    stop_tokens = [
        "<|im_end|>",
        "<|endoftext|>",
        "### Reference Information",
        "### Reference Information:",
        "User Question:",
        "<search_results>",
        "</search_results>",
        "<grounding_instructions>",
        "</grounding_instructions>",
    ]

    payload: Dict[str, Any] = {
        "model": model,
        "messages": formatted_messages,
        "temperature": temperature,
        "max_tokens": effective_max_tokens,
        "repeat_penalty": repeat_penalty,
        "presence_penalty": 0.1,
        "frequency_penalty": 0.1,
        "stream": True,
        "stop": stop_tokens,
        "options": {
            "num_ctx": effective_num_ctx,
            "num_predict": effective_max_tokens,
            "temperature": temperature,
            "repeat_penalty": repeat_penalty,
            "stop": stop_tokens,
        },
    }

    # 2. Thinking / Reasoning configuration per provider
    if not enable_thinking or (reasoning_budget is not None and reasoning_budget == 0):
        # Disable thinking across engines
        if provider in ("llamacpp", "koboldcpp"):
            payload["chat_template_kwargs"] = {"enable_thinking": False}
            payload["reasoning_budget"] = 0
        elif provider == "ollama":
            payload["think"] = False
            payload["options"]["think"] = False
    else:
        # Enable unconstrained or budgeted thinking
        if provider in ("llamacpp", "koboldcpp"):
            payload["chat_template_kwargs"] = {"enable_thinking": True}
            if reasoning_budget and reasoning_budget > 0:
                payload["reasoning_budget"] = reasoning_budget
        elif provider == "ollama":
            payload["think"] = True

    return payload


PROMPT_LEAK_REGEX = re.compile(
    r"^[\s\n]*(?:<search_results[\s\S]*?</search_results>|<grounding_instructions>[\s\S]*?</grounding_instructions>|"
    r"### Reference Information[\s\S]*?User Question:\s*|User Question:\s*)",
    re.IGNORECASE,
)


class StreamNormalizer:
    """
    Normalizes divergent SSE outputs across Ollama, llama.cpp, KoboldCpp, LM Studio, and Jan.
    Separates reasoning_content and inline <think> tags into distinct SSE events.
    Calculates live TTFT and tokens/sec telemetry.
    """

    def __init__(self, provider: str, model: str):
        self.provider = provider
        self.model = model
        self.start_time = time.perf_counter()
        self.first_token_time: Optional[float] = None
        self.ttft_ms: float = 0.0

        self.full_content: List[str] = []
        self.full_thinking: List[str] = []
        self.thinking_duration_ms: int = 0
        self.thinking_start_time: Optional[float] = None

        self.in_think_tag: bool = False
        self.partial_tag_buffer: str = ""

        self.in_prompt_leakage: bool = False
        self.leakage_buffer: str = ""

        self.thinking_tokens: int = 0
        self.completion_tokens: int = 0
        self.prompt_tokens: int = 0

    def _estimate_tokens(self, text: str) -> int:
        if not text:
            return 0
        # Standard heuristic ~ 1 token per 3.8 chars or word count based
        return max(1, int(len(text) / 3.8))

    def _filter_leakage(self, text: str) -> str:
        if not text:
            return ""
        if not self.full_content:
            text = PROMPT_LEAK_REGEX.sub("", text)
            text = re.sub(
                r"^[\s\n]*(?:<search_results[^>]*>|<grounding_instructions>|### Reference Information[^\n]*|User Question:)",
                "",
                text,
                flags=re.IGNORECASE,
            ).lstrip()
        return text

    async def normalize_stream(
        self, raw_stream: AsyncGenerator[str, None]
    ) -> AsyncGenerator[Tuple[str, str, Dict[str, Any]], None]:
        """
        Yields (event_name, data_json_string, metrics_snapshot)
        Handles per-chunk streaming, thinking separation, timeout safety, and token limits.
        """
        import httpx
        import asyncio

        try:
            async for raw_line in raw_stream:
                line = raw_line.strip()
                if not line:
                    continue

                if line.startswith("data:"):
                    data_str = line[5:].strip()
                else:
                    data_str = line

                if data_str == "[DONE]":
                    break

                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                # Record TTFT on first chunk with tokens
                now = time.perf_counter()
                if self.first_token_time is None:
                    self.first_token_time = now
                    self.ttft_ms = round((now - self.start_time) * 1000, 2)

                # Check provider usage if provided
                usage = chunk.get("usage")
                if usage:
                    self.prompt_tokens = usage.get("prompt_tokens", self.prompt_tokens)
                    self.completion_tokens = usage.get("completion_tokens", self.completion_tokens)

                choices = chunk.get("choices", [])
                if not choices:
                    continue

                # Guard: Detect if model reached max token limit while still inside thinking tags
                finish_reason = choices[0].get("finish_reason")
                if finish_reason in ("length", "max_tokens"):
                    if self.in_think_tag:
                        self.in_think_tag = False
                    if not self.full_content:
                        notice = (
                            "\n\n⚠️ Model reached its token limit while thinking and did not produce a final answer. "
                            "Try switching to ⚡ Fast mode or lowering the Think budget."
                        )
                        self.full_content.append(notice)
                        metrics_snap = self.get_metrics_snapshot()
                        yield ("content", json.dumps({"chunk": notice, "metrics": metrics_snap}), metrics_snap)
                    break

                delta = choices[0].get("delta", {})

                # 1. Check native reasoning / reasoning_content / thinking fields (Ollama/llama.cpp/DeepSeek)
                reasoning = delta.get("reasoning") or delta.get("reasoning_content") or delta.get("thinking")
                if reasoning:
                    if self.thinking_start_time is None:
                        self.thinking_start_time = now
                    self.full_thinking.append(reasoning)
                    self.thinking_tokens += self._estimate_tokens(reasoning)
                    elapsed_thinking = int((now - self.thinking_start_time) * 1000)
                    self.thinking_duration_ms = elapsed_thinking

                    metrics_snap = self.get_metrics_snapshot()
                    yield (
                        "thinking",
                        json.dumps({"chunk": reasoning, "duration_ms": elapsed_thinking, "metrics": metrics_snap}),
                        metrics_snap,
                    )

                # 2. Check delta.content and handle inline <think>...</think>
                content = delta.get("content")
                if content:
                    # Process string through <think> parser
                    combined = self.partial_tag_buffer + content
                    self.partial_tag_buffer = ""

                    # Detect and intercept prompt template echo (<search_results>, <grounding_instructions>, User Question:)
                    if not self.full_content and not self.in_prompt_leakage:
                        if re.search(r"^\s*(?:<search_results|### Reference Information|<grounding_instructions|User Question:)", combined, re.IGNORECASE):
                            self.in_prompt_leakage = True

                    if self.in_prompt_leakage:
                        self.leakage_buffer += combined
                        combined = ""
                        m = re.search(
                            r"(?:</grounding_instructions>\s*(?:User Question:[^\n]*\n?)?|User Question:[^\n]*\n|### Reference Information[\s\S]*?User Question:[^\n]*\n)",
                            self.leakage_buffer,
                            re.IGNORECASE,
                        )
                        if m:
                            combined = self.leakage_buffer[m.end():]
                            self.leakage_buffer = ""
                            self.in_prompt_leakage = False
                        else:
                            continue

                    OPEN_TAG_PREFIXES = ("<think", "<thin", "<thi", "<th", "<t", "<")
                    CLOSE_TAG_PREFIXES = ("</think", "</thin", "</thi", "</th", "</t", "</", "<")

                    while combined:
                        if not self.in_think_tag:
                            if "<think>" in combined:
                                before, after = combined.split("<think>", 1)
                                before = self._filter_leakage(before)
                                if before:
                                    self.full_content.append(before)
                                    self.completion_tokens += self._estimate_tokens(before)
                                    metrics_snap = self.get_metrics_snapshot()
                                    yield ("content", json.dumps({"chunk": before, "metrics": metrics_snap}), metrics_snap)

                                self.in_think_tag = True
                                if self.thinking_start_time is None:
                                    self.thinking_start_time = now
                                combined = after
                            elif any(combined.endswith(p) for p in OPEN_TAG_PREFIXES):
                                matched_p = next(p for p in OPEN_TAG_PREFIXES if combined.endswith(p))
                                idx = len(combined) - len(matched_p)
                                self.partial_tag_buffer = combined[idx:]
                                regular = self._filter_leakage(combined[:idx])
                                if regular:
                                    self.full_content.append(regular)
                                    self.completion_tokens += self._estimate_tokens(regular)
                                    metrics_snap = self.get_metrics_snapshot()
                                    yield ("content", json.dumps({"chunk": regular, "metrics": metrics_snap}), metrics_snap)
                                break
                            else:
                                regular = self._filter_leakage(combined)
                                if regular:
                                    self.full_content.append(regular)
                                    self.completion_tokens += self._estimate_tokens(regular)
                                    metrics_snap = self.get_metrics_snapshot()
                                    yield ("content", json.dumps({"chunk": regular, "metrics": metrics_snap}), metrics_snap)
                                combined = ""
                        else:
                            if "</think>" in combined:
                                thought, after = combined.split("</think>", 1)
                                if thought:
                                    self.full_thinking.append(thought)
                                    self.thinking_tokens += self._estimate_tokens(thought)
                                    elapsed_thinking = int((now - (self.thinking_start_time or now)) * 1000)
                                    self.thinking_duration_ms = elapsed_thinking
                                    metrics_snap = self.get_metrics_snapshot()
                                    yield (
                                        "thinking",
                                        json.dumps({"chunk": thought, "duration_ms": elapsed_thinking, "metrics": metrics_snap}),
                                        metrics_snap,
                                    )
                                self.in_think_tag = False
                                combined = after
                            elif any(combined.endswith(p) for p in CLOSE_TAG_PREFIXES):
                                matched_p = next(p for p in CLOSE_TAG_PREFIXES if combined.endswith(p))
                                idx = len(combined) - len(matched_p)
                                self.partial_tag_buffer = combined[idx:]
                                thought = combined[:idx]
                                if thought:
                                    self.full_thinking.append(thought)
                                    self.thinking_tokens += self._estimate_tokens(thought)
                                    elapsed_thinking = int((now - (self.thinking_start_time or now)) * 1000)
                                    self.thinking_duration_ms = elapsed_thinking
                                    metrics_snap = self.get_metrics_snapshot()
                                    yield (
                                        "thinking",
                                        json.dumps({"chunk": thought, "duration_ms": elapsed_thinking, "metrics": metrics_snap}),
                                        metrics_snap,
                                    )
                                break
                            else:
                                self.full_thinking.append(combined)
                                self.thinking_tokens += self._estimate_tokens(combined)
                                elapsed_thinking = int((now - (self.thinking_start_time or now)) * 1000)
                                self.thinking_duration_ms = elapsed_thinking
                                metrics_snap = self.get_metrics_snapshot()
                                yield (
                                    "thinking",
                                    json.dumps({"chunk": combined, "duration_ms": elapsed_thinking, "metrics": metrics_snap}),
                                    metrics_snap,
                                )
                                combined = ""

            # Flush any trailing buffered characters
            if self.partial_tag_buffer:
                metrics_snap = self.get_metrics_snapshot()
                if self.in_think_tag:
                    self.full_thinking.append(self.partial_tag_buffer)
                    yield (
                        "thinking",
                        json.dumps({"chunk": self.partial_tag_buffer, "duration_ms": self.thinking_duration_ms, "metrics": metrics_snap}),
                        metrics_snap,
                    )
                else:
                    self.full_content.append(self.partial_tag_buffer)
                    yield ("content", json.dumps({"chunk": self.partial_tag_buffer, "metrics": metrics_snap}), metrics_snap)
                self.partial_tag_buffer = ""

            # If the stream ended while still in think tag (KoboldCpp or EOF before </think>)
            if self.in_think_tag:
                self.in_think_tag = False

            # If the model produced NO answer content (only thought tokens or empty response)
            if not self.full_content:
                if self.thinking_tokens > 0 or self.full_thinking:
                    fallback_msg = (
                        "\n\n⚠️ Model reached its token limit while thinking and did not produce a final answer. "
                        "Try switching to ⚡ Fast mode or lowering the Think budget."
                    )
                else:
                    fallback_msg = (
                        "\n\n⚠️ Upstream engine returned an empty response. Please verify the model is loaded and try again."
                    )
                self.full_content.append(fallback_msg)
                metrics_snap = self.get_metrics_snapshot()
                yield ("content", json.dumps({"chunk": fallback_msg, "metrics": metrics_snap}), metrics_snap)

        except httpx.ReadTimeout:
            logger.warning("Upstream LLM engine read timeout (no tokens received for 60s).")
            timeout_msg = "\n\n[Generation timed out: No tokens received from engine for 60 seconds.]"
            self.full_content.append(timeout_msg)
            self.in_think_tag = False
            metrics_snap = self.get_metrics_snapshot()
            yield ("content", json.dumps({"chunk": timeout_msg, "metrics": metrics_snap}), metrics_snap)
        except asyncio.CancelledError:
            logger.info("Chat stream was cancelled by client abort.")
            self.in_think_tag = False
            raise
        except Exception as e:
            logger.error(f"Error during stream normalization: {e}")
            err_msg = f"\n\n[Stream interrupted: {str(e)}]"
            self.full_content.append(err_msg)
            self.in_think_tag = False
            metrics_snap = self.get_metrics_snapshot()
            yield ("content", json.dumps({"chunk": err_msg, "metrics": metrics_snap}), metrics_snap)

    def get_metrics_snapshot(self) -> Dict[str, Any]:
        now = time.perf_counter()
        total_duration = now - self.start_time
        gen_duration = now - (self.first_token_time or now)

        total_generated = self.completion_tokens + self.thinking_tokens
        tok_per_sec = round(total_generated / max(gen_duration, 0.05), 1) if total_generated > 0 else 0.0

        return {
            "provider": self.provider,
            "model": self.model,
            "prompt_tokens": self.prompt_tokens,
            "thinking_tokens": self.thinking_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.prompt_tokens + total_generated,
            "tokens_per_sec": tok_per_sec,
            "ttft_ms": self.ttft_ms,
            "total_duration_ms": round(total_duration * 1000, 1),
            "thinking_duration_ms": self.thinking_duration_ms,
        }
