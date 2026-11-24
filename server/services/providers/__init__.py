from typing import Dict
from services.providers.base import BaseProvider
from services.providers.ollama_provider import OllamaProvider
from services.providers.llamacpp_provider import LlamaCppProvider
from services.providers.koboldcpp_provider import KoboldCppProvider
from services.providers.lmstudio_provider import LMStudioProvider
from services.providers.jan_provider import JanProvider

_providers: Dict[str, BaseProvider] = {
    "ollama": OllamaProvider(),
    "llamacpp": LlamaCppProvider(),
    "koboldcpp": KoboldCppProvider(),
    "lmstudio": LMStudioProvider(),
    "jan": JanProvider(),
}


def get_provider(name: str) -> BaseProvider:
    provider = _providers.get(name.lower())
    if not provider:
        raise ValueError(f"Unknown provider '{name}'. Supported providers: {list(_providers.keys())}")
    return provider


def get_all_providers() -> Dict[str, BaseProvider]:
    return _providers
