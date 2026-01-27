import requests
import base64
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:3000"

USERNAME = "hexac64930@gmail.com"
PASSWORD = "Test.123"
TIMEOUT = 30

def get_auth_header(username, password):
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}

def testkanbantaskmanagementwithdraganddroppriorityandassignment():
    headers = get_auth_header(USERNAME, PASSWORD)
    headers.update({"Content-Type": "application/json"})

    # Step 2: Create AI agents (we assume agents exist, but validate listing)
    try:
        agents_response = requests.get(f"{BASE_URL}/api/agents", headers=headers, timeout=TIMEOUT)
        assert agents_response.status_code == 200
        agents_json = agents_response.json()
        # If response has 'agents' key, use that, else use as list
        if isinstance(agents_json, dict) and "agents" in agents_json:
            agents = agents_json["agents"]
        else:
            agents = agents_json
        assert isinstance(agents, list), "Agents response is not a list"
    except requests.RequestException as e:
        assert False, f"Agents listing failed: {e}"

    # Get one AI agent ID and one user ID for assignment if exists, fallback to None
    ai_agent_id = None
    user_id = None
    for agent in agents:
        role = agent.get("role", "").lower()
        if role in ["researcher", "writer", "coder", "project manager", "supervisor"]:
            ai_agent_id = agent.get("id")
            break

    # Get user ID - test with basic auth user assumed to have an ID at /api/users/me
    try:
        user_resp = requests.get(f"{BASE_URL}/api/users/me", headers=headers, timeout=TIMEOUT)
        if user_resp.status_code == 200:
            user_json = user_resp.json()
            user_id = user_json.get("id")
    except:
        pass

    # Step 3: Create a new Kanban task
    # Use priority levels: "low", "medium", "high"
    due_date = (datetime.now() + timedelta(days=7)).isoformat()
    new_task_payload = {
        "title": "Test Kanban Task Creation",
        "description": "Task created for testing drag-and-drop, priority and assignment.",
        "priority": "high",
        "assignToAgentId": ai_agent_id,
        "assignToUserId": user_id,
        "dueDate": due_date,
        "status": "todo"  # default column
    }

    created_task_id = None
    try:
        create_resp = requests.post(f"{BASE_URL}/api/tasks", headers=headers, json=new_task_payload, timeout=TIMEOUT)
        assert create_resp.status_code == 201, f"Task creation failed: {create_resp.text}"
        created_task = create_resp.json()
        created_task_id = created_task.get("id")
        assert created_task["title"] == new_task_payload["title"]
        assert created_task["priority"] == new_task_payload["priority"]
        assert created_task["status"] == "todo"
        # Validate assignment
        if ai_agent_id:
            assert created_task.get("assignToAgentId") == ai_agent_id
        if user_id:
            assert created_task.get("assignToUserId") == user_id
        assert created_task.get("dueDate") == due_date
    except requests.RequestException as e:
        assert False, f"Task creation request failed: {e}"

    try:
        # Step 4: Drag-and-drop simulation - move task from 'todo' to 'inprogress' column (update status)
        if created_task_id:
            update_payload = {"status": "inprogress"}
            update_resp = requests.put(f"{BASE_URL}/api/tasks/{created_task_id}", headers=headers, json=update_payload, timeout=TIMEOUT)
            assert update_resp.status_code == 200, f"Task update failed: {update_resp.text}"
            updated_task = update_resp.json()
            assert updated_task["status"] == "inprogress"

            # Step 5: Change priority and reassignment
            reassignment_payload = {
                "priority": "medium",
                "assignToAgentId": None,  # Unassign agent
                "assignToUserId": user_id  # Keep user assigned
            }
            reassign_resp = requests.put(f"{BASE_URL}/api/tasks/{created_task_id}", headers=headers, json=reassignment_payload, timeout=TIMEOUT)
            assert reassign_resp.status_code == 200, f"Task reassignment failed: {reassign_resp.text}"
            reassigned_task = reassign_resp.json()
            assert reassigned_task["priority"] == "medium"
            assert reassigned_task.get("assignToAgentId") is None
            assert reassigned_task.get("assignToUserId") == user_id

        # Step 6: Negative test - SQL Injection attempt in task title
        sql_injection_payload = {
            "title": "Task'); DROP TABLE tasks;--",
            "description": "Attempt SQL Injection",
            "priority": "low",
            "status": "todo"
        }
        sql_injection_resp = requests.post(f"{BASE_URL}/api/tasks", headers=headers, json=sql_injection_payload, timeout=TIMEOUT)
        # Expecting the backend to sanitize and not execute injection; allow 400 or 201 but content sanitized
        assert sql_injection_resp.status_code in [201, 400]
        if sql_injection_resp.status_code == 201:
            injected_task = sql_injection_resp.json()
            # The title should be sanitized (e.g. special characters escaped or removed)
            assert "DROP TABLE" not in injected_task.get("title", "").upper()

        # Step 7: Negative test - XSS attempt in task description
        xss_payload = {
            "title": "XSS Test Task",
            "description": "<script>alert('xss')</script>",
            "priority": "low",
            "status": "todo"
        }
        xss_resp = requests.post(f"{BASE_URL}/api/tasks", headers=headers, json=xss_payload, timeout=TIMEOUT)
        assert xss_resp.status_code in [201, 400]
        if xss_resp.status_code == 201:
            xss_task = xss_resp.json()
            # The description should not contain raw scripts, check for sanitized output
            assert "<script" not in xss_task.get("description", "").lower()

    finally:
        # Cleanup: delete the created task(s)
        if created_task_id:
            try:
                requests.delete(f"{BASE_URL}/api/tasks/{created_task_id}", headers=headers, timeout=TIMEOUT)
            except:
                pass

    # Extra cleanup for injected tasks (SQLi and XSS) if created
    try:
        if sql_injection_resp.status_code == 201:
            sqli_id = sql_injection_resp.json().get("id")
            if sqli_id:
                requests.delete(f"{BASE_URL}/api/tasks/{sqli_id}", headers=headers, timeout=TIMEOUT)
    except:
        pass
    try:
        if xss_resp.status_code == 201:
            xss_id = xss_resp.json().get("id")
            if xss_id:
                requests.delete(f"{BASE_URL}/api/tasks/{xss_id}", headers=headers, timeout=TIMEOUT)
    except:
        pass

testkanbantaskmanagementwithdraganddroppriorityandassignment()
