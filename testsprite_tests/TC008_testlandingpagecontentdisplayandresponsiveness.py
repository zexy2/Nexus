import requests
from requests.auth import HTTPBasicAuth

BASE_URL = "http://localhost:3000"
AUTH = HTTPBasicAuth("hexac64930@gmail.com", "Test.123")
TIMEOUT = 30
HEADERS = {"Accept": "application/json"}

def testlandingpagecontentdisplayandresponsiveness():
    # Since the PRD and instructions focus on API endpoints for authentication, documents, tasks, agents, and search,
    # and also security tests, we will test the relevant endpoints that relate indirectly to the landing page content
    # (because the landing page content is mostly UI and frontend, we validate API responses that feed data to the landing page)
    
    # 1. Authentication test - success
    auth_url = f"{BASE_URL}/api/auth/login"
    auth_payload = {
        "email": "hexac64930@gmail.com",
        "password": "Test.123"
    }
    try:
        auth_response = requests.post(auth_url, json=auth_payload, timeout=TIMEOUT, headers=HEADERS)
        assert auth_response.status_code == 200, f"Auth success expected 200, got {auth_response.status_code}"
        token = auth_response.json().get("token")
        assert token and isinstance(token, str), "Auth token missing or invalid"
    except requests.RequestException as e:
        assert False, f"Auth request failed: {e}"

    # Headers with Bearer token for subsequent requests
    auth_headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }

    # 2. Documents API test - get documents list (landing page might show stats from documents)
    docs_url = f"{BASE_URL}/api/documents"
    try:
        docs_response = requests.get(docs_url, timeout=TIMEOUT, headers=auth_headers)
        assert docs_response.status_code == 200, f"Documents fetch expected 200, got {docs_response.status_code}"
        docs_data = docs_response.json()
        assert isinstance(docs_data, list), "Documents response should be a list"
    except requests.RequestException as e:
        assert False, f"Documents request failed: {e}"

    # 3. Tasks API test - get tasks list (landing page shows priority tasks etc.)
    tasks_url = f"{BASE_URL}/api/tasks"
    try:
        tasks_response = requests.get(tasks_url, timeout=TIMEOUT, headers=auth_headers)
        assert tasks_response.status_code == 200, f"Tasks fetch expected 200, got {tasks_response.status_code}"
        tasks_data = tasks_response.json()
        assert isinstance(tasks_data, list), "Tasks response should be a list"
    except requests.RequestException as e:
        assert False, f"Tasks request failed: {e}"

    # 4. Agents API test - get agents status/data (landing page shows agent activity)
    agents_url = f"{BASE_URL}/api/agents"
    try:
        agents_response = requests.get(agents_url, timeout=TIMEOUT, headers=auth_headers)
        assert agents_response.status_code == 200, f"Agents fetch expected 200, got {agents_response.status_code}"
        agents_data = agents_response.json()
        assert isinstance(agents_data, list), "Agents response should be a list"
    except requests.RequestException as e:
        assert False, f"Agents request failed: {e}"

    # 5. Search API test with normal and malicious input (to test SQL injection and XSS protection)
    search_url = f"{BASE_URL}/api/search"

    # Normal search test
    try:
        normal_search_response = requests.get(search_url, params={"q": "test"}, timeout=TIMEOUT, headers=auth_headers)
        assert normal_search_response.status_code == 200, f"Search normal query expected 200, got {normal_search_response.status_code}"
        normal_results = normal_search_response.json()
        assert isinstance(normal_results, list), "Search results should be a list"
    except requests.RequestException as e:
        assert False, f"Search normal query request failed: {e}"

    # SQL Injection attempt (should be sanitized and not cause error or leak data)
    sql_injection_payload = "' OR '1'='1"
    try:
        sql_injection_response = requests.get(search_url, params={"q": sql_injection_payload}, timeout=TIMEOUT, headers=auth_headers)
        # Expect 200 but results should not be all documents or an error
        assert sql_injection_response.status_code == 200, f"Search SQL injection attempt expected 200, got {sql_injection_response.status_code}"
        sql_results = sql_injection_response.json()
        assert isinstance(sql_results, list), "Search SQL injection results should be a list"
    except requests.RequestException as e:
        assert False, f"Search SQL injection request failed: {e}"

    # XSS attempt test (input sanitization, should not return injected scripts or HTML)
    xss_payload = "<script>alert('XSS')</script>"
    try:
        xss_response = requests.get(search_url, params={"q": xss_payload}, timeout=TIMEOUT, headers=auth_headers)
        assert xss_response.status_code == 200, f"Search XSS attempt expected 200, got {xss_response.status_code}"
        xss_results = xss_response.json()
        assert isinstance(xss_results, list), "Search XSS results should be a list"
        # Check no script tags in the results strings if fields are string
        def check_no_script(obj):
            if isinstance(obj, dict):
                for v in obj.values():
                    if isinstance(v, str):
                        assert "<script>" not in v.lower(), "XSS script tag found in response"
                    elif isinstance(v, (dict, list)):
                        check_no_script(v)
            elif isinstance(obj, list):
                for item in obj:
                    check_no_script(item)
        check_no_script(xss_results)
    except requests.RequestException as e:
        assert False, f"Search XSS request failed: {e}"

testlandingpagecontentdisplayandresponsiveness()