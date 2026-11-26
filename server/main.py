import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from config import settings
from database import init_db
from routers import (
    providers_router,
    sessions_router,
    chat_router,
    system_router,
    hub_router,
    auth_router,
)
from services.orchestrator import orchestrator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("kultura.gateway")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Kultura AI Inference Gateway...")
    await init_db()
    orchestrator.start_idle_checker()
    yield
    # Shutdown
    logger.info("Shutting down Kultura AI Inference Gateway...")
    orchestrator.stop_idle_checker()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Zero-Waste VRAM Multi-Provider AI Inference Gateway & Lifecycle Orchestrator",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Attach Routers
app.include_router(auth_router)
app.include_router(system_router)
app.include_router(providers_router)
app.include_router(sessions_router)
app.include_router(chat_router)
app.include_router(hub_router)



@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "supported_providers": ["ollama", "llamacpp", "koboldcpp", "lmstudio", "jan"],
    }


@app.get("/api/health")
@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.VERSION,
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
