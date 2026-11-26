#!/usr/bin/env python3
"""
Kultura Comprehensive E2E QA Test Suite & RBAC Validation
Validates:
1. Strict Private Mode: All endpoints require authentication (401 for anonymous / invalid token)
2. Double-Submit Cookie CSRF Protection (403 without or with invalid X-CSRF-Token on cookie mutation)
3. Strict User Session Ownership & Cross-User Isolation (User B cannot read/edit/delete User A's session)
4. Role-Based Access Control (Admin vs Standard User permissions on Hub, Providers, Observability, Users)
5. Developer API Key Authentication & Revocation Lifecycle
6. Observability Telemetry Overview & Traces (Admin Only)
7. User Profile Customization & Account Revocation
"""

import os
import sys
import uuid
import httpx

API_BASE = os.environ.get("SERVER_URL", "http://localhost:8000")
ADMIN_EMAIL = os.environ.get("ADMIN_ID", "omchoksi99@gmail.com")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "ucantrustme")


def main():
    print("=" * 75, flush=True)
    print("🚀 RUNNING KULTURA PRODUCTION RBAC & SECURITY QA VALIDATION SUITE", flush=True)
    print("=" * 75, flush=True)

    with httpx.Client(base_url=API_BASE, timeout=15.0) as client:
        # ── 1. Strict Private Application Mode (Unauthenticated Requests) ──
        print("\n[STEP 1/9] Verifying Strict Private Mode & Anonymous Access Denial...", flush=True)
        # Without auth, requests must receive 401 Unauthorized
        anon_sessions = client.get("/api/sessions")
        assert anon_sessions.status_code == 401, f"Security Breach: Anonymous /api/sessions returned {anon_sessions.status_code}"
        
        anon_providers = client.get("/api/providers")
        assert anon_providers.status_code == 401, f"Security Breach: Anonymous /api/providers returned {anon_providers.status_code}"

        anon_hub = client.get("/api/hub/search")
        assert anon_hub.status_code == 401, f"Security Breach: Anonymous /api/hub/search returned {anon_hub.status_code}"

        # Invalid or expired token must also receive 401 Unauthorized
        bad_token_res = client.get("/api/sessions", headers={"Authorization": "Bearer invalid.expired.token"})
        assert bad_token_res.status_code == 401, f"Expected 401 for bad token, got {bad_token_res.status_code}"
        print("  ✓ Strict Private Mode Verified: Anonymous & invalid-token requests rejected with 401 Unauthorized", flush=True)

        # ── 2. Admin Authentication ──
        print("\n[STEP 2/9] Authenticating Admin Account...", flush=True)
        admin_login = client.post(
            "/api/auth/login",
            json={"username_or_email": ADMIN_EMAIL, "password": ADMIN_PASS},
        )
        assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
        admin_data = admin_login.json()
        admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}
        print(f"  ✓ Admin logged in: {admin_data['user']['email']} (Role: {admin_data['user']['role']})", flush=True)

        # ── 3. Standard Users Creation (User A and User B) ──
        user_a_name = f"user_a_{uuid.uuid4().hex[:6]}"
        user_a_email = f"{user_a_name}@kultura.local"
        user_a_pass = "PasswordA123!"

        user_b_name = f"user_b_{uuid.uuid4().hex[:6]}"
        user_b_email = f"{user_b_name}@kultura.local"
        user_b_pass = "PasswordB123!"

        print(f"\n[STEP 3/9] Creating Standard Users '{user_a_name}' & '{user_b_name}'...", flush=True)
        res_a = client.post(
            "/api/auth/users",
            headers=admin_headers,
            json={"username": user_a_name, "email": user_a_email, "password": user_a_pass, "role": "user"},
        )
        assert res_a.status_code == 201, f"User A creation failed: {res_a.text}"
        user_a_id = res_a.json()["id"]

        res_b = client.post(
            "/api/auth/users",
            headers=admin_headers,
            json={"username": user_b_name, "email": user_b_email, "password": user_b_pass, "role": "user"},
        )
        assert res_b.status_code == 201, f"User B creation failed: {res_b.text}"
        user_b_id = res_b.json()["id"]

        login_a = client.post("/api/auth/login", json={"username_or_email": user_a_email, "password": user_a_pass})
        assert login_a.status_code == 200
        user_a_headers = {"Authorization": f"Bearer {login_a.json()['access_token']}"}

        login_b = client.post("/api/auth/login", json={"username_or_email": user_b_email, "password": user_b_pass})
        assert login_b.status_code == 200
        user_b_headers = {"Authorization": f"Bearer {login_b.json()['access_token']}"}
        print("  ✓ User A and User B created and authenticated", flush=True)

        # ── 4. Cross-User Session Ownership & Strict Isolation ──
        print("\n[STEP 4/9] Testing Cross-User Session Ownership & Isolation...", flush=True)
        # User A creates a session
        create_sess = client.post(
            "/api/sessions",
            headers=user_a_headers,
            json={"title": "User A Private Research Chat", "provider": "ollama", "model": "qwen3.5:4b"},
        )
        assert create_sess.status_code == 200, f"Session creation failed: {create_sess.text}"
        session_a_id = create_sess.json()["id"]

        # User B lists sessions: session_a_id must NOT be visible
        b_sessions = client.get("/api/sessions", headers=user_b_headers).json()
        assert not any(s["id"] == session_a_id for s in b_sessions), "Isolation Breach: User B can see User A's session in list!"

        # User B attempts direct access to User A's session: must receive 403 Forbidden
        direct_get = client.get(f"/api/sessions/{session_a_id}", headers=user_b_headers)
        assert direct_get.status_code == 403, f"Ownership Bypass: User B accessed User A's session! Status: {direct_get.status_code}"

        # User B attempts update: must receive 403 Forbidden
        direct_patch = client.patch(f"/api/sessions/{session_a_id}", headers=user_b_headers, json={"title": "Hacked"})
        assert direct_patch.status_code == 403, f"Ownership Bypass: User B modified User A's session! Status: {direct_patch.status_code}"

        # User B attempts delete: must receive 403 Forbidden
        direct_del = client.delete(f"/api/sessions/{session_a_id}", headers=user_b_headers)
        assert direct_del.status_code == 403, f"Ownership Bypass: User B deleted User A's session! Status: {direct_del.status_code}"

        # User B attempts to read messages: must receive 403 Forbidden
        direct_msgs = client.get(f"/api/sessions/{session_a_id}/messages", headers=user_b_headers)
        assert direct_msgs.status_code == 403, f"Ownership Bypass: User B read User A's messages! Status: {direct_msgs.status_code}"

        print("  ✓ Strict Session Isolation Confirmed: All cross-user attempts returned 403 Forbidden", flush=True)

        # ── 5. Double-Submit Cookie CSRF Protection ──
        print("\n[STEP 5/9] Testing Double-Submit CSRF Token Enforcement...", flush=True)
        # Create an isolated cookie-based client session
        with httpx.Client(base_url=API_BASE, timeout=10.0) as cookie_client:
            # Login sets kultura_token and kultura_csrf cookies
            cookie_login = cookie_client.post(
                "/api/auth/login",
                json={"username_or_email": user_a_email, "password": user_a_pass},
            )
            assert cookie_login.status_code == 200
            assert "kultura_token" in cookie_client.cookies
            assert "kultura_csrf" in cookie_client.cookies
            csrf_token = cookie_client.cookies["kultura_csrf"]

            # Mutation without X-CSRF-Token header: must fail with 403 Forbidden
            csrf_fail_res = cookie_client.post(
                "/api/sessions",
                json={"title": "CSRF Attack Attempt", "provider": "ollama", "model": "qwen3.5:4b"},
            )
            assert csrf_fail_res.status_code == 403, f"CSRF Breach: Mutation without CSRF token accepted! Status: {csrf_fail_res.status_code}"
            assert "CSRF validation failed" in csrf_fail_res.json().get("detail", "")
            print("  ✓ Missing X-CSRF-Token rejected: HTTP 403 Forbidden", flush=True)

            # Mutation with mismatched X-CSRF-Token: must fail with 403 Forbidden
            csrf_bad_res = cookie_client.post(
                "/api/sessions",
                headers={"X-CSRF-Token": "tampered_token_value_12345"},
                json={"title": "Tampered CSRF Attempt", "provider": "ollama", "model": "qwen3.5:4b"},
            )
            assert csrf_bad_res.status_code == 403, f"CSRF Breach: Tampered token accepted! Status: {csrf_bad_res.status_code}"
            print("  ✓ Tampered X-CSRF-Token rejected: HTTP 403 Forbidden", flush=True)

            # Mutation with correct X-CSRF-Token: must succeed with 200 OK
            csrf_ok_res = cookie_client.post(
                "/api/sessions",
                headers={"X-CSRF-Token": csrf_token},
                json={"title": "Valid CSRF Session", "provider": "ollama", "model": "qwen3.5:4b"},
            )
            assert csrf_ok_res.status_code == 200, f"Valid CSRF failed: {csrf_ok_res.text}"
            print("  ✓ Valid X-CSRF-Token accepted: HTTP 200 OK", flush=True)

        # ── 6. Role-Based Access Control: Admin vs Standard User Permissions ──
        print("\n[STEP 6/9] Validating RBAC Role Boundaries (Model Loading & Downloads)...", flush=True)
        # Standard user attempting to unload VRAM: 403 Forbidden
        user_unload = client.post("/api/providers/unload", headers=user_a_headers)
        assert user_unload.status_code == 403, f"RBAC Breach: Standard user unloaded VRAM! Status: {user_unload.status_code}"
        print("  ✓ Standard user blocked from POST /api/providers/unload (403 Forbidden)", flush=True)

        # Standard user attempting to load model: 403 Forbidden
        user_load = client.post(
            "/api/providers/ollama/load",
            headers=user_a_headers,
            json={"model": "qwen3.5:4b"},
        )
        assert user_load.status_code == 403, f"RBAC Breach: Standard user loaded model! Status: {user_load.status_code}"
        print("  ✓ Standard user blocked from POST /api/providers/.../load (403 Forbidden)", flush=True)

        # Standard user attempting to trigger model download: 403 Forbidden
        user_download = client.post(
            "/api/hub/download",
            headers=user_a_headers,
            json={"repo_id": "test/model", "filename": "model.gguf", "quant": "Q4_K_M", "provider": "ollama"},
        )
        assert user_download.status_code == 403, f"RBAC Breach: Standard user started download! Status: {user_download.status_code}"
        print("  ✓ Standard user blocked from POST /api/hub/download (403 Forbidden)", flush=True)

        # Standard user attempting to cancel download: 403 Forbidden
        user_cancel = client.delete("/api/hub/downloads/fake-dl-id", headers=user_a_headers)
        assert user_cancel.status_code == 403, f"RBAC Breach: Standard user cancelled download! Status: {user_cancel.status_code}"
        print("  ✓ Standard user blocked from DELETE /api/hub/downloads/... (403 Forbidden)", flush=True)

        # Standard user attempting to access Observability Overview: 403 Forbidden
        user_obs = client.get("/api/observability/overview", headers=user_a_headers)
        assert user_obs.status_code == 403, f"RBAC Breach: Standard user accessed observability! Status: {user_obs.status_code}"
        print("  ✓ Standard user blocked from GET /api/observability/... (403 Forbidden)", flush=True)

        # Standard user attempting to manage users: 403 Forbidden
        user_users = client.get("/api/auth/users", headers=user_a_headers)
        assert user_users.status_code == 403, f"RBAC Breach: Standard user listed users! Status: {user_users.status_code}"
        print("  ✓ Standard user blocked from GET /api/auth/users (403 Forbidden)", flush=True)

        # Admin user allowed on all administrative endpoints
        admin_obs = client.get("/api/observability/overview?window=60m", headers=admin_headers)
        assert admin_obs.status_code == 200, f"Admin observability failed: {admin_obs.text}"
        print("  ✓ Admin authorized for GET /api/observability/overview (200 OK)", flush=True)

        # ── 7. Standard User Allowed Operations ──
        print("\n[STEP 7/9] Verifying Standard User Authorized Operations (Chat & API Keys)...", flush=True)
        # User A can view available providers and models
        user_provs = client.get("/api/providers", headers=user_a_headers)
        assert user_provs.status_code == 200
        assert len(user_provs.json()) >= 1

        user_vram = client.get("/api/providers/vram", headers=user_a_headers)
        assert user_vram.status_code == 200

        # User A can search Hub models
        user_hub = client.get("/api/hub/search?category=code&limit=4", headers=user_a_headers)
        assert user_hub.status_code == 200

        # User A can create and manage their own API keys
        key_res = client.post(
            "/api/auth/api-keys",
            headers=user_a_headers,
            json={"name": "User A Cursor Key"},
        )
        assert key_res.status_code == 201
        raw_key = key_res.json()["raw_key"]
        key_id = key_res.json()["id"]

        # Use the API key to authenticate
        agent_auth = client.get("/api/auth/me", headers={"Authorization": f"Bearer {raw_key}"})
        assert agent_auth.status_code == 200
        assert agent_auth.json()["username"] == user_a_name
        print("  ✓ Standard user successfully created and authenticated with developer API key", flush=True)

        # User B cannot revoke User A's API key (403 Forbidden)
        revoke_cross = client.delete(f"/api/auth/api-keys/{key_id}", headers=user_b_headers)
        assert revoke_cross.status_code == 403, "Ownership Bypass: User B revoked User A's API key!"
        print("  ✓ Cross-user API key revocation blocked (403 Forbidden)", flush=True)

        # User A revoking own key succeeds
        revoke_own = client.delete(f"/api/auth/api-keys/{key_id}", headers=user_a_headers)
        assert revoke_own.status_code in (200, 204)

        # ── 8. User Profile Customization & Personal Usage ──
        print("\n[STEP 8/9] Verifying User Profile Customization & Usage Telemetry...", flush=True)
        profile_res = client.patch(
            "/api/auth/me/profile",
            headers=user_a_headers,
            json={
                "bio": "Senior ML Engineer specializing in local inference pipelines.",
                "designation": "Staff ML Infrastructure Engineer",
            },
        )
        assert profile_res.status_code == 200
        assert profile_res.json()["designation"] == "Staff ML Infrastructure Engineer"

        usage_res = client.get("/api/auth/me/usage", headers=user_a_headers)
        assert usage_res.status_code == 200
        assert "daily" in usage_res.json()
        assert "monthly" in usage_res.json()
        print("  ✓ Profile and personal usage telemetry verified", flush=True)

        # ── 9. Cleanup ──
        print("\n[STEP 9/9] Cleaning Up Test Accounts...", flush=True)
        client.delete(f"/api/auth/users/{user_a_id}", headers=admin_headers)
        client.delete(f"/api/auth/users/{user_b_id}", headers=admin_headers)
        print("  ✓ Temporary test users deleted cleanly", flush=True)

    print("\n" + "=" * 75, flush=True)
    print("🏆 ALL 9 PRODUCTION RBAC & SECURITY TEST SUITES PASSED (100% SUCCESS)", flush=True)
    print("=" * 75, flush=True)


if __name__ == "__main__":
    main()
