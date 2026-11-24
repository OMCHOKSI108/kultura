#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Kultura Docker Hub Build & Publish Utility
# Usage:
#   ./server/scripts/docker-publish.sh [dockerhub_username] [--with-models]
# ─────────────────────────────────────────────────────────────────────────────

USERNAME="${1:-omchoksi}"
WITH_MODELS="false"

for arg in "$@"; do
    if [ "$arg" == "--with-models" ]; then
        WITH_MODELS="true"
    fi
done

echo "=========================================================="
echo "  Publishing Kultura to Docker Hub"
echo "  Target Username : ${USERNAME}"
echo "  Include Models  : ${WITH_MODELS}"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# 1. Build and tag Next.js Frontend
echo ""
echo "[1/2] Building Next.js 16 Frontend Image..."
docker build \
    -t "${USERNAME}/kultura-frontend:latest" \
    "${ROOT_DIR}/client"

# 2. Build and tag FastAPI Backend Gateway (optionally downloading weights during build)
echo ""
echo "[2/2] Building Gateway Orchestrator Image (DOWNLOAD_MODELS=${WITH_MODELS})..."
docker build \
    --build-arg DOWNLOAD_MODELS="${WITH_MODELS}" \
    -t "${USERNAME}/kultura-gateway:latest" \
    "${ROOT_DIR}/server"

echo ""
echo "Build complete! To push both images to Docker Hub, run:"
echo "  docker login"
echo "  docker push ${USERNAME}/kultura-frontend:latest"
echo "  docker push ${USERNAME}/kultura-gateway:latest"
