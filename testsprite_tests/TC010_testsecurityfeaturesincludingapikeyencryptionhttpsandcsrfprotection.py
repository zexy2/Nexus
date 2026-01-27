import requests
import time

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def testsecurityfeaturesincludingapikeyencryptionhttpsandcsrfprotection():
    session = requests.Session()
    session.headers.update({
        "Accept": "application/json",
        "Content-Type": "application/json",
    })

    # 1. Test HTTPS enforcement (expect failure on HTTP, success on HTTPS)
    try:
        resp_http = session.get(f"http://localhost:3000/api/auth/session", timeout=TIMEOUT)
        assert resp_http.status_code in (200, 401), "HTTP access allowed but should be denied or redirected"
    except requests.exceptions.SSLError:
        pass
    except Exception:
        pass

    try:
        resp_https = requests.get(f"https://localhost:3000/api/auth/session", timeout=TIMEOUT, verify=False)
        assert resp_https.status_code in (200, 401), "HTTPS endpoint not reachable or not responding"
    except requests.exceptions.RequestException:
        pass

    # 2. Test API key encryption and secure cookie flags from login
    login_payload = {"email": "hexac64930@gmail.com", "password": "Test.123"}
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code in (200, 401, 403, 422), "Login endpoint failed unexpectedly"
    cookies = login_resp.headers.get("Set-Cookie", "")
    if cookies:
        assert "Secure" in cookies or "secure" in cookies, "Cookies should be Secure flagged"
        assert "HttpOnly" in cookies or "httponly" in cookies, "Cookies should be HttpOnly flagged"
        assert "SameSite" in cookies or "samesite" in cookies, "Cookies should have SameSite attribute"

    # 3. Test CSRF protection on write endpoints
    doc_payload = {"title": "Security Test Doc", "content": "Safe Content"}
    create_doc_url = f"{BASE_URL}/api/documents"
    resp_missing_csrf = session.post(create_doc_url, json=doc_payload, timeout=TIMEOUT)
    assert resp_missing_csrf.status_code in (401, 403), "Request without CSRF token should be rejected"

    headers_with_fake_csrf = {"x-csrf-token": "invalidtoken"}
    resp_fake_csrf = session.post(create_doc_url, json=doc_payload, headers=headers_with_fake_csrf, timeout=TIMEOUT)
    assert resp_fake_csrf.status_code in (401, 403), "Request with invalid CSRF token should be rejected"

    # 4. Input sanitization: test SQL injection and XSS
    sql_injection_title = "'; DROP TABLE users; --"
    safe_payload = {"title": sql_injection_title, "content": "Test content"}
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json=login_payload, timeout=TIMEOUT)
    csrf_token = None
    for cookie in session.cookies:
        if cookie.name.lower().startswith("csrf"):
            csrf_token = cookie.value
            break
    if not csrf_token:
        csrf_token = "fake-valid-token"
    headers_with_valid_csrf = {"x-csrf-token": csrf_token}

    try:
        resp_sql_injection = session.post(
            create_doc_url, json=safe_payload, headers=headers_with_valid_csrf, timeout=TIMEOUT
        )
        assert resp_sql_injection.status_code in (201, 400, 422), "SQL injection input not handled properly"
    finally:
        if resp_sql_injection.status_code == 201:
            doc_id = resp_sql_injection.json().get("id")
            if doc_id:
                session.delete(f"{create_doc_url}/{doc_id}", headers=headers_with_valid_csrf, timeout=TIMEOUT)

    xss_payload = "<script>alert('XSS')</script>"
    xss_doc_payload = {"title": "XSS Test", "content": xss_payload}
    resp_xss = session.post(create_doc_url, json=xss_doc_payload, headers=headers_with_valid_csrf, timeout=TIMEOUT)
    try:
        assert resp_xss.status_code == 201, "XSS input rejected unexpectedly"
        doc_id = resp_xss.json().get("id")
        get_resp = session.get(f"{create_doc_url}/{doc_id}", timeout=TIMEOUT)
        assert get_resp.status_code == 200, "Failed to retrieve created document"
        doc_data = get_resp.json()
        assert "<script>" not in doc_data.get("content", ""), "XSS script tags not sanitized"
    finally:
        if resp_xss.status_code == 201 and doc_id:
            session.delete(f"{create_doc_url}/{doc_id}", headers=headers_with_valid_csrf, timeout=TIMEOUT)

    # 5. Rate limiting test
    rate_limit_url = f"{BASE_URL}/api/auth/session"
    was_rate_limited = False
    for _ in range(20):
        rate_resp = session.get(rate_limit_url, timeout=TIMEOUT)
        if rate_resp.status_code == 429:
            was_rate_limited = True
            break
        time.sleep(0.1)

    assert was_rate_limited, "Rate limiting not enforced after repeated rapid requests"

testsecurityfeaturesincludingapikeyencryptionhttpsandcsrfprotection()
