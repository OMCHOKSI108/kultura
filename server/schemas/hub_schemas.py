from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field


class HubModelSearchItem(BaseModel):
    id: str
    author: str
    name: str
    downloads: int = 0
    likes: int = 0
    tags: List[str] = Field(default_factory=list)
    architecture: Optional[str] = None
    context_length: Optional[int] = None
    total_params: Optional[int] = None
    total_params_formatted: Optional[str] = None
    param_size_b: Optional[float] = None
    gguf_count: int = 0
    last_modified: Optional[str] = None
    description: Optional[str] = None
    pipeline_tag: Optional[str] = None


class HubModelFile(BaseModel):
    filename: str
    size_bytes: int
    size_formatted: str
    quant: str
    vram_estimate_mb: float
    vram_fit: Literal["fits", "tight", "too_large"]
    download_url: str


class HubModelDetails(BaseModel):
    id: str
    author: str
    name: str
    downloads: int = 0
    likes: int = 0
    tags: List[str] = Field(default_factory=list)
    architecture: Optional[str] = None
    context_length: Optional[int] = None
    total_params_formatted: Optional[str] = None
    description: Optional[str] = None
    files: List[HubModelFile] = Field(default_factory=list)


class DownloadRequest(BaseModel):
    repo_id: str
    filename: str
    quant: str
    provider: Literal["ollama", "llamacpp", "llama.cpp", "koboldcpp", "lmstudio", "jan"]


class DownloadStatusItem(BaseModel):
    download_id: str
    repo_id: str
    filename: str
    quant: str
    provider: str
    bytes_downloaded: int = 0
    total_bytes: int = 0
    progress_pct: float = 0.0
    speed_mbps: float = 0.0
    eta_seconds: Optional[float] = None
    status: Literal["pending", "downloading", "completed", "failed", "cancelled"]
    error: Optional[str] = None
