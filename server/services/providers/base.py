from abc import ABC, abstractmethod
from typing import List, Optional, AsyncGenerator, Dict, Any
from schemas.provider_schemas import ModelInfo


class BaseProvider(ABC):
    """Abstract base class for all inference engine adapters."""

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    @abstractmethod
    def display_name(self) -> str:
        pass

    @property
    @abstractmethod
    def is_container(self) -> bool:
        pass

    @property
    def container_name(self) -> Optional[str]:
        return None

    @abstractmethod
    def get_base_url(self) -> str:
        pass

    @abstractmethod
    async def check_health(self) -> bool:
        """Return True if the service endpoint is currently reachable."""
        pass

    @abstractmethod
    async def list_models(self) -> List[ModelInfo]:
        """List available models for this provider."""
        pass

    @abstractmethod
    async def unload(self, model: Optional[str] = None) -> bool:
        """Evict model from VRAM and free GPU memory."""
        pass

    @abstractmethod
    async def load(self, model: str, mmproj: Optional[str] = None) -> AsyncGenerator[Dict[str, str], None]:
        """Stream progress steps while loading the model."""
        yield {"step": "ready", "message": "Ready"}

    @abstractmethod
    async def chat_completion_stream(self, payload: Dict[str, Any]) -> AsyncGenerator[str, None]:
        """Stream raw chunks from the inference engine."""
        yield ""
