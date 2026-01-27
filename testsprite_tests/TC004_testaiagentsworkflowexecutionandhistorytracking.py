import requests
import time

BASE_URL = "http://localhost:3000"
AUTH = ("hexac64930@gmail.com", "Test.123")
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
}

TIMEOUT = 30

def testaiagentsworkflowexecutionandhistorytracking():
    # Step 1: Authenticate (Basic Auth for all requests)
    session = requests.Session()
    session.auth = AUTH
    session.headers.update(HEADERS)

    def create_task():
        task_data = {
            "title": "Test AI Agent Task Execution",
            "description": "Task created for testing AI agent workflow execution.",
            "priority": "medium",
            "due_date": None,
            "assignee": None
        }
        resp = session.post(f"{BASE_URL}/tasks", json=task_data, timeout=TIMEOUT)
        assert resp.status_code == 201, f"Failed to create task: {resp.text}"
        return resp.json().get("id")

    def delete_task(task_id):
        resp = session.delete(f"{BASE_URL}/tasks/{task_id}", timeout=TIMEOUT)
        assert resp.status_code in (200, 204, 404), f"Failed to delete task {task_id}: {resp.text}"

    def start_workflow(agent_name, task_id):
        payload = {
            "agent": agent_name,
            "task_id": task_id,
            "parameters": {}
        }
        resp = session.post(f"{BASE_URL}/agents/workflows/start", json=payload, timeout=TIMEOUT)
        assert resp.status_code == 202, f"Failed to start workflow for {agent_name}: {resp.text}"
        return resp.json().get("workflow_id")

    def get_workflow_status(workflow_id):
        resp = session.get(f"{BASE_URL}/agents/workflows/{workflow_id}/status", timeout=TIMEOUT)
        assert resp.status_code == 200, f"Failed to get workflow status {workflow_id}: {resp.text}"
        return resp.json()

    def get_workflow_history(workflow_id):
        resp = session.get(f"{BASE_URL}/agents/workflows/{workflow_id}/history", timeout=TIMEOUT)
        assert resp.status_code == 200, f"Failed to get workflow history {workflow_id}: {resp.text}"
        return resp.json()

    def get_workflow_output(workflow_id):
        resp = session.get(f"{BASE_URL}/agents/workflows/{workflow_id}/output", timeout=TIMEOUT)
        assert resp.status_code == 200, f"Failed to get workflow output {workflow_id}: {resp.text}"
        return resp.json()

    def retry_workflow(workflow_id):
        resp = session.post(f"{BASE_URL}/agents/workflows/{workflow_id}/retry", timeout=TIMEOUT)
        assert resp.status_code == 202, f"Failed to retry workflow {workflow_id}: {resp.text}"

    def cancel_workflow(workflow_id):
        resp = session.post(f"{BASE_URL}/agents/workflows/{workflow_id}/cancel", timeout=TIMEOUT)
        # Cancellation may produce 200 or 202 or 409 (if already finished). Accept 200 and 202.
        assert resp.status_code in (200, 202, 409), f"Failed to cancel workflow {workflow_id}: {resp.text}"

    def test_sql_injection(endpoint, payload):
        inj_payload = {k: "'; DROP TABLE users; --" for k in payload}
        try:
            resp = session.post(f"{BASE_URL}{endpoint}", json=inj_payload, timeout=TIMEOUT)
            # Server should sanitize: not error 500 or drop anything
            assert resp.status_code < 500, f"Possible SQL injection vulnerability at {endpoint}"
        except Exception as e:
            assert False, f"Exception during sql injection test: {str(e)}"

    def test_xss(endpoint, payload):
        xss_payload = {k: "<script>alert(1)</script>" for k in payload}
        try:
            resp = session.post(f"{BASE_URL}{endpoint}", json=xss_payload, timeout=TIMEOUT)
            # Server should sanitize or encode inputs, avoid reflecting script directly
            assert resp.status_code < 500, f"Possible XSS vulnerability at {endpoint}"
            if resp.headers.get("Content-Type", "").startswith("application/json"):
                body = resp.json()
                for v in body.values():
                    assert "<script>" not in str(v), f"XSS vulnerability reflected in response at {endpoint}"
        except Exception as e:
            assert False, f"Exception during XSS test: {str(e)}"

    task_id = None
    workflow_ids = []

    try:
        # Create a task to assign to workflows
        task_id = create_task()

        agents = ["Supervisor", "Researcher", "Writer", "Coder", "Project Manager"]

        # Test normal flow for each agent: start, poll status until complete or timeout, check history and output
        for agent in agents:
            workflow_id = start_workflow(agent, task_id)
            workflow_ids.append(workflow_id)

            # Poll status with timeout max 60s, interval 3s
            for _ in range(20):
                status_data = get_workflow_status(workflow_id)
                status = status_data.get("status", "").lower()
                # Check progress key existence
                assert "progress" in status_data, f"Missing progress info for workflow {workflow_id}"
                if status in ("completed", "failed", "cancelled", "canceled"):
                    break
                time.sleep(3)
            else:
                assert False, f"Workflow {workflow_id} did not finish in expected time for agent {agent}"

            # Check history tracking - must be list with entries
            history = get_workflow_history(workflow_id)
            assert isinstance(history, list), f"History not a list for workflow {workflow_id}"
            assert len(history) > 0, f"Empty history for workflow {workflow_id}"

            # Check output viewing
            output = get_workflow_output(workflow_id)
            assert output is not None, f"No output from workflow {workflow_id}"

            # If failed, test retry
            if status == "failed":
                retry_workflow(workflow_id)
                # After retry, recheck status once immediately
                time.sleep(2)
                retry_status = get_workflow_status(workflow_id).get("status", "").lower()
                assert retry_status in ("running", "queued", "completed", "failed"), f"Unexpected retry status for {workflow_id}"

            # Test cancel operation if running or queued
            if status in ("running", "queued"):
                cancel_workflow(workflow_id)
                time.sleep(2)
                post_cancel_status = get_workflow_status(workflow_id).get("status", "").lower()
                assert post_cancel_status in ("cancelled", "canceled", "failed", "completed"), f"Cancel did not change state properly for {workflow_id}"

        # Security Tests: SQL Injection and XSS prevention on workflows start endpoint
        malicious_payload = {
            "agent": "Supervisor",
            "task_id": task_id,
            "parameters": {}
        }
        test_sql_injection("/agents/workflows/start", malicious_payload)
        test_xss("/agents/workflows/start", malicious_payload)

    finally:
        if task_id:
            delete_task(task_id)

testaiagentsworkflowexecutionandhistorytracking()