#!/usr/bin/env python3
"""
Record a scripted walkthrough of the Kultura chat UI with Playwright.

Usage (Playwright + browsers are installed for python3.12):

    python3.12 automation/record_demo.py

    # custom output / target
    python3.12 automation/record_demo.py --base-url http://localhost:3000 --out-dir automation/recordings

If the dev server is not reachable it is started automatically (`npm run dev`)
and stopped again when recording finishes. A raw .webm video is written to
--out-dir; convert it with ffmpeg, e.g.:

    ffmpeg -i demo.webm -vf "fps=12,scale=1000:-1:flags=lanczos" assets/demo.gif
"""

import argparse
import os
import shutil
import signal
import subprocess
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


def server_is_up(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return response.status < 500
    except Exception:
        return False


def start_dev_server(url: str) -> subprocess.Popen:
    npm = shutil.which("npm")
    if not npm:
        raise RuntimeError("npm not found; start the dev server manually")

    process = subprocess.Popen(
        [npm, "run", "dev"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    for _ in range(90):
        if server_is_up(url):
            return process
        time.sleep(1)

    process.terminate()
    raise RuntimeError(f"dev server did not become ready at {url}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Record the Kultura demo")
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--out-dir", default=str(ROOT / "automation" / "recordings"))
    parser.add_argument("--width", type=int, default=1600)
    parser.add_argument("--height", type=int, default=900)
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.webm"):
        old.unlink()

    server = None
    if not server_is_up(args.base_url):
        print(f"starting dev server for {args.base_url} ...")
        server = start_dev_server(args.base_url)

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
            )
            context = browser.new_context(
                viewport={"width": args.width, "height": args.height},
                record_video_dir=str(out_dir),
                record_video_size={"width": args.width, "height": args.height},
                device_scale_factor=1,
            )
            video = None
            try:
                page = context.new_page()
                video = page.video

                print(f"opening {args.base_url} ...")
                page.goto(args.base_url, wait_until="networkidle")
                page.wait_for_timeout(1400)

                middle_x, middle_y = args.width // 2, args.height // 2

                # 1. Start at the top of the seeded "Launch Kultura" chat, then
                #    scroll through the conversation.
                page.locator(".overflow-y-auto").first.evaluate(
                    "el => el.scrollTo({ top: 0, behavior: 'smooth' })"
                )
                page.wait_for_timeout(1600)
                page.mouse.move(middle_x, middle_y)
                page.mouse.wheel(0, 600)
                page.wait_for_timeout(1000)
                page.mouse.wheel(0, 600)
                page.wait_for_timeout(900)

                # 2. Open the history panel and showcase past chats.
                page.get_by_role("button", name="History", exact=True).click()
                page.wait_for_timeout(1200)

                past_chat = page.get_by_text("Explain React hooks", exact=True).first
                past_chat.hover()
                page.wait_for_timeout(700)
                past_chat.click()
                page.wait_for_timeout(1400)

                # 3. Start a fresh chat and ask a question.
                page.get_by_role("button", name="New Chat").first.click()
                page.wait_for_timeout(900)

                composer = page.get_by_placeholder("Ask Kultura anything...")
                composer.click()
                composer.press_sequentially("How do I connect a database to Kultura?", delay=28)
                page.wait_for_timeout(500)

                page.get_by_role("button", name="Send message").click()
                page.wait_for_timeout(1000)   # question appears, thinking starts
                page.wait_for_timeout(2800)   # thinking steps complete + reply
                page.wait_for_timeout(1600)   # hold on the finished answer

                # 4. Settle on the completed conversation.
                page.mouse.move(middle_x, middle_y)
                page.mouse.wheel(0, -200)
                page.wait_for_timeout(1200)
            finally:
                context.close()
                browser.close()

            if video is not None:
                print(f"video: {video.path()}")
    finally:
        if server is not None:
            try:
                os.killpg(os.getpgid(server.pid), signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                pass
            server.wait(timeout=15)


if __name__ == "__main__":
    main()
