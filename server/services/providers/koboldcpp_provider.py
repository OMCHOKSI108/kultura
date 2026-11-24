import asyncio
import logging
from pathlib import Path
from typing import List, Optional, AsyncGenerator, Dict, Any
import httpx

from config import settings
from schemas.provider_schemas import ModelInfo
from services.docker_manager import docker_manager
from services.providers.base import BaseProvider

logger = logging.getLogger("kultura.provider.koboldcpp")


class KoboldCppProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "koboldcpp"

    @property
    def display_name(self) -> str:
        return "KoboldCpp"

    @property
    def is_container(self) -> bool:
        return True

    @property
    def container_name(self) -> Optional[str]:
        return "kultura-koboldcpp"

    def get_base_url(self) -> str:
        return settings.KOBOLDCPP_BASE_URL

    async def _resolve_url(self) -> str:
        candidates = ["http://kultura-koboldcpp:5001", "http://koboldcpp:5001", settings.KOBOLDCPP_BASE_URL, settings.LOCAL_KOBOLDCPP_URL]
        for url in candidates:
            try:
                async with httpx.AsyncClient(timeout=1.0) as client:
                    resp = await client.get(f"{url}/health")
                    if resp.status_code == 200:
                        return url
                    resp2 = await client.get(f"{url}/api/v1/model")
                    if resp2.status_code == 200:
                        return url
            except Exception:
                pass
        return settings.KOBOLDCPP_BASE_URL

    async def check_health(self) -> bool:
        candidates = ["http://kultura-koboldcpp:5001", "http://koboldcpp:5001", settings.KOBOLDCPP_BASE_URL, settings.LOCAL_KOBOLDCPP_URL]
        for url in candidates:
            try:
                async with httpx.AsyncClient(timeout=1.0) as client:
                    resp = await client.get(f"{url}/health")
                    if resp.status_code == 200:
                        return True
                    resp2 = await client.get(f"{url}/api/v1/model")
                    if resp2.status_code == 200:
                        return True
            except Exception:
                pass
        return False

    async def list_models(self) -> List[ModelInfo]:
        """Scans /models for .gguf files."""
        models: List[ModelInfo] = []
        models_dir = Path(settings.MODELS_DIR) if Path(settings.MODELS_DIR).exists() else Path("./models").resolve()

        if models_dir.exists():
            for f in models_dir.glob("*.gguf"):
                if ".part" in f.name.lower() or f.name.endswith(".tmp") or f.name.startswith("."):
                    continue
                if "mmproj" in f.name.lower():
                    continue
                models.append(
                    ModelInfo(
                        id=f.name,
                        name=f.name,
                        provider=self.name,
                        size_bytes=f.stat().st_size,
                        format="gguf",
                        is_active=False,
                    )
                )

        status = docker_manager.get_container_status(self.container_name)
        if status.get("running"):
            try:
                base_url = await self._resolve_url()
                async with httpx.AsyncClient(timeout=1.5) as client:
                    resp = await client.get(f"{base_url}/api/v1/model")
                    if resp.status_code == 200:
                        current_model = resp.json().get("result", "")
                        for m in models:
                            if m.name in current_model:
                                m.is_active = True
            except Exception:
                pass

        return models

    async def unload(self, model: Optional[str] = None) -> bool:
        logger.info("Stopping koboldcpp container to free VRAM...")
        return await docker_manager.stop_container(self.container_name)

    async def load(self, model: str, mmproj: Optional[str] = None) -> AsyncGenerator[Dict[str, str], None]:
        models_dir = Path(settings.MODELS_DIR)
        model_path = models_dir / model
        if not model_path.exists():
            yield {"step": "error", "message": f"Model '{model}' not found in {settings.MODELS_DIR}. Place .gguf in ./models."}
            return

        yield {"step": "starting_container", "message": f"Starting KoboldCpp container with {model}..."}
        success = await docker_manager.restart_koboldcpp_with_model(model, mmproj)
        if not success:
            yield {"step": "error", "message": f"Failed to start {self.container_name}"}
            return

        yield {"step": "loading_weights_to_vram", "message": "Allocating CuBLAS layers in VRAM..."}
        ready = False
        for _ in range(60):
            await asyncio.sleep(1.0)
            if await self.check_health():
                ready = True
                break

        yield {"step": "ready", "message": f"KoboldCpp loaded {model} successfully"}

    async def chat_completion_stream(self, payload: Dict[str, Any]) -> AsyncGenerator[str, None]:
        base_url = await self._resolve_url()
        url = f"{base_url}/v1/chat/completions"
        stream_timeout = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)
        async with httpx.AsyncClient(timeout=stream_timeout) as client:
            async with client.stream("POST", url, json=payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    yield f"data: {{\"error\": \"KoboldCpp error: {err_body.decode('utf-8', errors='ignore')}\"}}\n\n"
                    return
                async for line in response.aiter_lines():
                    if line:
                        yield f"{line}\n"
