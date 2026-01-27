import requests
import time

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def testuserauthenticationwithemailpasswordandoauth():
    session = requests.Session()
    headers = {"Content-Type": "application/json"}
    
    # Helper functions
    def register_email_user(email, password):
        url = f"{BASE_URL}/api/auth/register"
        payload = {
            "email": email,
            "password": password
        }
        resp = session.post(url, json=payload, headers=headers, timeout=TIMEOUT)
        return resp

    def login_email_user(email, password):
        url = f"{BASE_URL}/api/auth/login"
        payload = {
            "email": email,
            "password": password
        }
        resp = session.post(url, json=payload, headers=headers, timeout=TIMEOUT)
        return resp

    def oauth_login(provider, token):
        url = f"{BASE_URL}/api/auth/oauth/{provider}"
        payload = {"token": token}
        resp = session.post(url, json=payload, headers=headers, timeout=TIMEOUT)
        return resp

    def logout():
        url = f"{BASE_URL}/api/auth/logout"
        resp = session.post(url, headers=headers, timeout=TIMEOUT)
        return resp

    def sql_injection_test_login():
        url = f"{BASE_URL}/api/auth/login"
        payload = {
            "email": "' OR '1'='1",
            "password": "' OR '1'='1"
        }
        resp = session.post(url, json=payload, headers=headers, timeout=TIMEOUT)
        return resp

    def xss_test_registration():
        url = f"{BASE_URL}/api/auth/register"
        payload = {
            "email": "xss@test.com",
            "password": "<script>alert('xss')</script>"
        }
        resp = session.post(url, json=payload, headers=headers, timeout=TIMEOUT)
        return resp


    # Test data
    test_email = "testuser@example.com"
    test_password = "StrongPass!123"
    malicious_email = "malicious@example.com"
    malicious_password = "Password<script>alert('xss')</script>"
    
    # 1. Register new user (success)
    resp = register_email_user(test_email, test_password)
    assert resp.status_code == 201 or resp.status_code == 409, f"Unexpected registration status {resp.status_code}"
    if resp.status_code == 409:
        # User exists, proceed
        pass
    else:
        data = resp.json()
        assert "id" in data or "user" in data, "Registration response missing user info"
    
    # 2. Register with XSS attempt - should fail or sanitize
    resp_xss = xss_test_registration()
    assert resp_xss.status_code in (400, 422), f"XSS registration not rejected, status: {resp_xss.status_code}"

    # 3. Login with correct email/password (success)
    resp_login = login_email_user(test_email, test_password)
    assert resp_login.status_code == 200, f"Failed to login valid user, status: {resp_login.status_code}"
    data_login = resp_login.json()
    assert "token" in data_login or "session" in data_login, "Login response missing session token"

    # 4. Login with incorrect password (fail)
    resp_login_bad = login_email_user(test_email, "WrongPassword123!")
    assert resp_login_bad.status_code in (401, 403), f"Login with wrong password should fail, got {resp_login_bad.status_code}"

    # 5. Login with SQL injection attempt (fail)
    resp_sql_inj = sql_injection_test_login()
    assert resp_sql_inj.status_code in (400, 401, 403), f"SQL Injection login attempt not properly handled, got {resp_sql_inj.status_code}"
    # Optionally check for sanitized message or error
    body_sql_inj = resp_sql_inj.text.lower()
    assert "error" in body_sql_inj or "invalid" in body_sql_inj, "SQL injection login response missing error message"

    # 6. OAuth login - simulate GitHub and Google (mock token)
    for provider in ["github", "google"]:
        # Use dummy token "valid-oauth-token" for simulation
        resp_oauth = oauth_login(provider, "valid-oauth-token")
        # Accept 200 or 401 if OAuth token is invalid since no real token
        assert resp_oauth.status_code in (200, 401, 403), f"OAuth login {provider} unexpected status {resp_oauth.status_code}"
        if resp_oauth.status_code == 200:
            data_oauth = resp_oauth.json()
            assert "token" in data_oauth or "session" in data_oauth, f"OAuth login {provider} missing session token"

    # 7. Verify session persistence after login - simulate by accessing protected endpoint
    resp_protected = session.get(f"{BASE_URL}/api/user/profile", headers=headers, timeout=TIMEOUT)
    # Should be 200 if session valid or 401 unauthorized
    assert resp_protected.status_code in (200, 401), f"Unexpected status for protected endpoint: {resp_protected.status_code}"

    # 8. Logout
    resp_logout = logout()
    assert resp_logout.status_code in (200, 204), f"Logout failed with status {resp_logout.status_code}"

    # 9. Access protected resource after logout must fail (401)
    resp_post_logout = session.get(f"{BASE_URL}/api/user/profile", headers=headers, timeout=TIMEOUT)
    assert resp_post_logout.status_code == 401, f"Accessing resource after logout should be unauthorized, got {resp_post_logout.status_code}"

testuserauthenticationwithemailpasswordandoauth()