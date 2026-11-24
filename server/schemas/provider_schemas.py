from typing import Optional, List
from pydantic import BaseModel


class ModelInfo(BaseModel):
    id: str
    name: str
    provider: str
    size_bytes: Optional[int] = None
    format: Optional[str] = "gguf"
    mmproj: Optional[str] = None
    is_active: bool = False


class ProviderStatus(BaseModel):
    name: str
    display_name: str
    status: str  # "running" | "standby" | "offline"
    is_container: bool
    container_running: bool
    active_model: Optional[str] = None
    base_url: str
    models_count: int = 0


class LoadModelRequest(BaseModel):
    model: str
    mmproj: Optional[str] = None


class VramStatus(BaseModel):
    total_mb: float = 4096.0
    used_mb: float = 0.0
    free_mb: float = 4096.0
    utilization_pct: float = 0.0
    active_provider: Optional[str] = None
    active_model: Optional[str] = None
