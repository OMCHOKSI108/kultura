import json
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from schemas.provider_schemas import ProviderStatus, ModelInfo, LoadModelRequest, VramStatus
from services.orchestrator import orchestrator
from services.providers import get_provider

logger = logging.getLogger("kultura.routers.providers")
router = APIRouter(prefix="/api/providers", tags=["providers"])


@router.get("", response_model=List[ProviderStatus])
async def list_providers():
    """Returns status of all 5 providers, active containers, and current loaded models."""
    return await orchestrator.get_providers_status()


@router.get("/vram", response_model=VramStatus)
async def get_vram_status():
    """Returns current GPU VRAM utilization and active engine/model."""
    return await orchestrator.get_vram_status()


@router.get("/health")
async def check_all_providers_health():
    """
    Comprehensive Provider Health Check:
    Checks live reachability of all 5 providers, active containers, and GPU VRAM status.
    """
    providers_status = await orchestrator.get_providers_status()
    vram_status = await orchestrator.get_vram_status()

    online_count = sum(1 for p in providers_status if p.status == "running")
    total_count = len(providers_status)

    return {
        "status": "healthy" if online_count > 0 else "degraded",
        "online_count": online_count,
        "total_count": total_count,
        "vram": vram_status,
        "providers": providers_status,
    }


@router.get("/{provider_name}/models", response_model=List[ModelInfo])
async def list_provider_models(provider_name: str):
    """
    Returns available models for the specified provider.
    For single-model engines (llama.cpp, koboldcpp), scans /models/*.gguf even if stopped.
    """
    try:
        p = get_provider(provider_name)
        return await p.list_models()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error listing models for {provider_name}: {e}")
        return []


@router.post("/unload")
async def unload_all_models():
    """
    Eject / Unload VRAM:
    Unloads all active models across all engines and stops GPU containers.
    """
    await orchestrator.unload_all()
    return {"status": "ok", "message": "All models evicted from VRAM", "vram": await orchestrator.get_vram_status()}


@router.post("/{provider_name}/unload")
async def unload_provider(provider_name: str):
    """Unload a specific provider or model."""
    try:
        p = get_provider(provider_name)
        await p.unload()
        if orchestrator.active_provider == provider_name:
            orchestrator.active_provider = None
            orchestrator.active_model = None
        return {"status": "ok", "message": f"{provider_name} unloaded", "vram": await orchestrator.get_vram_status()}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{provider_name}/load")
async def load_model(provider_name: str, request: LoadModelRequest):
    """
    Model Load & Engine Switcher:
    Streams real-time lifecycle progress events (stopping_previous -> starting_container -> loading_weights_to_vram -> ready) via SSE.
    """
    try:
        get_provider(provider_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    async def event_generator():
        try:
            async for progress in orchestrator.load_model(provider_name, request.model, request.mmproj):
                yield f"event: status\ndata: {json.dumps(progress)}\n\n"
        except Exception as e:
            logger.error(f"Error during model load: {e}")
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
