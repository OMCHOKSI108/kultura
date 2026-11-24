import asyncio
import logging
from typing import List, Optional, AsyncGenerator, Dict, Any
import httpx

from config import settings
from schemas.provider_schemas import ModelInfo
from services.docker_manager import docker_manager
from services.providers.base import BaseProvider

logger = logging.getLogger("kultura.provider.ollama")


class OllamaProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "ollama"

    @property
    def display_name(self) -> str:
        return "Ollama"

    @property
    def is_container(self) -> bool:
        return True

    @property
    def container_name(self) -> Optional[str]:
        return "kultura-ollama"

    def get_base_url(self) -> str:
        # Check docker network url vs localhost
        return settings.OLLAMA_BASE_URL

    async def _resolve_url(self) -> str:
        for url in ["http://host.docker.internal:11434", settings.LOCAL_OLLAMA_URL, settings.OLLAMA_BASE_URL]:
            try:
                async with httpx.AsyncClient(timeout=1.5) as client:
                    resp = await client.get(f"{url}/api/version")
                    if resp.status_code == 200:
                        return url
            except Exception:
                pass
        return settings.OLLAMA_BASE_URL

    async def check_health(self) -> bool:
        for url in ["http://host.docker.internal:11434", settings.LOCAL_OLLAMA_URL, settings.OLLAMA_BASE_URL]:
            try:
                async with httpx.AsyncClient(timeout=1.5) as client:
                    resp = await client.get(f"{url}/api/version")
                    if resp.status_code == 200:
                        return True
            except Exception:
                pass
        return False

    async def list_models(self) -> List[ModelInfo]:
        models = []
        base_url = await self._resolve_url()
        active_models = set()

        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                # Check currently running/loaded models in VRAM
                try:
                    ps_resp = await client.get(f"{base_url}/api/ps")
                    if ps_resp.status_code == 200:
                        data = ps_resp.json()
                        for m in data.get("models", []):
                            active_models.add(m.get("name"))
                except Exception:
                    pass

                # List tags
                resp = await client.get(f"{base_url}/api/tags")
                if resp.status_code == 200:
                    for m in resp.json().get("models", []):
                        name = m.get("name", "")
                        models.append(
                            ModelInfo(
                                id=name,
                                name=name,
                                provider=self.name,
                                size_bytes=m.get("size"),
                                format="ollama",
                                is_active=name in active_models,
                            )
                        )
        except Exception as e:
            logger.debug(f"Failed to query Ollama tags: {e}")

        return models

    async def unload(self, model: Optional[str] = None) -> bool:
        base_url = await self._resolve_url()
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Fetch all loaded models if not specified
                targets = [model] if model else []
                if not targets:
                    ps = await client.get(f"{base_url}/api/ps")
                    if ps.status_code == 200:
                        targets = [m.get("name") for m in ps.json().get("models", [])]

                for target in targets:
                    if target:
                        logger.info(f"Unloading Ollama model: {target} (keep_alive=0)")
                        await client.post(
                            f"{base_url}/api/generate",
                            json={"model": target, "keep_alive": 0},
                        )
            return True
        except Exception as e:
            logger.warning(f"Failed to unload Ollama model: {e}")
            return False

    async def load(self, model: str, mmproj: Optional[str] = None) -> AsyncGenerator[Dict[str, str], None]:
        # Step 1: Ensure container is running if docker is available
        status = docker_manager.get_container_status(self.container_name)
        if not status.get("running"):
            yield {"step": "starting_container", "message": f"Starting {self.display_name} container..."}
            await docker_manager.start_container(self.container_name)
            # Wait for service to become responsive
            for _ in range(30):
                if await self.check_health():
                    break
                await asyncio.sleep(0.5)

        base_url = await self._resolve_url()
        yield {"step": "loading_weights_to_vram", "message": f"Loading {model} weights into GPU VRAM..."}

        # Step 2: Trigger preload with 10m keep_alive
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{base_url}/api/generate",
                    json={"model": model, "keep_alive": "10m"},
                )
                if resp.status_code == 200:
                    yield {"step": "ready", "message": f"{model} is ready in VRAM"}
                    return
        except Exception as e:
            logger.error(f"Error loading model in Ollama: {e}")

        yield {"step": "ready", "message": f"Preload complete for {model}"}

    async def chat_completion_stream(self, payload: Dict[str, Any]) -> AsyncGenerator[str, None]:
        import json
        base_url = await self._resolve_url()
        url = f"{base_url}/api/chat"
        stream_timeout = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)

        # Build native Ollama chat payload to strictly honor "think": False/True
        ollama_payload: Dict[str, Any] = {
            "model": payload.get("model"),
            "messages": payload.get("messages", []),
            "stream": True,
            "options": payload.get("options", {}),
        }
        if "think" in payload:
            ollama_payload["think"] = payload["think"]

        async with httpx.AsyncClient(timeout=stream_timeout) as client:
            async with client.stream("POST", url, json=ollama_payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    yield f"data: {{\"error\": \"Ollama error: {err_body.decode('utf-8', errors='ignore')}\"}}\n\n"
                    return

                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                        msg = chunk.get("message", {})
                        thinking_chunk = msg.get("thinking")
                        content_chunk = msg.get("content")
                        delta: Dict[str, Any] = {}
                        if thinking_chunk:
                            delta["reasoning"] = thinking_chunk
                        if content_chunk:
                            delta["content"] = content_chunk

                        openai_chunk: Dict[str, Any] = {
                            "choices": [
                                {
                                    "delta": delta,
                                    "finish_reason": "stop" if chunk.get("done") else None,
                                }
                            ]
                        }
                        if chunk.get("done"):
                            openai_chunk["usage"] = {
                                "prompt_tokens": chunk.get("prompt_eval_count", 0),
                                "completion_tokens": chunk.get("eval_count", 0),
                            }
                        yield f"data: {json.dumps(openai_chunk)}\n\n"
                    except Exception:
                        continue

                yield "data: [DONE]\n\n"
