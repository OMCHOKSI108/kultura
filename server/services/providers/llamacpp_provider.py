import asyncio
import logging
import os
from pathlib import Path
from typing import List, Optional, AsyncGenerator, Dict, Any
import httpx

from config import settings
from schemas.provider_schemas import ModelInfo
from services.docker_manager import docker_manager
from services.providers.base import BaseProvider

logger = logging.getLogger("kultura.provider.llamacpp")


class LlamaCppProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "llamacpp"

    @property
    def display_name(self) -> str:
        return "llama.cpp"

    @property
    def is_container(self) -> bool:
        return True

    @property
    def container_name(self) -> Optional[str]:
        return "kultura-llamacpp"

    def get_base_url(self) -> str:
        return settings.LLAMACPP_BASE_URL

    async def _resolve_url(self) -> str:
        candidates = ["http://kultura-llamacpp:8080", "http://llamacpp:8080", settings.LLAMACPP_BASE_URL, settings.LOCAL_LLAMACPP_URL]
        for url in candidates:
            try:
                async with httpx.AsyncClient(timeout=1.0) as client:
                    resp = await client.get(f"{url}/health")
                    if resp.status_code == 200:
                        return url
            except Exception:
                pass
        return settings.LLAMACPP_BASE_URL

    async def check_health(self) -> bool:
        candidates = ["http://kultura-llamacpp:8080", "http://llamacpp:8080", settings.LLAMACPP_BASE_URL, settings.LOCAL_LLAMACPP_URL]
        for url in candidates:
            try:
                async with httpx.AsyncClient(timeout=1.0) as client:
                    resp = await client.get(f"{url}/health")
                    if resp.status_code == 200 and resp.json().get("status") in ["ok", "loading model"]:
                        return True
            except Exception:
                pass
        return False

    async def list_models(self) -> List[ModelInfo]:
        """Scans shared models directory for .gguf files so models are discoverable even when stopped."""
        models: List[ModelInfo] = []
        models_dir = Path(settings.MODELS_DIR) if Path(settings.MODELS_DIR).exists() else Path("./models").resolve()

        # First, scan filesystem
        mmproj_files = []
        if models_dir.exists():
            for f in models_dir.glob("*.gguf"):
                if ".part" in f.name.lower() or f.name.endswith(".tmp") or f.name.startswith("."):
                    continue
                if "mmproj" in f.name.lower():
                    mmproj_files.append(f.name)

            for f in models_dir.glob("*.gguf"):
                if ".part" in f.name.lower() or f.name.endswith(".tmp") or f.name.startswith("."):
                    continue
                if "mmproj" in f.name.lower():
                    continue

                # Find matching mmproj if any
                matching_mmproj = None
                base_stem = f.stem.split(".")[0].lower()
                for mm in mmproj_files:
                    if base_stem in mm.lower() or "mmproj" in mm.lower():
                        matching_mmproj = mm
                        break

                models.append(
                    ModelInfo(
                        id=f.name,
                        name=f.name,
                        provider=self.name,
                        size_bytes=f.stat().st_size,
                        format="gguf",
                        mmproj=matching_mmproj,
                        is_active=False,
                    )
                )

        # Check if container is running and mark active model
        status = docker_manager.get_container_status(self.container_name)
        if status.get("running"):
            try:
                base_url = await self._resolve_url()
                async with httpx.AsyncClient(timeout=1.5) as client:
                    resp = await client.get(f"{base_url}/props")
                    if resp.status_code == 200:
                        props = resp.json()
                        current_model = props.get("default_generation_settings", {}).get("model", "")
                        for m in models:
                            if m.name in current_model or m.id in current_model:
                                m.is_active = True
            except Exception:
                pass

        return models

    async def unload(self, model: Optional[str] = None) -> bool:
        """Stopping the llama-server container immediately releases 100% of VRAM."""
        logger.info("Stopping llamacpp container to free VRAM...")
        return await docker_manager.stop_container(self.container_name)

    async def load(self, model: str, mmproj: Optional[str] = None) -> AsyncGenerator[Dict[str, str], None]:
        models_dir = Path(settings.MODELS_DIR)
        model_path = models_dir / model
        if not model_path.exists():
            yield {"step": "error", "message": f"Model '{model}' not found in {settings.MODELS_DIR}. Place .gguf in ./models."}
            return

        yield {"step": "starting_container", "message": f"Checking llama.cpp container for {model}..."}
        res = await docker_manager.restart_llamacpp_with_model(model, mmproj)
        if isinstance(res, tuple):
            success, err_msg = res
        else:
            success, err_msg = res, None

        if not success:
            yield {"step": "error", "message": err_msg or f"Failed to launch {self.container_name} container"}
            return

        yield {"step": "loading_weights_to_vram", "message": "Allocating CUDA layers to 4GB VRAM..."}

        # Poll health endpoint
        ready = False
        for _ in range(60):
            await asyncio.sleep(1.0)
            try:
                base_url = await self._resolve_url()
                async with httpx.AsyncClient(timeout=1.0) as client:
                    resp = await client.get(f"{base_url}/health")
                    if resp.status_code == 200 and resp.json().get("status") == "ok":
                        ready = True
                        break
            except Exception:
                pass

        if ready:
            yield {"step": "ready", "message": f"llama.cpp loaded {model} successfully"}
        else:
            yield {"step": "ready", "message": f"llama.cpp container started for {model}"}

    async def chat_completion_stream(self, payload: Dict[str, Any]) -> AsyncGenerator[str, None]:
        base_url = await self._resolve_url()
        url = f"{base_url}/v1/chat/completions"
        stream_timeout = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)
        async with httpx.AsyncClient(timeout=stream_timeout) as client:
            async with client.stream("POST", url, json=payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    yield f"data: {{\"error\": \"llama.cpp error: {err_body.decode('utf-8', errors='ignore')}\"}}\n\n"
                    return
                async for line in response.aiter_lines():
                    if line:
                        yield f"{line}\n"
