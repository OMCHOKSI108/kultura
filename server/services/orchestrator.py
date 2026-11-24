import asyncio
import logging
import time
from typing import Optional, Dict, Any, List, AsyncGenerator
import httpx
from config import settings
from schemas.provider_schemas import ProviderStatus, VramStatus
from services.docker_manager import docker_manager
from services.providers import get_provider, get_all_providers

logger = logging.getLogger("kultura.orchestrator")


class VramOrchestrator:
    """
    Zero-Waste VRAM Manager & Mutual-Exclusion Lifecycle Orchestrator.
    Ensures only ONE inference engine and ONE model occupies the 4GB GPU VRAM at any time.
    """

    def __init__(self):
        self.active_provider: Optional[str] = None
        self.active_model: Optional[str] = None
        self.last_activity: float = time.time()
        self._lock = asyncio.Lock()
        self._bg_task: Optional[asyncio.Task] = None

    def start_idle_checker(self):
        """Starts background idle timeout task."""
        if not self._bg_task:
            self._bg_task = asyncio.create_task(self._idle_worker())
            logger.info(f"Started Idle Auto-Unload TTL checker (timeout: {settings.AUTO_UNLOAD_MINUTES} mins).")

    def stop_idle_checker(self):
        if self._bg_task:
            self._bg_task.cancel()
            self._bg_task = None

    def touch(self):
        """Record activity to reset idle timer."""
        self.last_activity = time.time()

    async def get_providers_status(self) -> List[ProviderStatus]:
        providers = get_all_providers()
        results: List[ProviderStatus] = []

        for name, p in providers.items():
            is_healthy = await p.check_health()
            container_status = docker_manager.get_container_status(p.container_name) if p.container_name else {}
            container_running = container_status.get("running", False)

            if is_healthy:
                status = "running"
            elif p.is_container and (container_status.get("exists") or docker_manager.is_available()):
                status = "standby"
            else:
                status = "offline"

            # Check if this provider has models
            try:
                models = await p.list_models()
                models_count = len(models)
            except Exception:
                models_count = 0

            active_model = self.active_model if self.active_provider == name else None
            if not active_model and name == "ollama" and models:
                for m in models:
                    if getattr(m, "is_active", False):
                        active_model = m.name
                        self.active_provider = "ollama"
                        self.active_model = m.name
                        break

            results.append(
                ProviderStatus(
                    name=name,
                    display_name=p.display_name,
                    status=status,
                    is_container=p.is_container,
                    container_running=container_running,
                    active_model=active_model,
                    base_url=p.get_base_url(),
                    models_count=models_count,
                )
            )
        return results

    async def get_vram_status(self) -> VramStatus:
        vram = docker_manager.get_vram_usage()
        total_mb = vram.get("total_mb", 4096.0)
        raw_used_mb = vram.get("used_mb", 0.0)

        detected_provider = self.active_provider
        detected_model = self.active_model

        # Probe active providers dynamically to verify what model is really in VRAM
        providers = get_all_providers()
        ollama_p = providers.get("ollama")
        ollama_model = None
        ollama_vram_mb = 0.0

        if ollama_p:
            try:
                base_url = await ollama_p._resolve_url()
                async with httpx.AsyncClient(timeout=1.5) as client:
                    resp = await client.get(f"{base_url}/api/ps")
                    if resp.status_code == 200:
                        data = resp.json()
                        loaded = data.get("models", [])
                        if loaded:
                            ollama_model = loaded[0].get("name")
                            vram_bytes = sum(m.get("size_vram", 0) for m in loaded)
                            if vram_bytes > 0:
                                ollama_vram_mb = round(vram_bytes / (1024 * 1024), 1)
                            else:
                                ollama_vram_mb = round(sum(m.get("size", 0) for m in loaded) / (1024 * 1024), 1)
            except Exception as e:
                logger.debug(f"Error querying Ollama VRAM: {e}")

        # Check containers
        kobold_running = docker_manager.get_container_status("kultura-koboldcpp").get("running", False)
        llamacpp_running = docker_manager.get_container_status("kultura-llamacpp").get("running", False)

        if ollama_model:
            detected_provider = "ollama"
            detected_model = ollama_model
        elif kobold_running:
            detected_provider = "koboldcpp"
            detected_model = self.active_model or "koboldcpp-model"
        elif llamacpp_running:
            detected_provider = "llamacpp"
            detected_model = self.active_model or "llamacpp-model"
        else:
            # Check LM Studio
            lm_p = providers.get("lmstudio")
            if lm_p:
                try:
                    async with httpx.AsyncClient(timeout=1.0) as client:
                        resp = await client.get(f"{lm_p.get_base_url()}/v1/models")
                        if resp.status_code == 200:
                            for m in resp.json().get("data", []):
                                if m.get("loaded", False):
                                    detected_provider = "lmstudio"
                                    detected_model = m.get("id")
                                    break
                except Exception:
                    pass

        # Determine true VRAM usage
        if not detected_provider:
            self.active_provider = None
            self.active_model = None
            used_mb = 0.0
        else:
            self.active_provider = detected_provider
            self.active_model = detected_model
            # If raw hardware nvidia-smi reported real memory > 60MB, use it (minus desktop baseline ~25MB)
            if raw_used_mb > 60:
                used_mb = round(raw_used_mb - 25.0, 1)
            elif ollama_vram_mb > 0:
                used_mb = ollama_vram_mb
            elif kobold_running or llamacpp_running:
                used_mb = 2500.0
            else:
                used_mb = raw_used_mb

        free_mb = max(0.0, total_mb - used_mb)
        pct = round((used_mb / total_mb) * 100, 1) if total_mb > 0 else 0.0

        return VramStatus(
            total_mb=total_mb,
            used_mb=used_mb,
            free_mb=free_mb,
            utilization_pct=pct,
            active_provider=self.active_provider,
            active_model=self.active_model,
        )

    async def unload_all(self) -> bool:
        """Evicts models across all engines and stops GPU containers to free VRAM."""
        logger.info("Executing global VRAM eviction...")
        providers = get_all_providers()

        # Step 1: Evict models from daemon providers
        for p in providers.values():
            try:
                await p.unload()
            except Exception as e:
                logger.debug(f"Unload error on {p.name}: {e}")

        # Step 2: Stop GPU-competing containers
        await docker_manager.stop_container("kultura-llamacpp", timeout=5)
        await docker_manager.stop_container("kultura-koboldcpp", timeout=5)

        self.active_provider = None
        self.active_model = None
        logger.info("VRAM eviction complete. GPU memory freed.")
        return True

    async def load_model(
        self, provider_name: str, model_name: str, mmproj: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Enforce mutual exclusion:
        1. Evict and stop previous provider/model
        2. Start requested provider / load model
        3. Stream real-time lifecycle progress via SSE
        """
        async with self._lock:
            target = get_provider(provider_name)

            # Check if this exact model is already loaded and healthy
            if self.active_provider == provider_name and self.active_model == model_name:
                if await target.check_health():
                    yield {"step": "ready", "message": f"{model_name} is already active and ready in VRAM"}
                    return

            # Step 1: Evict and free VRAM
            yield {
                "step": "stopping_previous",
                "message": "Zero-Waste VRAM Manager: Evicting previous models and stopping conflicting GPU containers...",
            }
            await self.unload_all()
            await asyncio.sleep(0.5)

            # Step 2: Load target provider
            has_error = False
            async for progress in target.load(model_name, mmproj):
                yield progress
                if progress.get("step") == "error":
                    has_error = True
                    break

            if has_error:
                return

            # Verify health
            ready = await target.check_health()
            if ready:
                self.active_provider = provider_name
                self.active_model = model_name
                self.touch()
                yield {
                    "step": "ready",
                    "message": f"{model_name} successfully loaded into GPU VRAM on {target.display_name}",
                    "provider": provider_name,
                    "model": model_name,
                }
            else:
                yield {
                    "step": "error",
                    "message": f"Provider {target.display_name} is unreachable. Ensure the service is running.",
                    "provider": provider_name,
                    "model": model_name,
                }

    async def _idle_worker(self):
        """Periodic loop monitoring inactivity and auto-unloading VRAM."""
        while True:
            try:
                await asyncio.sleep(30)
                if self.active_provider and self.active_model:
                    idle_sec = time.time() - self.last_activity
                    limit_sec = settings.AUTO_UNLOAD_MINUTES * 60
                    if idle_sec > limit_sec:
                        logger.info(
                            f"Inactivity TTL reached ({idle_sec / 60:.1f} mins > {settings.AUTO_UNLOAD_MINUTES} mins). "
                            f"Auto-unloading {self.active_model} from {self.active_provider} to preserve VRAM."
                        )
                        async with self._lock:
                            await self.unload_all()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in idle worker: {e}")


orchestrator = VramOrchestrator()
