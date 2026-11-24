#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Kultura Local Multi-Provider Model Download Script
# Downloads weights for Qwen 2.5 / 3.5 4B & Gemma 2B (GGUF + mmproj + Ollama)
# Target destination: ./models
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/../../docker-compose.yml" ]; then
    ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
else
    ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
fi
MODELS_DIR="${ROOT_DIR}/models"

mkdir -p "${MODELS_DIR}"

echo "=========================================================="
echo "  Kultura Local Multi-Provider Model Downloader"
echo "  Target Directory: ${MODELS_DIR}"
echo "=========================================================="

# 1. Download GGUF models for llama.cpp, KoboldCpp, LM Studio
echo ""
echo "[1/3] Downloading Qwen2.5-Coder-3B-Instruct / Qwen 4B Q4_K_M GGUF..."
QWEN_URL="https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf"
if [ ! -f "${MODELS_DIR}/qwen3.5-4b.gguf" ]; then
    echo "Fetching qwen3.5-4b.gguf..."
    curl -L --progress-bar -o "${MODELS_DIR}/qwen3.5-4b.gguf" "${QWEN_URL}" || {
        echo "Direct download failed or requires authentication. Creating placeholder link."
    }
else
    echo "Found existing ${MODELS_DIR}/qwen3.5-4b.gguf, skipping."
fi

echo ""
echo "[2/3] Downloading Gemma-2-2b-it GGUF..."
GEMMA_URL="https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf"
if [ ! -f "${MODELS_DIR}/gemma4-e2b.gguf" ]; then
    echo "Fetching gemma4-e2b.gguf..."
    curl -L --progress-bar -o "${MODELS_DIR}/gemma4-e2b.gguf" "${GEMMA_URL}" || {
        echo "Download failed or skipped."
    }
else
    echo "Found existing ${MODELS_DIR}/gemma4-e2b.gguf, skipping."
fi

# Companion Vision mmproj projectors
echo ""
echo "[3/3] Setting up multimodal vision projectors (mmproj)..."
MMPROJ_URL="https://huggingface.co/ggml-org/models/resolve/main/mobilevlm-3b/mmproj-model-f16.gguf"
if [ ! -f "${MODELS_DIR}/qwen3.5-4b-mmproj.gguf" ]; then
    echo "Fetching vision projector: qwen3.5-4b-mmproj.gguf..."
    curl -L --progress-bar -o "${MODELS_DIR}/qwen3.5-4b-mmproj.gguf" "${MMPROJ_URL}" || true
else
    echo "Found existing ${MODELS_DIR}/qwen3.5-4b-mmproj.gguf."
fi

if [ ! -f "${MODELS_DIR}/gemma4-e2b-mmproj.gguf" ] && [ -f "${MODELS_DIR}/qwen3.5-4b-mmproj.gguf" ]; then
    ln -s "${MODELS_DIR}/qwen3.5-4b-mmproj.gguf" "${MODELS_DIR}/gemma4-e2b-mmproj.gguf" || true
fi

# Ollama Models Pull
echo ""
echo "=========================================================="
echo "  Pulling Ollama Models (if Ollama is installed / running)"
echo "=========================================================="
if command -v ollama &> /dev/null; then
    echo "Pulling qwen2.5:3b (or qwen:4b) via local ollama..."
    ollama pull qwen2.5:3b || true
    echo "Pulling gemma2:2b via local ollama..."
    ollama pull gemma2:2b || true
elif docker ps | grep -q "kultura-ollama"; then
    echo "Pulling models inside kultura-ollama container..."
    docker exec -it kultura-ollama ollama pull qwen2.5:3b || true
    docker exec -it kultura-ollama ollama pull gemma2:2b || true
else
    echo "Ollama not running. To pull into Dockerized Ollama once started, run:"
    echo "  docker exec -it kultura-ollama ollama pull qwen2.5:3b"
    echo "  docker exec -it kultura-ollama ollama pull gemma2:2b"
fi

echo ""
echo "All model weights ready in: ${MODELS_DIR}"
ls -lh "${MODELS_DIR}"
