import asyncio
import logging
import shutil
import subprocess
from typing import Optional, Dict, Any
from config import settings

try:
    import docker
    from docker.errors import NotFound, APIError
    from docker.types import DeviceRequest
    DOCKER_AVAILABLE = True
except ImportError:
    DOCKER_AVAILABLE = False
    DeviceRequest = None  # type: ignore
    NotFound = None  # type: ignore
    APIError = None  # type: ignore

logger = logging.getLogger("kultura.docker")


class DockerManager:
    """Manages Docker containers for inference engines and tracks GPU VRAM usage."""

    def __init__(self):
        self.client = None
        self._init_client()

    def _init_client(self):
        if not DOCKER_AVAILABLE:
            return
        try:
            self.client = docker.from_env()
            self.client.ping()
            logger.info("Connected to Docker daemon successfully.")
        except Exception as e:
            logger.warning(f"Could not connect to Docker daemon: {e}. Container auto-management disabled.")
            self.client = None

    def is_available(self) -> bool:
        return self.client is not None

    def has_image(self, image_name: str) -> bool:
        if not self.client:
            return False
        try:
            self.client.images.get(image_name)
            return True
        except Exception:
            return False

    def get_container_status(self, container_name: str) -> Dict[str, Any]:
        """Check if container exists and is running."""
        if not self.client:
            return {"exists": False, "running": False, "status": "unknown"}
        try:
            container = self.client.containers.get(container_name)
            return {
                "exists": True,
                "running": container.status == "running",
                "status": container.status,
            }
        except Exception:
            return {"exists": False, "running": False, "status": "stopped"}

    async def stop_container(self, container_name: str, timeout: int = 10) -> bool:
        """Stop a container if it is running."""
        if not self.client:
            return False
        try:
            loop = asyncio.get_running_loop()
            try:
                container = await loop.run_in_executor(None, self.client.containers.get, container_name)
            except Exception as e:
                # Container does not exist yet; nothing to stop
                if "404" in str(e) or "NotFound" in type(e).__name__:
                    return True
                raise e

            if container.status == "running":
                logger.info(f"Stopping container: {container_name}")
                await loop.run_in_executor(None, lambda: container.stop(timeout=timeout))
                logger.info(f"Container stopped: {container_name}")
            return True
        except Exception as e:
            logger.debug(f"Stop container {container_name} notice: {e}")
            return False

    async def start_container(self, container_name: str) -> bool:
        """Start an existing container."""
        if not self.client:
            return False
        try:
            loop = asyncio.get_running_loop()
            container = await loop.run_in_executor(None, self.client.containers.get, container_name)
            if container.status != "running":
                logger.info(f"Starting container: {container_name}")
                await loop.run_in_executor(None, container.start)
                logger.info(f"Container started: {container_name}")
            return True
        except Exception as e:
            logger.warning(f"Failed to start container {container_name}: {e}")
            return False

    def _get_host_models_dir(self) -> str:
        import os
        host_dir = os.getenv("HOST_MODELS_DIR")
        if host_dir:
            return host_dir
        if self.client:
            try:
                for c_id in ["kultura", "kultura-gateway", os.getenv("HOSTNAME", "")]:
                    if not c_id:
                        continue
                    try:
                        c = self.client.containers.get(c_id)
                        for m in c.attrs.get("Mounts", []):
                            if m.get("Destination") == "/models":
                                return m.get("Source", "/models")
                    except Exception:
                        pass
            except Exception:
                pass
        return settings.MODELS_DIR

    def _get_network(self) -> Optional[str]:
        if self.client:
            try:
                self.client.networks.get("ai_inference_kultura-net")
                return "ai_inference_kultura-net"
            except Exception:
                pass
        return "bridge"

    async def restart_llamacpp_with_model(self, model_file: str, mmproj_file: Optional[str] = None):
        """
        Restart or recreate the llamacpp container with the target GGUF model and optional mmproj.
        Uses local CUDA llama-server inside Docker container with direct device mapping.
        """
        import os
        container_name = "kultura-llamacpp"
        if not self.client:
            return False, "Docker daemon not reachable"

        image_name = "ghcr.io/ggml-org/llama.cpp:server-cuda"
        if not self.has_image(image_name):
            if self.has_image("kultura-ollama:local"):
                image_name = "kultura-ollama:local"
            else:
                return False, f"Engine image {image_name} not found locally."

        try:
            loop = asyncio.get_running_loop()
            cmd_args = [
                "-m", f"/models/{model_file}",
                "--host", "0.0.0.0",
                "--port", "8080",
                "-ngl", "99",
                "-c", "2048",
                "--jinja",
            ]
            if mmproj_file:
                cmd_args.extend(["--mmproj", f"/models/{mmproj_file}"])

            try:
                container = await loop.run_in_executor(None, self.client.containers.get, container_name)
                logger.info(f"Recreating {container_name} with model: {model_file}")
                await loop.run_in_executor(None, lambda: container.remove(force=True))
            except Exception:
                pass

            devices = []
            for dev in ["/dev/nvidia0", "/dev/nvidiactl", "/dev/nvidia-uvm"]:
                if os.path.exists(dev):
                    devices.append(f"{dev}:{dev}:rwm")

            mounts = {
                self._get_host_models_dir(): {'bind': '/models', 'mode': 'ro'}
            }
            if os.path.exists("/usr/lib/x86_64-linux-gnu/libcuda.so.1"):
                mounts["/usr/lib/x86_64-linux-gnu/libcuda.so.1"] = {"bind": "/usr/lib/x86_64-linux-gnu/libcuda.so.1", "mode": "ro"}
            if os.path.exists("/usr/lib/x86_64-linux-gnu/libnvidia-ml.so.1"):
                mounts["/usr/lib/x86_64-linux-gnu/libnvidia-ml.so.1"] = {"bind": "/usr/lib/x86_64-linux-gnu/libnvidia-ml.so.1", "mode": "ro"}

            ports = {'8080/tcp': 8080}
            net = self._get_network()

            def _run():
                run_kwargs = dict(
                    image=image_name,
                    name=container_name,
                    entrypoint="/usr/local/lib/ollama/llama-server",
                    command=cmd_args,
                    volumes=mounts,
                    ports=ports,
                    detach=True,
                )
                if devices:
                    run_kwargs["devices"] = devices
                if net:
                    run_kwargs["network"] = net
                return self.client.containers.run(**run_kwargs)

            await loop.run_in_executor(None, _run)
            logger.info(f"Successfully launched {container_name} with {model_file}")
            return True, None
        except Exception as e:
            logger.warning(f"Error launching llamacpp container: {e}")
            return False, str(e)

    async def restart_koboldcpp_with_model(self, model_file: str, mmproj_file: Optional[str] = None) -> bool:
        """
        Restart or recreate koboldcpp container with target GGUF model on port 5001.
        """
        import os
        container_name = "kultura-koboldcpp"
        if not self.client:
            return False

        image_name = "ghcr.io/ggml-org/llama.cpp:server-cuda"
        if not self.has_image(image_name):
            if self.has_image("kultura-ollama:local"):
                image_name = "kultura-ollama:local"
            elif self.has_image("ghcr.io/lostruins/koboldcpp:latest"):
                image_name = "ghcr.io/lostruins/koboldcpp:latest"

        try:
            loop = asyncio.get_running_loop()
            cmd_args = [
                "-m", f"/models/{model_file}",
                "--host", "0.0.0.0",
                "--port", "5001",
                "-ngl", "99",
                "-c", "2048",
                "--jinja",
            ]
            if mmproj_file:
                cmd_args.extend(["--mmproj", f"/models/{mmproj_file}"])

            try:
                container = await loop.run_in_executor(None, self.client.containers.get, container_name)
                logger.info(f"Recreating {container_name} with model: {model_file}")
                await loop.run_in_executor(None, lambda: container.remove(force=True))
            except Exception:
                pass

            devices = []
            for dev in ["/dev/nvidia0", "/dev/nvidiactl", "/dev/nvidia-uvm"]:
                if os.path.exists(dev):
                    devices.append(f"{dev}:{dev}:rwm")

            mounts = {
                self._get_host_models_dir(): {'bind': '/models', 'mode': 'ro'}
            }
            if os.path.exists("/usr/lib/x86_64-linux-gnu/libcuda.so.1"):
                mounts["/usr/lib/x86_64-linux-gnu/libcuda.so.1"] = {"bind": "/usr/lib/x86_64-linux-gnu/libcuda.so.1", "mode": "ro"}
            if os.path.exists("/usr/lib/x86_64-linux-gnu/libnvidia-ml.so.1"):
                mounts["/usr/lib/x86_64-linux-gnu/libnvidia-ml.so.1"] = {"bind": "/usr/lib/x86_64-linux-gnu/libnvidia-ml.so.1", "mode": "ro"}

            ports = {'5001/tcp': 5001}
            net = self._get_network()

            def _run():
                run_kwargs = dict(
                    image=image_name,
                    name=container_name,
                    entrypoint="/usr/local/lib/ollama/llama-server",
                    command=cmd_args,
                    volumes=mounts,
                    ports=ports,
                    detach=True,
                )
                if devices:
                    run_kwargs["devices"] = devices
                if net:
                    run_kwargs["network"] = net
                return self.client.containers.run(**run_kwargs)

            await loop.run_in_executor(None, _run)
            logger.info(f"Successfully launched {container_name} with {model_file}")
            return True
        except Exception as e:
            logger.warning(f"Error launching koboldcpp container: {e}")
            return False

    @staticmethod
    def get_vram_usage() -> Dict[str, float]:
        """Fetch current VRAM usage from nvidia-smi."""
        if not shutil.which("nvidia-smi"):
            return {"total_mb": 4096.0, "used_mb": 0.0, "free_mb": 4096.0, "utilization_pct": 0.0}

        try:
            cmd = ["nvidia-smi", "--query-gpu=memory.total,memory.used,memory.free", "--format=csv,noheader,nounits"]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            line = result.stdout.strip().split("\n")[0]
            parts = [float(p.strip()) for p in line.split(",")]
            total, used, free = parts[0], parts[1], parts[2]
            pct = round((used / total) * 100, 1) if total > 0 else 0.0
            return {
                "total_mb": total,
                "used_mb": used,
                "free_mb": free,
                "utilization_pct": pct,
            }
        except Exception as e:
            logger.debug(f"nvidia-smi call failed: {e}")
            return {"total_mb": 4096.0, "used_mb": 0.0, "free_mb": 4096.0, "utilization_pct": 0.0}


docker_manager = DockerManager()
