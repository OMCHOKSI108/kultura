#!/usr/bin/env python3
"""
Deep QA Test Suite for Kultura AI Inference Gateway (FastAPI Backend)
====================================================================
Tests all required endpoints against http://localhost:8000:
1. Providers:
   - GET /api/providers
   - GET /api/providers/vram
   - GET /api/providers/health
   - GET /api/providers/{provider_name}/models
2. Hub Models & Search:
   - GET /api/hub/models (verifying endpoint presence / mismatch vs spec)
   - GET /api/hub/search (test query, tag filtering, sorting, GGUF count validation)
   - GET /api/hub/models/{repo_id}/files (file quantization & VRAM fit)
3. Chat Sessions CRUD:
   - POST /api/sessions (creation)
   - GET /api/sessions (listing & preview)
   - GET /api/sessions/{id} (fetching single session)
   - PATCH /api/sessions/{id} (updating session title/model)
   - GET /api/sessions/{id}/messages (fetching messages)
   - DELETE /api/sessions/{id} (deletion & cascade)
   - Non-existent session handling (404 checks)
4. Chat Completions (Unified Streaming & Handoff):
   - Fast mode (enable_thinking=False)
   - Thinking mode (enable_thinking=True)
   - Web search grounding (web_search=True)
   - Empty messages list (messages=[])
   - Invalid provider name (400 check)
   - Malformed payloads (422 validation checks)
5. Database Verification (PostgreSQL):
   - Message and Session records
   - Reasoning & thinking_content columns
   - Sources_json column integrity
   - Message_metrics table linkage and metrics fidelity
   - Foreign key cascade deletions

Records HTTP status, response schema validity, latency (ms), and logs all issues.
"""

import asyncio
import json
import os
import re
import sys
import time
from typing import Any, Dict, List, Optional, Tuple
import httpx
import psycopg2
from psycopg2.extras import RealDictCursor

# Ensure server/ is on sys.path for schema validation
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

from schemas.provider_schemas import ProviderStatus, VramStatus, ModelInfo
from schemas.hub_schemas import HubModelSearchItem, HubModelDetails
from schemas.chat_schemas import (
    SessionResponse,
    MessageResponse,
    MessageMetricsSchema,
    ChatCompletionRequest,
)

BASE_URL = os.getenv("GATEWAY_URL", "http://localhost:8000")
PG_HOST = os.getenv("PG_HOST", "127.0.0.1")
PG_PORT = int(os.getenv("PG_PORT", "5434"))
PG_USER = os.getenv("PG_USER", "kultura")
PG_PASSWORD = os.getenv("PG_PASSWORD", "kultura")
PG_DATABASE = os.getenv("PG_DATABASE", "kultura")


class TestCaseResult:
    def __init__(self, category: str, test_id: str, description: str):
        self.category = category
        self.test_id = test_id
        self.description = description
        self.passed: bool = True
        self.status_code: Optional[int] = None
        self.expected_status: Optional[int] = None
        self.latency_ms: float = 0.0
        self.schema_valid: bool = True
        self.schema_error: Optional[str] = None
        self.issue_type: Optional[str] = None  # None, "BUG_4XX", "BUG_5XX", "SCHEMA_MISMATCH", "LOGIC_BUG", "SPEC_DEVIATION"
        self.details: Dict[str, Any] = {}
        self.error_message: Optional[str] = None

    def mark_pass(self, status_code: int, latency_ms: float, details: Optional[Dict[str, Any]] = None):
        self.passed = True
        self.status_code = status_code
        self.latency_ms = round(latency_ms, 2)
        if details:
            self.details.update(details)

    def mark_fail(
        self,
        error_message: str,
        issue_type: str = "LOGIC_BUG",
        status_code: Optional[int] = None,
        expected_status: Optional[int] = None,
        latency_ms: float = 0.0,
        schema_valid: bool = True,
        schema_error: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.passed = False
        self.error_message = error_message
        self.issue_type = issue_type
        self.status_code = status_code
        self.expected_status = expected_status
        self.latency_ms = round(latency_ms, 2)
        self.schema_valid = schema_valid
        self.schema_error = schema_error
        if details:
            self.details.update(details)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "category": self.category,
            "test_id": self.test_id,
            "description": self.description,
            "passed": self.passed,
            "status_code": self.status_code,
            "expected_status": self.expected_status,
            "latency_ms": self.latency_ms,
            "schema_valid": self.schema_valid,
            "schema_error": self.schema_error,
            "issue_type": self.issue_type,
            "error_message": self.error_message,
            "details": self.details,
        }


class GatewayQASuite:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url.rstrip("/")
        self.results: List[TestCaseResult] = []
        self.client = httpx.Client(base_url=self.base_url, timeout=45.0)
        self.db_conn = None

    def get_db_connection(self):
        if self.db_conn is None or self.db_conn.closed:
            self.db_conn = psycopg2.connect(
                host=PG_HOST,
                port=PG_PORT,
                user=PG_USER,
                password=PG_PASSWORD,
                dbname=PG_DATABASE,
                cursor_factory=RealDictCursor,
            )
            self.db_conn.autocommit = True
        return self.db_conn

    def record(self, result: TestCaseResult):
        self.results.append(result)
        icon = "✅" if result.passed else ("⚠️" if result.issue_type == "SPEC_DEVIATION" else "❌")
        status_info = f"HTTP {result.status_code}" if result.status_code else "N/A"
        print(f" {icon} [{result.category}] {result.test_id}: {result.description}")
        print(f"    ├─ Status: {status_info} (expected: {result.expected_status or 200}) | Latency: {result.latency_ms:.1f}ms | Schema Valid: {result.schema_valid}")
        if not result.passed:
            print(f"    ├─ Issue: {result.issue_type} - {result.error_message}")
            if result.schema_error:
                print(f"    ├─ Schema Error: {result.schema_error}")
            if result.details:
                print(f"    └─ Details: {json.dumps(result.details, default=str)[:300]}")
        elif result.details:
            detail_str = json.dumps(result.details, default=str)
            if len(detail_str) > 120:
                detail_str = detail_str[:120] + "..."
            print(f"    └─ Details: {detail_str}")

    # =========================================================================
    # 1. PROVIDER ENDPOINT TESTS
    # =========================================================================

    def test_providers_endpoints(self):
        print("\n" + "=" * 80)
        print("  SUITE 1: PROVIDER LIFECYCLE & VRAM ENDPOINTS")
        print("=" * 80)

        # 1.1 GET /api/providers
        res = TestCaseResult("Providers", "GET_PROVIDERS", "List all 5 AI providers and container status")
        t0 = time.perf_counter()
        try:
            r = self.client.get("/api/providers")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 200:
                data = r.json()
                if not isinstance(data, list):
                    res.mark_fail("Response is not a list", "SCHEMA_MISMATCH", r.status_code, 200, lat, False)
                else:
                    # Validate each item against ProviderStatus
                    for item in data:
                        ProviderStatus.model_validate(item)
                    names = [p["name"] for p in data]
                    res.mark_pass(r.status_code, lat, {"count": len(data), "providers": names})
            else:
                res.mark_fail(f"Unexpected status: {r.status_code}", "BUG_4XX" if r.status_code < 500 else "BUG_5XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "SCHEMA_MISMATCH" if "validation" in str(e).lower() else "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 1.2 GET /api/providers/vram
        res = TestCaseResult("Providers", "GET_PROVIDERS_VRAM", "Query GPU VRAM status and utilization")
        t0 = time.perf_counter()
        try:
            r = self.client.get("/api/providers/vram")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 200:
                data = r.json()
                vram_obj = VramStatus.model_validate(data)
                res.mark_pass(r.status_code, lat, {
                    "total_mb": vram_obj.total_mb,
                    "used_mb": vram_obj.used_mb,
                    "free_mb": vram_obj.free_mb,
                    "utilization_pct": vram_obj.utilization_pct,
                })
            else:
                res.mark_fail(f"Unexpected status {r.status_code}", "BUG_5XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "SCHEMA_MISMATCH", latency_ms=lat)
        self.record(res)

        # 1.3 GET /api/providers/health
        res = TestCaseResult("Providers", "GET_PROVIDERS_HEALTH", "Provider reachability and health rollup")
        t0 = time.perf_counter()
        try:
            r = self.client.get("/api/providers/health")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 200:
                data = r.json()
                assert "status" in data and "online_count" in data and "vram" in data
                res.mark_pass(r.status_code, lat, {"status": data["status"], "online": data["online_count"]})
            else:
                res.mark_fail(f"Status {r.status_code}", "BUG_5XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 1.4 GET /api/providers/{provider}/models for valid provider (ollama)
        res = TestCaseResult("Providers", "GET_PROVIDER_MODELS_VALID", "List models for active provider 'ollama'")
        t0 = time.perf_counter()
        try:
            r = self.client.get("/api/providers/ollama/models")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 200:
                data = r.json()
                for item in data:
                    ModelInfo.model_validate(item)
                res.mark_pass(r.status_code, lat, {"models_count": len(data), "models": [m["id"] for m in data]})
            else:
                res.mark_fail(f"Status {r.status_code}", "BUG_5XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "SCHEMA_MISMATCH", latency_ms=lat)
        self.record(res)

        # 1.5 GET /api/providers/{provider}/models for invalid provider
        res = TestCaseResult("Providers", "GET_PROVIDER_MODELS_INVALID", "Handle unknown provider name (expect 404)")
        t0 = time.perf_counter()
        try:
            r = self.client.get("/api/providers/invalid_provider_xyz/models")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 404
            if r.status_code == 404:
                res.mark_pass(r.status_code, lat, {"detail": r.json().get("detail")})
            else:
                res.mark_fail(f"Expected 404, got {r.status_code}", "LOGIC_BUG", r.status_code, 404, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

    # =========================================================================
    # 2. HUB MODELS & SEARCH TESTS
    # =========================================================================

    def test_hub_endpoints(self):
        print("\n" + "=" * 80)
        print("  SUITE 2: HUGGINGFACE HUB SEARCH & GGUF VALIDATION")
        print("=" * 80)

        # 2.1 GET /api/hub/models (Spec check / Endpoint mismatch discovery)
        res = TestCaseResult("Hub", "GET_HUB_MODELS_SPEC", "Inspect GET /api/hub/models vs implemented /api/hub/search")
        t0 = time.perf_counter()
        try:
            r = self.client.get("/api/hub/models")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 404:
                # Discovered Bug / Spec Mismatch
                res.mark_fail(
                    "Endpoint GET /api/hub/models returned 404 Not Found. Hub search is exposed at /api/hub/search instead.",
                    issue_type="SPEC_DEVIATION",
                    status_code=404,
                    expected_status=200,
                    latency_ms=lat,
                    details={
                        "root_cause": "server/routers/hub.py exposes @router.get('/search') but has no route for @router.get('/models')",
                        "resolution": "Alias @router.get('/models') to search_hub_models in server/routers/hub.py or update docs/clients.",
                    }
                )
            elif r.status_code == 200:
                res.mark_pass(r.status_code, lat, {"message": "Endpoint /api/hub/models is available"})
            else:
                res.mark_fail(f"Status {r.status_code}", "BUG_4XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 2.2 GET /api/hub/search (General search & GGUF count validation)
        res = TestCaseResult("Hub", "GET_HUB_SEARCH_DEFAULT", "Search HuggingFace Hub and validate gguf_count > 0")
        t0 = time.perf_counter()
        try:
            r = self.client.get("/api/hub/search", params={"limit": 10})
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 200:
                data = r.json()
                if not isinstance(data, list):
                    res.mark_fail("Response is not a list", "SCHEMA_MISMATCH", r.status_code, 200, lat, False)
                else:
                    zero_gguf_models = []
                    validated_count = 0
                    for m in data:
                        HubModelSearchItem.model_validate(m)
                        validated_count += 1
                        if m.get("gguf_count", 0) <= 0:
                            zero_gguf_models.append(m.get("id"))

                    if zero_gguf_models:
                        res.mark_fail(
                            f"Found models with gguf_count <= 0: {zero_gguf_models}",
                            "LOGIC_BUG",
                            r.status_code,
                            200,
                            lat,
                            details={"invalid_models": zero_gguf_models}
                        )
                    else:
                        res.mark_pass(r.status_code, lat, {
                            "results_count": len(data),
                            "first_model": data[0]["id"] if data else None,
                            "all_gguf_count_valid": True,
                        })
            else:
                res.mark_fail(f"Status {r.status_code}: {r.text}", "BUG_5XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "SCHEMA_MISMATCH", latency_ms=lat)
        self.record(res)

        # 2.3 GET /api/hub/search?q=qwen (Search query & tag filtering)
        res = TestCaseResult("Hub", "GET_HUB_SEARCH_QUERY", "Search query 'qwen' with tag and architecture parsing")
        t0 = time.perf_counter()
        try:
            r = self.client.get("/api/hub/search", params={"q": "qwen", "sort": "downloads", "limit": 5})
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 200:
                data = r.json()
                matched = [m["id"] for m in data if "qwen" in m["id"].lower() or any("qwen" in t.lower() for t in m.get("tags", []))]
                for m in data:
                    HubModelSearchItem.model_validate(m)
                res.mark_pass(r.status_code, lat, {
                    "count": len(data),
                    "matched_query": len(matched),
                    "models": [m["id"] for m in data],
                })
            else:
                res.mark_fail(f"Status {r.status_code}", "BUG_5XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "SCHEMA_MISMATCH", latency_ms=lat)
        self.record(res)

        # 2.4 GET /api/hub/models/{repo_id}/files (File quantizations & VRAM fit computation)
        sample_repo = "Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF"
        res = TestCaseResult("Hub", "GET_HUB_MODEL_FILES", f"Fetch files & quantizations for '{sample_repo}'")
        t0 = time.perf_counter()
        try:
            r = self.client.get(f"/api/hub/models/{sample_repo}/files")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 200:
                data = r.json()
                details = HubModelDetails.model_validate(data)
                quants = [f.quant for f in details.files]
                res.mark_pass(r.status_code, lat, {
                    "files_count": len(details.files),
                    "quants": quants[:6],
                    "vram_fits": [f.vram_fit for f in details.files[:6]],
                })
            else:
                res.mark_fail(f"Status {r.status_code}", "BUG_5XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "SCHEMA_MISMATCH", latency_ms=lat)
        self.record(res)

    # =========================================================================
    # 3. CHAT SESSIONS CRUD TESTS
    # =========================================================================

    def test_sessions_crud(self) -> str:
        print("\n" + "=" * 80)
        print("  SUITE 3: CHAT SESSIONS CRUD LIFECYCLE")
        print("=" * 80)

        created_session_id = None

        # 3.1 POST /api/sessions
        res = TestCaseResult("Sessions", "POST_SESSION_CREATE", "Create a new chat session")
        t0 = time.perf_counter()
        try:
            payload = {"title": "Automated QA Session", "provider": "ollama", "model": "qwen3.5:4b"}
            r = self.client.post("/api/sessions", json=payload)
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 200:
                data = r.json()
                sess = SessionResponse.model_validate(data)
                created_session_id = sess.id
                res.mark_pass(r.status_code, lat, {"session_id": sess.id, "title": sess.title})
            else:
                res.mark_fail(f"Status {r.status_code}", "BUG_5XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "SCHEMA_MISMATCH", latency_ms=lat)
        self.record(res)

        # 3.2 GET /api/sessions (List)
        res = TestCaseResult("Sessions", "GET_SESSIONS_LIST", "List chat sessions with message count and preview")
        t0 = time.perf_counter()
        try:
            r = self.client.get("/api/sessions")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 200:
                data = r.json()
                found = False
                for item in data:
                    s = SessionResponse.model_validate(item)
                    if s.id == created_session_id:
                        found = True
                res.mark_pass(r.status_code, lat, {"total_sessions": len(data), "created_session_found": found})
            else:
                res.mark_fail(f"Status {r.status_code}", "BUG_5XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "SCHEMA_MISMATCH", latency_ms=lat)
        self.record(res)

        # 3.3 GET /api/sessions/{session_id}
        res = TestCaseResult("Sessions", "GET_SESSION_BY_ID", "Retrieve specific session by ID")
        t0 = time.perf_counter()
        try:
            r = self.client.get(f"/api/sessions/{created_session_id}")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 200:
                sess = SessionResponse.model_validate(r.json())
                res.mark_pass(r.status_code, lat, {"id": sess.id, "title": sess.title, "model": sess.model})
            else:
                res.mark_fail(f"Status {r.status_code}", "BUG_4XX" if r.status_code == 404 else "BUG_5XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "SCHEMA_MISMATCH", latency_ms=lat)
        self.record(res)

        # 3.4 PATCH /api/sessions/{session_id}
        res = TestCaseResult("Sessions", "PATCH_SESSION", "Update session title and model")
        t0 = time.perf_counter()
        try:
            patch_payload = {"title": "Updated QA Title", "model": "qwen2.5-coder:1.5b-base"}
            r = self.client.patch(f"/api/sessions/{created_session_id}", json=patch_payload)
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 200:
                sess = SessionResponse.model_validate(r.json())
                assert sess.title == "Updated QA Title"
                res.mark_pass(r.status_code, lat, {"updated_title": sess.title, "model": sess.model})
            else:
                res.mark_fail(f"Status {r.status_code}", "BUG_5XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "SCHEMA_MISMATCH", latency_ms=lat)
        self.record(res)

        # 3.5 GET /api/sessions/{id}/messages (Initially empty)
        res = TestCaseResult("Sessions", "GET_SESSION_MESSAGES_EMPTY", "Fetch messages for new session (expect empty list)")
        t0 = time.perf_counter()
        try:
            r = self.client.get(f"/api/sessions/{created_session_id}/messages")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 200:
                data = r.json()
                assert isinstance(data, list) and len(data) == 0
                res.mark_pass(r.status_code, lat, {"messages": []})
            else:
                res.mark_fail(f"Status {r.status_code}", "BUG_5XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 3.6 GET /api/sessions/non_existent_id (404 Check)
        res = TestCaseResult("Sessions", "GET_SESSION_404", "Fetch non-existent session ID (expect 404)")
        t0 = time.perf_counter()
        try:
            r = self.client.get("/api/sessions/00000000-0000-0000-0000-000000000000")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 404
            if r.status_code == 404:
                res.mark_pass(r.status_code, lat, {"detail": r.json().get("detail")})
            else:
                res.mark_fail(f"Expected 404, got {r.status_code}", "LOGIC_BUG", r.status_code, 404, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 3.7 DELETE /api/sessions/non_existent_id (404 Check)
        res = TestCaseResult("Sessions", "DELETE_SESSION_404", "Delete non-existent session ID (expect 404)")
        t0 = time.perf_counter()
        try:
            r = self.client.delete("/api/sessions/00000000-0000-0000-0000-000000000000")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 404
            if r.status_code == 404:
                res.mark_pass(r.status_code, lat, {"detail": r.json().get("detail")})
            else:
                res.mark_fail(f"Expected 404, got {r.status_code}", "LOGIC_BUG", r.status_code, 404, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # We keep created_session_id for chat completion tests, then delete it later
        return created_session_id

    # =========================================================================
    # 4. CHAT COMPLETIONS TESTS
    # =========================================================================

    def _parse_sse_events(self, sse_text: str) -> List[Tuple[str, Dict[str, Any]]]:
        """Parses raw SSE chunk stream into list of (event_type, parsed_data)."""
        events = []
        current_event = "message"
        for line in sse_text.splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("event:"):
                current_event = line[6:].strip()
            elif line.startswith("data:"):
                data_str = line[5:].strip()
                try:
                    data_obj = json.loads(data_str)
                    events.append((current_event, data_obj))
                except Exception:
                    events.append((current_event, {"raw": data_str}))
        return events

    def test_chat_completions(self, session_id: str) -> Dict[str, Any]:
        print("\n" + "=" * 80)
        print("  SUITE 4: CHAT COMPLETIONS (STREAMING, MODES, VALIDATION)")
        print("=" * 80)

        saved_message_ids = {}

        # 4.1 Fast Mode (enable_thinking=False)
        res = TestCaseResult("Chat", "POST_CHAT_FAST_MODE", "Fast mode chat completion (no thinking overhead)")
        t0 = time.perf_counter()
        try:
            payload = {
                "session_id": session_id,
                "provider": "ollama",
                "model": "qwen3.5:4b",
                "messages": [{"role": "user", "content": "What is the capital of France? Answer in exactly one word."}],
                "enable_thinking": False,
                "max_tokens": 10,
            }
            with self.client.stream("POST", "/api/chat/completions", json=payload, timeout=60.0) as resp:
                lat = (time.perf_counter() - t0) * 1000
                res.status_code = resp.status_code
                res.expected_status = 200
                if resp.status_code == 200:
                    body = resp.read().decode("utf-8")
                    events = self._parse_sse_events(body)
                    event_types = [e[0] for e in events]
                    done_event = next((e[1] for e in events if e[0] == "done"), None)
                    metrics_event = next((e[1] for e in events if e[0] == "metrics"), None)
                    content_chunks = [e[1].get("chunk", "") for e in events if e[0] == "content"]

                    if done_event and "message_id" in done_event:
                        saved_message_ids["fast_assistant_id"] = done_event["message_id"]

                    res.mark_pass(resp.status_code, lat, {
                        "event_types": list(set(event_types)),
                        "content": "".join(content_chunks).strip(),
                        "metrics": metrics_event,
                        "done": done_event,
                    })
                else:
                    res.mark_fail(f"Status {resp.status_code}", "BUG_5XX", resp.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 4.2 Thinking Mode (enable_thinking=True, short completion)
        res = TestCaseResult("Chat", "POST_CHAT_THINKING_MODE", "Thinking mode completion emitting thinking events")
        t0 = time.perf_counter()
        try:
            payload = {
                "session_id": session_id,
                "provider": "ollama",
                "model": "qwen3.5:4b",
                "messages": [{"role": "user", "content": "Which is bigger: 9.9 or 9.11? Answer concisely."}],
                "enable_thinking": True,
                "reasoning_budget": 50,
                "max_tokens": 80,
            }
            with self.client.stream("POST", "/api/chat/completions", json=payload, timeout=40.0) as resp:
                lat = (time.perf_counter() - t0) * 1000
                res.status_code = resp.status_code
                res.expected_status = 200
                if resp.status_code == 200:
                    body = resp.read().decode("utf-8")
                    events = self._parse_sse_events(body)
                    event_types = [e[0] for e in events]
                    thinking_chunks = [e[1].get("chunk", "") for e in events if e[0] == "thinking"]
                    done_event = next((e[1] for e in events if e[0] == "done"), None)
                    metrics_event = next((e[1] for e in events if e[0] == "metrics"), None)

                    if done_event and "message_id" in done_event:
                        saved_message_ids["thinking_assistant_id"] = done_event["message_id"]

                    res.mark_pass(resp.status_code, lat, {
                        "has_thinking_events": "thinking" in event_types,
                        "thinking_length": len("".join(thinking_chunks)),
                        "metrics": metrics_event,
                    })
                else:
                    res.mark_fail(f"Status {resp.status_code}", "BUG_5XX", resp.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 4.3 Web Search Grounding (web_search=True)
        res = TestCaseResult("Chat", "POST_CHAT_WEB_SEARCH", "Web search grounding injecting sources event and citations")
        t0 = time.perf_counter()
        try:
            payload = {
                "session_id": session_id,
                "provider": "ollama",
                "model": "qwen3.5:4b",
                "messages": [{"role": "user", "content": "What is the latest release of Python?"}],
                "web_search": True,
                "enable_thinking": False,
                "max_tokens": 30,
            }
            with self.client.stream("POST", "/api/chat/completions", json=payload, timeout=60.0) as resp:
                lat = (time.perf_counter() - t0) * 1000
                res.status_code = resp.status_code
                res.expected_status = 200
                if resp.status_code == 200:
                    body = resp.read().decode("utf-8")
                    events = self._parse_sse_events(body)
                    event_types = [e[0] for e in events]
                    sources_event = next((e[1] for e in events if e[0] == "sources"), None)
                    done_event = next((e[1] for e in events if e[0] == "done"), None)

                    if done_event and "message_id" in done_event:
                        saved_message_ids["search_assistant_id"] = done_event["message_id"]

                    has_sources = sources_event is not None and isinstance(sources_event, list) and len(sources_event) > 0
                    res.mark_pass(resp.status_code, lat, {
                        "sources_emitted": has_sources,
                        "sources_count": len(sources_event) if has_sources else 0,
                        "first_source": sources_event[0] if has_sources else None,
                    })
                else:
                    res.mark_fail(f"Status {resp.status_code}", "BUG_5XX", resp.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 4.4 Empty Messages Payload (messages=[])
        # Vulnerability / Logic Bug Check: OpenAI spec & standard APIs require min 1 message.
        res = TestCaseResult("Chat", "POST_CHAT_EMPTY_MESSAGES", "Validate rejection of empty messages list (messages=[])")
        t0 = time.perf_counter()
        try:
            payload = {
                "session_id": session_id,
                "provider": "ollama",
                "model": "qwen3.5:4b",
                "messages": [],
            }
            # Should ideally return 422 Unprocessable Entity or 400 Bad Request
            with self.client.stream("POST", "/api/chat/completions", json=payload, timeout=5.0) as resp:
                lat = (time.perf_counter() - t0) * 1000
                res.status_code = resp.status_code
                res.expected_status = 422
                if resp.status_code in (400, 422):
                    res.mark_pass(resp.status_code, lat)
                elif resp.status_code == 200:
                    # LOGIC BUG: Gateway accepts empty messages list and starts LLM streaming out of thin air
                    res.mark_fail(
                        "Gateway returned 200 OK for messages=[] without validation! It created a blank session and started generating tokens without input.",
                        issue_type="LOGIC_BUG",
                        status_code=200,
                        expected_status=422,
                        latency_ms=lat,
                        details={
                            "root_cause": "ChatCompletionRequest in schemas/chat_schemas.py defines `messages: List[ChatMessageInput]` without Field(min_length=1).",
                            "impact": "Wasted GPU/CPU inference tokens, potential infinite hallucination loop on empty prompts.",
                            "fix": "Add `min_length=1` to `messages: List[ChatMessageInput] = Field(..., min_length=1)` in chat_schemas.py.",
                        }
                    )
                else:
                    res.mark_fail(f"Unexpected status: {resp.status_code}", "BUG_4XX", resp.status_code, 422, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 4.5 Invalid Provider Name (expect 400 Bad Request)
        res = TestCaseResult("Chat", "POST_CHAT_INVALID_PROVIDER", "Invalid provider name handling (expect 400)")
        t0 = time.perf_counter()
        try:
            payload = {
                "provider": "non_existent_engine_999",
                "model": "qwen3.5:4b",
                "messages": [{"role": "user", "content": "hi"}],
            }
            r = self.client.post("/api/chat/completions", json=payload, timeout=5.0)
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 400
            if r.status_code == 400:
                detail = r.json().get("detail", "")
                assert "Unknown provider" in detail
                res.mark_pass(r.status_code, lat, {"detail": detail})
            else:
                res.mark_fail(f"Expected 400, got {r.status_code}", "LOGIC_BUG", r.status_code, 400, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 4.6 Malformed Payload: Missing Required 'model' Field (expect 422)
        res = TestCaseResult("Chat", "POST_CHAT_MISSING_MODEL", "Missing required field 'model' (expect 422)")
        t0 = time.perf_counter()
        try:
            payload = {
                "provider": "ollama",
                "messages": [{"role": "user", "content": "hi"}],
            }
            r = self.client.post("/api/chat/completions", json=payload, timeout=5.0)
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 422
            if r.status_code == 422:
                res.mark_pass(r.status_code, lat, {"error_type": r.json()["detail"][0]["type"]})
            else:
                res.mark_fail(f"Expected 422, got {r.status_code}", "LOGIC_BUG", r.status_code, 422, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 4.7 Malformed Payload: Invalid JSON Syntax (expect 422)
        res = TestCaseResult("Chat", "POST_CHAT_MALFORMED_JSON", "Malformed raw JSON syntax (expect 422)")
        t0 = time.perf_counter()
        try:
            r = self.client.post(
                "/api/chat/completions",
                content=b'{"model": "qwen3.5:4b", "messages": [{"role": "user", "content": "unterminated string]}',
                headers={"Content-Type": "application/json"},
                timeout=5.0,
            )
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 422
            if r.status_code == 422:
                res.mark_pass(r.status_code, lat, {"error_msg": r.json()["detail"][0]["msg"]})
            else:
                res.mark_fail(f"Expected 422, got {r.status_code}", "LOGIC_BUG", r.status_code, 422, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 4.8 Malformed Payload: Invalid Data Types (messages is string instead of list)
        res = TestCaseResult("Chat", "POST_CHAT_INVALID_TYPES", "Invalid data type for messages field (expect 422)")
        t0 = time.perf_counter()
        try:
            payload = {
                "model": "qwen3.5:4b",
                "messages": "hello world (not a list)",
            }
            r = self.client.post("/api/chat/completions", json=payload, timeout=5.0)
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 422
            if r.status_code == 422:
                res.mark_pass(r.status_code, lat, {"error_type": r.json()["detail"][0]["type"]})
            else:
                res.mark_fail(f"Expected 422, got {r.status_code}", "LOGIC_BUG", r.status_code, 422, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        return saved_message_ids

    # =========================================================================
    # 5. DATABASE INTEGRITY & VERIFICATION TESTS (POSTGRESQL)
    # =========================================================================

    def test_database_operations(self, session_id: str, saved_ids: Dict[str, str]):
        print("\n" + "=" * 80)
        print("  SUITE 5: POSTGRESQL DATABASE INTEGRITY & PERSISTENCE")
        print("=" * 80)

        conn = self.get_db_connection()
        cur = conn.cursor()

        # 5.1 Verify Session in Database
        res = TestCaseResult("Database", "DB_SESSION_RECORD", f"Verify session {session_id} in PostgreSQL")
        t0 = time.perf_counter()
        try:
            cur.execute("SELECT id, title, provider, model, created_at, updated_at FROM sessions WHERE id = %s", (session_id,))
            row = cur.fetchone()
            lat = (time.perf_counter() - t0) * 1000
            if row:
                res.mark_pass(200, lat, {
                    "id": row["id"],
                    "title": row["title"],
                    "provider": row["provider"],
                    "model": row["model"],
                    "created_at": str(row["created_at"]),
                })
            else:
                res.mark_fail("Session record not found in PostgreSQL", "LOGIC_BUG", latency_ms=lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 5.2 Verify Messages Persistence & Sources / Reasoning columns
        res = TestCaseResult("Database", "DB_MESSAGES_AND_COLUMNS", "Verify messages, reasoning, and sources_json columns")
        t0 = time.perf_counter()
        try:
            cur.execute(
                "SELECT id, role, provider, model, sources_json, reasoning, thinking_content, thinking_duration_ms "
                "FROM messages WHERE session_id = %s ORDER BY created_at ASC",
                (session_id,)
            )
            rows = cur.fetchall()
            lat = (time.perf_counter() - t0) * 1000
            if not rows:
                res.mark_fail("No messages found in DB for session", "LOGIC_BUG", latency_ms=lat)
            else:
                has_sources = False
                has_reasoning = False
                sources_sample = None
                for r in rows:
                    if r["sources_json"]:
                        has_sources = True
                        sources_sample = json.loads(r["sources_json"])
                    if r["reasoning"] or r["thinking_content"]:
                        has_reasoning = True

                res.mark_pass(200, lat, {
                    "messages_in_db": len(rows),
                    "sources_json_persisted": has_sources,
                    "sources_count": len(sources_sample) if sources_sample else 0,
                    "reasoning_persisted": has_reasoning,
                })
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 5.3 Verify Message Metrics Table Linkage
        res = TestCaseResult("Database", "DB_MESSAGE_METRICS", "Verify message_metrics table linkage and token counts")
        t0 = time.perf_counter()
        try:
            cur.execute(
                """
                SELECT m.id AS msg_id, m.role, mm.provider, mm.model, mm.prompt_tokens, mm.completion_tokens,
                       mm.thinking_tokens, mm.tokens_per_sec, mm.ttft_ms, mm.total_duration_ms
                FROM messages m
                JOIN message_metrics mm ON m.id = mm.message_id
                WHERE m.session_id = %s
                """,
                (session_id,)
            )
            metric_rows = cur.fetchall()
            lat = (time.perf_counter() - t0) * 1000
            if not metric_rows:
                res.mark_fail("No metrics joined with messages for this session", "LOGIC_BUG", latency_ms=lat)
            else:
                for row in metric_rows:
                    assert row["prompt_tokens"] >= 0
                    assert row["completion_tokens"] >= 0
                    assert row["tokens_per_sec"] >= 0.0
                    assert row["ttft_ms"] >= 0.0
                res.mark_pass(200, lat, {
                    "metrics_entries": len(metric_rows),
                    "sample": {
                        "tokens_per_sec": metric_rows[0]["tokens_per_sec"],
                        "ttft_ms": metric_rows[0]["ttft_ms"],
                        "prompt_tokens": metric_rows[0]["prompt_tokens"],
                        "completion_tokens": metric_rows[0]["completion_tokens"],
                    }
                })
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

        # 5.4 Verify API Session Messages Retrieval & Joining (GET /api/sessions/{id}/messages)
        res = TestCaseResult("Database", "API_GET_SESSION_MESSAGES", "Verify API deserializes sources and metrics correctly")
        t0 = time.perf_counter()
        try:
            r = self.client.get(f"/api/sessions/{session_id}/messages")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = r.status_code
            res.expected_status = 200
            if r.status_code == 200:
                msgs = r.json()
                for m in msgs:
                    MessageResponse.model_validate(m)

                asst_msgs = [m for m in msgs if m["role"] == "assistant"]
                has_metrics_joined = any(m["metrics"] is not None for m in asst_msgs)
                has_sources_parsed = any(m["sources"] and len(m["sources"]) > 0 for m in asst_msgs)

                res.mark_pass(r.status_code, lat, {
                    "messages_count": len(msgs),
                    "assistant_messages": len(asst_msgs),
                    "metrics_joined": has_metrics_joined,
                    "sources_parsed": has_sources_parsed,
                })
            else:
                res.mark_fail(f"Status {r.status_code}", "BUG_5XX", r.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "SCHEMA_MISMATCH", latency_ms=lat)
        self.record(res)

        # 5.5 Verify Cascade Deletion: DELETE /api/sessions/{id}
        res = TestCaseResult("Database", "DB_CASCADE_DELETION", "Verify ON DELETE CASCADE removes messages and metrics")
        t0 = time.perf_counter()
        try:
            # Delete session via API
            del_resp = self.client.delete(f"/api/sessions/{session_id}")
            lat = (time.perf_counter() - t0) * 1000
            res.status_code = del_resp.status_code
            res.expected_status = 200

            if del_resp.status_code == 200:
                # Check DB directly
                cur.execute("SELECT count(*) AS cnt FROM sessions WHERE id = %s", (session_id,))
                sess_cnt = cur.fetchone()["cnt"]

                cur.execute("SELECT count(*) AS cnt FROM messages WHERE session_id = %s", (session_id,))
                msg_cnt = cur.fetchone()["cnt"]

                assert sess_cnt == 0, "Session was not deleted from PostgreSQL"
                assert msg_cnt == 0, f"Messages were not cascaded; {msg_cnt} orphaned messages remain"

                res.mark_pass(del_resp.status_code, lat, {
                    "session_deleted": True,
                    "orphaned_messages": msg_cnt,
                    "cascade_success": True,
                })
            else:
                res.mark_fail(f"Delete API returned {del_resp.status_code}", "BUG_5XX", del_resp.status_code, 200, lat)
        except Exception as e:
            lat = (time.perf_counter() - t0) * 1000
            res.mark_fail(str(e), "LOGIC_BUG", latency_ms=lat)
        self.record(res)

    # =========================================================================
    # SUMMARY & REPORTING
    # =========================================================================

    def run_all(self):
        print("\n" + "=" * 80)
        print("  STARTING DEEP QA TEST SUITE: KULTURA AI GATEWAY")
        print(f"  Target: {self.base_url} | PostgreSQL: {PG_HOST}:{PG_PORT}/{PG_DATABASE}")
        print("=" * 80)

        # Run Suite 1: Providers
        self.test_providers_endpoints()

        # Run Suite 2: Hub Models & Search
        self.test_hub_endpoints()

        # Run Suite 3: Sessions CRUD
        session_id = self.test_sessions_crud()

        # Run Suite 4: Chat Completions
        saved_ids = self.test_chat_completions(session_id)

        # Run Suite 5: Database Operations & Cascade
        self.test_database_operations(session_id, saved_ids)

        self.generate_report()

    def generate_report(self):
        total = len(self.results)
        passed = sum(1 for r in self.results if r.passed)
        failed = total - passed

        print("\n" + "=" * 80)
        print("  QA EXECUTION SUMMARY REPORT")
        print("=" * 80)
        print(f"  Total Checks: {total}")
        print(f"  Passed:       {passed} ({passed / total * 100:.1f}%)")
        print(f"  Failed/Issues:{failed} ({failed / total * 100:.1f}%)")
        print("-" * 80)

        issues = [r for r in self.results if not r.passed]
        if issues:
            print("\n🚨 DETAILED ISSUES & DEVIATIONS FOUND:")
            for idx, r in enumerate(issues, 1):
                print(f"\n  [{idx}] Category: {r.category} | Test ID: {r.test_id}")
                print(f"      Description: {r.description}")
                print(f"      Issue Type:  {r.issue_type}")
                print(f"      Status:      Got {r.status_code}, Expected {r.expected_status}")
                print(f"      Error:       {r.error_message}")
                if r.details:
                    print(f"      Details:     {json.dumps(r.details, indent=6)}")
        else:
            print("\n🎉 ALL TESTS PASSED WITH 100% SUCCESS!")

        # Write QA report JSON
        report_path = os.path.join(CURRENT_DIR, "qa_report.json")
        report_data = {
            "summary": {
                "total": total,
                "passed": passed,
                "failed": failed,
                "pass_rate_pct": round(passed / total * 100, 2),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            "results": [r.to_dict() for r in self.results],
        }
        with open(report_path, "w") as f:
            json.dump(report_data, f, indent=2)
        print(f"\n📄 Full QA Report saved to: {report_path}\n")


if __name__ == "__main__":
    suite = GatewayQASuite()
    suite.run_all()
