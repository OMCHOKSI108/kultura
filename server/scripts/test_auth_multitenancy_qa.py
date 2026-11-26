import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def run_test():
    print("=" * 80)
    print("  KULTURA AUTH & MULTI-TENANCY VERIFICATION SUITE")
    print("=" * 80)

    # 1. Admin Login
    print("\n1. Testing Admin Login with .env credentials (omchoksi99@gmail.com)...")
    res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username_or_email": "omchoksi99@gmail.com",
        "password": "ucantrustme"
    })
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    admin_data = res.json()
    admin_token = admin_data["access_token"]
    assert admin_data["user"]["role"] == "admin"
    print(f"   ✅ Admin logged in. UserID: {admin_data['user']['id']}, Role: {admin_data['user']['role']}")

    # 2. Admin verifies profile via /api/auth/me
    print("\n2. Testing /api/auth/me for Admin...")
    res = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert res.json()["username"] == "omchoksi99"
    print("   ✅ /api/auth/me returned valid admin profile.")

    # 3. Admin creates User A (dev_alice)
    print("\n3. Creating User A (dev_alice)...")
    res = requests.post(
        f"{BASE_URL}/api/auth/users",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "username": "dev_alice",
            "email": "alice@kultura.ai",
            "password": "alicePassword123!",
            "role": "user"
        }
    )
    if res.status_code == 400 and "already in use" in res.text:
        print("   ℹ️  dev_alice already exists, continuing...")
    else:
        assert res.status_code in (200, 201), f"Failed to create dev_alice: {res.text}"
        print(f"   ✅ Created dev_alice: {res.json()['id']}")

    # 4. Admin creates User B (dev_bob)
    print("\n4. Creating User B (dev_bob)...")
    res = requests.post(
        f"{BASE_URL}/api/auth/users",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "username": "dev_bob",
            "email": "bob@kultura.ai",
            "password": "bobPassword123!",
            "role": "user"
        }
    )
    bob_id = None
    if res.status_code == 400 and "already in use" in res.text:
        print("   ℹ️  dev_bob already exists, continuing...")
    else:
        assert res.status_code in (200, 201), f"Failed to create dev_bob: {res.text}"
        bob_id = res.json()["id"]
        print(f"   ✅ Created dev_bob: {bob_id}")

    # 5. Login as dev_alice
    print("\n5. Logging in as dev_alice...")
    res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username_or_email": "dev_alice",
        "password": "alicePassword123!"
    })
    assert res.status_code == 200, f"Alice login failed: {res.text}"
    alice_token = res.json()["access_token"]
    alice_id = res.json()["user"]["id"]
    print("   ✅ dev_alice authenticated successfully.")

    # 6. Alice creates a private session
    print("\n6. Alice creates a private chat session...")
    res = requests.post(
        f"{BASE_URL}/api/sessions",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={"title": "Alice's Secret Project Architecture", "provider": "ollama", "model": "qwen3.5:4b"}
    )
    assert res.status_code == 200
    alice_session_id = res.json()["id"]
    print(f"   ✅ Created session for Alice: {alice_session_id}")

    # 7. Alice lists her sessions
    print("\n7. Listing sessions for Alice...")
    res = requests.get(f"{BASE_URL}/api/sessions", headers={"Authorization": f"Bearer {alice_token}"})
    assert res.status_code == 200
    alice_sessions = res.json()
    assert any(s["id"] == alice_session_id for s in alice_sessions)
    print(f"   ✅ Alice sees her session (total: {len(alice_sessions)}).")

    # 8. Login as dev_bob
    print("\n8. Logging in as dev_bob...")
    res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username_or_email": "dev_bob",
        "password": "bobPassword123!"
    })
    assert res.status_code == 200, f"Bob login failed: {res.text}"
    bob_token = res.json()["access_token"]
    bob_id = res.json()["user"]["id"]
    print("   ✅ dev_bob authenticated successfully.")

    # 9. Verify dev_bob CANNOT see Alice's session in their session list
    print("\n9. Testing Multi-Tenant Isolation (Bob listing sessions)...")
    res = requests.get(f"{BASE_URL}/api/sessions", headers={"Authorization": f"Bearer {bob_token}"})
    assert res.status_code == 200
    bob_sessions = res.json()
    assert not any(s["id"] == alice_session_id for s in bob_sessions)
    print("   ✅ Bob cannot see Alice's session in his session list! (Total Bob sessions: " + str(len(bob_sessions)) + ")")

    # 10. Verify dev_bob gets 403 Forbidden trying to access Alice's session directly
    print("\n10. Testing Cross-Tenant Breach Prevention (Bob fetching Alice's session ID)...")
    res = requests.get(f"{BASE_URL}/api/sessions/{alice_session_id}", headers={"Authorization": f"Bearer {bob_token}"})
    assert res.status_code == 403, f"Expected 403 Forbidden but got {res.status_code}"
    print("   ✅ Direct unauthorized access rejected with HTTP 403 Forbidden!")

    # 11. Admin lists all users
    print("\n11. Testing Admin User List...")
    res = requests.get(f"{BASE_URL}/api/auth/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    users_list = res.json()
    assert len(users_list) >= 3
    print(f"   ✅ Admin retrieved all {len(users_list)} users.")

    # 12. Admin resets Alice's password
    print("\n12. Testing Admin Password Reset for Alice...")
    res = requests.patch(
        f"{BASE_URL}/api/auth/users/{alice_id}/password",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"new_password": "NewAlicePassword456!"}
    )
    assert res.status_code == 200
    print("   ✅ Password updated by admin.")

    # Alice logs in with new password
    res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username_or_email": "dev_alice",
        "password": "NewAlicePassword456!"
    })
    assert res.status_code == 200
    print("   ✅ Alice successfully logged in with newly reset password.")

    # 13. Admin deletes Bob
    print("\n13. Testing User Deletion (Deleting Bob)...")
    res = requests.delete(f"{BASE_URL}/api/auth/users/{bob_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    print("   ✅ Bob account successfully deleted.")

    # Bob cannot login anymore
    res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username_or_email": "dev_bob",
        "password": "bobPassword123!"
    })
    assert res.status_code == 401
    print("   ✅ Deleted user login correctly rejected with HTTP 401 Unauthorized.")

    print("\n" + "=" * 80)
    print("  🎉 ALL 13 AUTH & MULTI-TENANCY TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 80)

if __name__ == "__main__":
    run_test()
