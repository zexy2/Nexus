import requests
from requests.auth import HTTPBasicAuth

BASE_URL = "http://localhost:3000"
USERNAME = "hexac64930@gmail.com"
PASSWORD = "Test.123"
TIMEOUT = 30


def test_global_command_palette_navigation_and_security():
    auth = HTTPBasicAuth(USERNAME, PASSWORD)

    # Helper function to check SQLi and XSS injection prevention via search endpoint
    def check_injection_prevention(query):
        url = f"{BASE_URL}/api/search"
        headers = {"Content-Type": "application/json"}
        try:
            resp = requests.get(url, headers=headers, params={"q": query}, auth=auth, timeout=TIMEOUT)
            # Basic assertion: API should not error out (not 500 or 400 without explanation)
            assert resp.status_code == 200 or resp.status_code == 400, f"Unexpected status code for injection test: {resp.status_code}"
            data = resp.json()
            # Check for sanitized response or no dangerous payload reflected
            assert "<script>" not in resp.text.lower(), "Possible XSS vulnerability detected"
            assert "syntax error" not in resp.text.lower(), "Possible SQL error detected"
        except requests.RequestException as e:
            assert False, f"Request failed during injection prevention test: {e}"

    # 1. Authenticate user by hitting a protected resource (documents) to verify auth works
    doc_url = f"{BASE_URL}/api/dashboard/docs"
    headers = {"Accept": "application/json"}

    # Success: Get document list with valid auth
    try:
        resp = requests.get(doc_url, headers=headers, auth=auth, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Expected 200 on documents list, got {resp.status_code}"
        docs = resp.json()
        assert isinstance(docs, list), "Documents response should be a list"
    except requests.RequestException as e:
        assert False, f"Documents list retrieval failed: {e}"

    # Error: Access documents with no auth header
    try:
        resp_no_auth = requests.get(doc_url, headers=headers, timeout=TIMEOUT)
        assert resp_no_auth.status_code == 401 or resp_no_auth.status_code == 403, "Unauthenticated request did not fail properly"
    except requests.RequestException as e:
        assert False, f"Documents no-auth check failed: {e}"

    # 2. Test command palette navigation simulation - try search endpoint for quick navigation and actions
    search_url = f"{BASE_URL}/api/search"

    # Normal: Search with a valid keyword
    try:
        resp = requests.get(search_url, headers=headers, params={"q": "task"}, auth=auth, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Search request failed with status {resp.status_code}"
        search_results = resp.json()
        assert isinstance(search_results, list), "Search results should be a list"
    except requests.RequestException as e:
        assert False, f"Search request failed: {e}"

    # 3. Security tests - check for SQL injection prevention in search
    sql_injections = [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "' OR 1=1--",
        '" OR "" = "',
    ]
    for sqli in sql_injections:
        check_injection_prevention(sqli)

    # 4. Security tests - check for XSS prevention in search
    xss_payloads = [
        "<script>alert('xss')</script>",
        '""><img src=x onerror=alert(1)>',
        "<svg/onload=alert('xss')>",
    ]
    for xss in xss_payloads:
        check_injection_prevention(xss)

    # 5. Keyboard shortcut simulation: Since API does not handle keyboard, simulate commands/actions exposed by palette
    # For example, create a task command via API to test if palette-backed action works properly

    # Create Task (simulate quick action)
    tasks_url = f"{BASE_URL}/api/tasks"
    task_payload = {
        "title": "Test Command Palette Quick Task",
        "priority": "normal",
        "due_date": None,
        "assigned_agent": None,
        "tags": ["palette_test"]
    }
    task_id = None
    try:
        create_resp = requests.post(tasks_url, json=task_payload, headers={"Content-Type": "application/json"}, auth=auth, timeout=TIMEOUT)
        assert create_resp.status_code == 201, f"Task creation failed with status {create_resp.status_code}"
        task_data = create_resp.json()
        task_id = task_data.get("id")
        assert task_id is not None, "Created task missing 'id'"
    except requests.RequestException as e:
        assert False, f"Task creation via command palette action failed: {e}"

    # Cleanup created task after test
    if task_id:
        try:
            del_resp = requests.delete(f"{tasks_url}/{task_id}", auth=auth, timeout=TIMEOUT)
            # Allow 200 or 204 for successful deletion
            assert del_resp.status_code in [200, 204], f"Failed to delete task {task_id}, status {del_resp.status_code}"
        except requests.RequestException as e:
            # Log but do not fail test on cleanup failure
            print(f"Cleanup failed for task {task_id}: {e}")


test_global_command_palette_navigation_and_security()
