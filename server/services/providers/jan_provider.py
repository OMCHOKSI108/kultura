import asyncio
import logging
from typing import List, Optional, AsyncGenerator, Dict, Any
import httpx

from config import settings
from schemas.provider_schemas import ModelInfo
from services.providers.base import BaseProvider

logger = logging.getLogger("kultura.provider.jan")


class JanProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "jan"

    @property
    def display_name(self) -> str:
        return "Jan"

    @property
    def is_container(self) -> bool:
        return False

    def get_base_url(self) -> str:
        return settings.JAN_BASE_URL

    async def _resolve_url(self) -> str:
        for url in [settings.JAN_BASE_URL, settings.LOCAL_JAN_URL]:
            try:
                async with httpx.AsyncClient(timeout=1.0) as client:
                    resp = await client.get(f"{url}/v1/models")
                    if resp.status_code == 200:
                        return url
            except Exception:
                pass
        return settings.JAN_BASE_URL

    async def check_health(self) -> bool:
        for url in [settings.JAN_BASE_URL, settings.LOCAL_JAN_URL]:
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
            logger.debug(f"Jan models query failed: {e}")

        return models

    async def unload(self, model: Optional[str] = None) -> bool:
        if not await self.check_health():
            return True
        base_url = await self._resolve_url()
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                logger.info("Requesting Jan model unload...")
                if model:
                    await client.post(f"{base_url}/v1/models/{model}/unload")
                return True
        except Exception as e:
            logger.debug(f"Jan unload notice: {e}")
            return False

    async def load(self, model: str, mmproj: Optional[str] = None) -> AsyncGenerator[Dict[str, str], None]:
        yield {"step": "starting_container", "message": "Connecting to Jan local service..."}
        if not await self.check_health():
            yield {"step": "error", "message": "Jan is not reachable on port 1337. Please ensure Jan local server is running."}
            return

        yield {"step": "loading_weights_to_vram", "message": f"Instructing Jan engine to load {model}..."}
        base_url = await self._resolve_url()
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                await client.post(f"{base_url}/v1/models/{model}/load")
        except Exception:
            pass

        yield {"step": "ready", "message": f"Jan model {model} ready"}

    async def chat_completion_stream(self, payload: Dict[str, Any]) -> AsyncGenerator[str, None]:
        base_url = await self._resolve_url()
        url = f"{base_url}/v1/chat/completions"
        stream_timeout = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)
        async with httpx.AsyncClient(timeout=stream_timeout) as client:
            async with client.stream("POST", url, json=payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    yield f"data: {{\"error\": \"Jan error: {err_body.decode('utf-8', errors='ignore')}\"}}\n\n"
                    return
                async for line in response.aiter_lines():
                    if line:
                        yield f"{line}\n"
