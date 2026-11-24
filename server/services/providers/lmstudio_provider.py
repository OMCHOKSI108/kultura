import asyncio
import logging
from typing import List, Optional, AsyncGenerator, Dict, Any
import httpx

from config import settings
from schemas.provider_schemas import ModelInfo
from services.providers.base import BaseProvider

logger = logging.getLogger("kultura.provider.lmstudio")


class LMStudioProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "lmstudio"

    @property
    def display_name(self) -> str:
        return "LM Studio"

    @property
    def is_container(self) -> bool:
        return False

    def get_base_url(self) -> str:
        return settings.LMSTUDIO_BASE_URL

    async def _resolve_url(self) -> str:
        for url in [settings.LMSTUDIO_BASE_URL, settings.LOCAL_LMSTUDIO_URL]:
            try:
                async with httpx.AsyncClient(timeout=1.0) as client:
                    resp = await client.get(f"{url}/v1/models")
                    if resp.status_code == 200:
                        return url
            except Exception:
                pass
        return settings.LMSTUDIO_BASE_URL

    async def check_health(self) -> bool:
        for url in [settings.LMSTUDIO_BASE_URL, settings.LOCAL_LMSTUDIO_URL]:
            try:
                async with httpx.AsyncClient(timeout=1.0) as client:
                    resp = await client.get(f"{url}/v1/models")
                    if resp.status_code == 200:
                        return True
            except Exception:
                pass
        return False

    async def list_models(self) -> List[ModelInfo]:
        models: List[ModelInfo] = []
        base_url = await self._resolve_url()
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(f"{base_url}/v1/models")
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data.get("data", []):
                        m_id = item.get("id", "")
                        models.append(
                            ModelInfo(
                                id=m_id,
                                name=m_id,
                                provider=self.name,
                                format="gguf",
                                is_active=True,
                            )
                        )
        except Exception as e:
            logger.debug(f"LM Studio models query failed: {e}")

        return models

    async def unload(self, model: Optional[str] = None) -> bool:
        if not await self.check_health():
            return True
        base_url = await self._resolve_url()
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                logger.info("Requesting LM Studio model unload via /api/v0/models/unload...")
                payload = {"model": model} if model else {}
                resp = await client.post(f"{base_url}/api/v0/models/unload", json=payload)
                return resp.status_code in [200, 204]
        except Exception as e:
            logger.debug(f"LM Studio unload notice: {e}")
            return False

    async def load(self, model: str, mmproj: Optional[str] = None) -> AsyncGenerator[Dict[str, str], None]:
        yield {"step": "starting_container", "message": "Connecting to LM Studio host bridge..."}
        if not await self.check_health():
            yield {"step": "error", "message": "LM Studio is not reachable on port 1234. Please start LM Studio local server."}
            return

        yield {"step": "loading_weights_to_vram", "message": f"Triggering LM Studio load for {model}..."}
        base_url = await self._resolve_url()
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                await client.post(f"{base_url}/api/v0/models/load", json={"model": model})
        except Exception:
            pass

        yield {"step": "ready", "message": f"LM Studio model {model} ready"}

    async def chat_completion_stream(self, payload: Dict[str, Any]) -> AsyncGenerator[str, None]:
        base_url = await self._resolve_url()
        url = f"{base_url}/v1/chat/completions"
        stream_timeout = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)
        async with httpx.AsyncClient(timeout=stream_timeout) as client:
            async with client.stream("POST", url, json=payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    yield f"data: {{\"error\": \"LM Studio error: {err_body.decode('utf-8', errors='ignore')}\"}}\n\n"
                    return
                async for line in response.aiter_lines():
                    if line:
                        yield f"{line}\n"
