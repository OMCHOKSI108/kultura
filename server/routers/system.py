import os
from pathlib import Path
from fastapi import APIRouter
from config import settings
from services.docker_manager import docker_manager

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.VERSION,
        "docker_available": docker_manager.is_available(),
    }


@router.get("/models-dir")
async def list_models_dir():
    """List raw files present in /models directory."""
    models_path = Path(settings.MODELS_DIR)
    if not models_path.exists():
        return {"path": str(models_path), "files": []}

    files = []
    for f in models_path.iterdir():
        if f.is_file():
            files.append({
                "name": f.name,
                "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
                "is_gguf": f.suffix.lower() == ".gguf",
            })
    return {"path": str(models_path), "files": files}
