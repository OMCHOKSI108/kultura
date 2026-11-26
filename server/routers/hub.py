import json
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse

from models import UserModel
from schemas.hub_schemas import (
    HubModelSearchItem,
    HubModelDetails,
    DownloadRequest,
    DownloadStatusItem,
)
from services.auth import get_current_user, require_admin
from services.hub_service import hub_service

logger = logging.getLogger("kultura.routers.hub")
router = APIRouter(prefix="/api/hub", tags=["hub"])


@router.get("/search", response_model=List[HubModelSearchItem])
@router.get("/models", response_model=List[HubModelSearchItem])
async def search_hub_models(
    q: Optional[str] = Query(None, description="Search query for model name or tag"),
    category: Optional[str] = Query(None, description="Category filter: all, text-generation, code, image, audio, video"),
    sort: str = Query("downloads", description="Sort by downloads, likes, or lastModified"),
    limit: int = Query(20, ge=1, le=60, description="Max results"),
    current_user: UserModel = Depends(get_current_user),
):
    """Search Hugging Face Hub for GGUF models with in-memory caching and exact repo lookup."""
    return await hub_service.search_hf_models(q=q, category=category, sort=sort, limit=limit)


@router.get("/models/{repo_id:path}/files", response_model=HubModelDetails)
async def get_model_files(
    repo_id: str,
    current_user: UserModel = Depends(get_current_user),
):
    """
    Fetch repository files, parse available .gguf quantizations,
    and compute VRAM fit against host hardware.
    """
    try:
        return await hub_service.get_model_files(repo_id)
    except Exception as e:
        logger.error(f"Error fetching files for {repo_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download", response_model=DownloadStatusItem)
async def start_model_download(
    req: DownloadRequest,
    admin: UserModel = Depends(require_admin),
):
    """
    Start downloading a GGUF quantization: Admin only.
    For Ollama: stream pulls directly into Ollama runtime.
    For llama.cpp, koboldcpp, lmstudio, jan: async streams .gguf to models directory with .part safety.
    """
    try:
        return await hub_service.start_download(
            repo_id=req.repo_id,
            filename=req.filename,
            quant=req.quant,
            provider=req.provider,
        )
    except Exception as e:
        logger.error(f"Error starting download: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/downloads/stream")
async def stream_downloads(
    current_user: UserModel = Depends(get_current_user),
):
    """SSE endpoint streaming live download progress (MB/s, ETA, percent)."""
    return StreamingResponse(
        hub_service.stream_download_status(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/downloads/{download_id}")
async def cancel_download(
    download_id: str,
    admin: UserModel = Depends(require_admin),
):
    """Cancel an active download and remove .part temporary files: Admin only."""
    success = hub_service.cancel_download(download_id)
    if not success:
        raise HTTPException(status_code=404, detail="Download not found or already ended")
    return {"status": "ok", "message": f"Download {download_id} cancelled"}
