from pathlib import Path
import os
from pydantic_settings import BaseSettings, SettingsConfigDict

# Locate .env from root or local dir
ROOT_ENV = Path(__file__).resolve().parent.parent / ".env"
LOCAL_ENV = Path(__file__).resolve().parent / ".env"
ENV_FILE = str(ROOT_ENV if ROOT_ENV.exists() else LOCAL_ENV)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    APP_NAME: str = "Kultura AI Inference Gateway"
    VERSION: str = "1.0.0"

    # Strict PostgreSQL Configuration
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "kultura")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "kultura")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "kultura")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "db")
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", "5432"))

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"postgresql+asyncpg://{os.getenv('POSTGRES_USER', 'kultura')}:{os.getenv('POSTGRES_PASSWORD', 'kultura')}@{os.getenv('POSTGRES_HOST', 'db')}:{os.getenv('POSTGRES_PORT', '5432')}/{os.getenv('POSTGRES_DB', 'kultura')}"
    )

    # Storage paths
    MODELS_DIR: str = os.getenv("MODELS_DIR", "/models")

    # Docker Socket
    DOCKER_SOCKET: str = os.getenv("DOCKER_HOST", "unix:///var/run/docker.sock")

    # Provider Endpoints
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
    LLAMACPP_BASE_URL: str = os.getenv("LLAMACPP_BASE_URL", "http://llamacpp:8080")
    KOBOLDCPP_BASE_URL: str = os.getenv("KOBOLDCPP_BASE_URL", "http://koboldcpp:5001")
    LMSTUDIO_BASE_URL: str = os.getenv("LMSTUDIO_BASE_URL", "http://host.docker.internal:1234")
    JAN_BASE_URL: str = os.getenv("JAN_BASE_URL", "http://host.docker.internal:1337")

    # Local fallback endpoints if not running in Docker
    LOCAL_OLLAMA_URL: str = os.getenv("LOCAL_OLLAMA_URL", "http://localhost:11434")
    LOCAL_LLAMACPP_URL: str = os.getenv("LOCAL_LLAMACPP_URL", "http://localhost:8080")
    LOCAL_KOBOLDCPP_URL: str = os.getenv("LOCAL_KOBOLDCPP_URL", "http://localhost:5001")
    LOCAL_LMSTUDIO_URL: str = os.getenv("LOCAL_LMSTUDIO_URL", "http://localhost:1234")
    LOCAL_JAN_URL: str = os.getenv("LOCAL_JAN_URL", "http://localhost:1337")

    # Orchestrator & VRAM
    AUTO_UNLOAD_MINUTES: int = int(os.getenv("AUTO_UNLOAD_MINUTES", "10"))
    GPU_TOTAL_VRAM_MB: int = int(os.getenv("GPU_TOTAL_VRAM_MB", "4096"))

    # Web Search Providers
    SEARXNG_URL: str | None = os.getenv("SEARXNG_URL", None)
    TAVILY_API_KEY: str | None = os.getenv("TAVILY_API_KEY", None)
    BRAVE_API_KEY: str | None = os.getenv("BRAVE_API_KEY", None)

    # CORS
    CORS_ORIGINS: list[str] = ["*"]


settings = Settings()
