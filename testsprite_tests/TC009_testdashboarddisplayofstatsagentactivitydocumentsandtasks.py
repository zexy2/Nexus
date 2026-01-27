import requests
from requests.auth import HTTPBasicAuth

BASE_URL = "http://localhost:3000"
AUTH = HTTPBasicAuth("hexac64930@gmail.com", "Test.123")
HEADERS = {
    "Accept": "application/json",
    "Content-Type": "application/json"
}
TIMEOUT = 30

def testdashboarddisplayofstatsagentactivitydocumentsandtasks():
    try:
        # 1. Authenticate and get a session/token if applicable
        # Assuming the API uses Basic Auth directly with each request
        
        # 2. Test User Stats Display (GET /dashboard/user-stats)
        r_stats = requests.get(f"{BASE_URL}/dashboard/user-stats", auth=AUTH, headers=HEADERS, timeout=TIMEOUT)
        assert r_stats.status_code == 200, f"user-stats endpoint failed with {r_stats.status_code}"
        stats_json = r_stats.json()
        assert "totalDocuments" in stats_json and isinstance(stats_json["totalDocuments"], int)
        assert "totalTasks" in stats_json and isinstance(stats_json["totalTasks"], int)
        assert "activeAgents" in stats_json and isinstance(stats_json["activeAgents"], int)
        
        # 3. Test AI Agent Activity (GET /dashboard/agents/activity)
        r_agents = requests.get(f"{BASE_URL}/dashboard/agents/activity", auth=AUTH, headers=HEADERS, timeout=TIMEOUT)
        assert r_agents.status_code == 200, f"agents activity endpoint failed with {r_agents.status_code}"
        agents_json = r_agents.json()
        assert isinstance(agents_json, list)
        for agent in agents_json:
            assert "agentName" in agent and isinstance(agent["agentName"], str)
            assert "status" in agent and agent["status"] in ["idle", "running", "error"]
            assert "tasksCompleted" in agent and isinstance(agent["tasksCompleted"], int)
        
        # 4. Test Recent Documents (GET /dashboard/documents/recent)
        r_docs = requests.get(f"{BASE_URL}/dashboard/documents/recent", auth=AUTH, headers=HEADERS, timeout=TIMEOUT)
        assert r_docs.status_code == 200, f"recent documents endpoint failed with {r_docs.status_code}"
        docs_json = r_docs.json()
        assert isinstance(docs_json, list)
        for doc in docs_json:
            assert "id" in doc and isinstance(doc["id"], str)
            assert "title" in doc and isinstance(doc["title"], str)
            assert "lastModified" in doc
        
        # 5. Test Priority Tasks (GET /dashboard/tasks/priority)
        r_tasks = requests.get(f"{BASE_URL}/dashboard/tasks/priority", auth=AUTH, headers=HEADERS, timeout=TIMEOUT)
        assert r_tasks.status_code == 200, f"priority tasks endpoint failed with {r_tasks.status_code}"
        tasks_json = r_tasks.json()
        assert isinstance(tasks_json, list)
        for task in tasks_json:
            assert "id" in task and isinstance(task["id"], str)
            assert "title" in task and isinstance(task["title"], str)
            assert "priority" in task and task["priority"] in ["low", "medium", "high", "urgent"]
            assert "dueDate" in task
        
        # 6. Test Quick Action Buttons Data (GET /dashboard/quick-actions)
        r_actions = requests.get(f"{BASE_URL}/dashboard/quick-actions", auth=AUTH, headers=HEADERS, timeout=TIMEOUT)
        assert r_actions.status_code == 200, f"quick actions endpoint failed with {r_actions.status_code}"
        actions_json = r_actions.json()
        assert isinstance(actions_json, list)
        for action in actions_json:
            assert "id" in action and isinstance(action["id"], str)
            assert "label" in action and isinstance(action["label"], str)
            assert "actionType" in action and isinstance(action["actionType"], str)

        # --- Security Tests: SQL Injection and XSS prevention in search and input fields ---

        # SQL injection test for documents search (GET /documents/search?q=...)
        sql_payload = "'; DROP TABLE users; --"
        r_sql = requests.get(f"{BASE_URL}/documents/search", params={"q": sql_payload}, auth=AUTH, headers=HEADERS, timeout=TIMEOUT)
        assert r_sql.status_code in (200, 400), f"SQL injection query should not cause server error, got {r_sql.status_code}"
        # The response should not contain a server error or reveal SQL error details
        assert "error" not in r_sql.text.lower() and "syntax" not in r_sql.text.lower()
        
        # XSS test for tasks creation (POST /tasks)
        xss_payload = {
            "title": "<script>alert('xss')</script>",
            "description": "<img src=x onerror=alert('xss')>",
            "priority": "medium",
            "dueDate": "2026-12-31T23:59:59Z"
        }
        r_task_create = requests.post(f"{BASE_URL}/tasks", json=xss_payload, auth=AUTH, headers=HEADERS, timeout=TIMEOUT)
        if r_task_create.status_code == 201:
            task_created = r_task_create.json()
            task_id = task_created.get("id")
            # Check that the payload is sanitized - the title/description should not include raw script tags
            assert "<script>" not in task_created.get("title", "") and "<img" not in task_created.get("description", "")
        else:
            task_id = None
            assert r_task_create.status_code in (400, 422), "Malformed input should be rejected with client error"

        # Clean up created task if any
        if task_id:
            r_delete = requests.delete(f"{BASE_URL}/tasks/{task_id}", auth=AUTH, headers=HEADERS, timeout=TIMEOUT)
            assert r_delete.status_code == 204, f"Failed to delete test task with ID {task_id}"

        # Test error scenario for unauthorized access (no auth)
        r_noauth = requests.get(f"{BASE_URL}/dashboard/user-stats", headers=HEADERS, timeout=TIMEOUT)
        assert r_noauth.status_code == 401 or r_noauth.status_code == 403, "Endpoint should forbid unauthorized access"

    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

testdashboarddisplayofstatsagentactivitydocumentsandtasks()