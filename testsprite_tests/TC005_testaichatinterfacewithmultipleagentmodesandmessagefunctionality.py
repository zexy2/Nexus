import requests
from requests.auth import HTTPBasicAuth
import time

BASE_URL = "http://localhost:3000"
AUTH_USERNAME = "hexac64930@gmail.com"
AUTH_PASSWORD = "Test.123"
TIMEOUT = 30

def testaichatinterfacewithmultipleagentmodesandmessagefunctionality():
    session = requests.Session()
    session.auth = HTTPBasicAuth(AUTH_USERNAME, AUTH_PASSWORD)
    headers = {"Content-Type": "application/json"}

    agent_modes = ["Supervisor", "Researcher", "Writer", "Coder", "Project Manager"]
    chat_messages = [
        {"role": "user", "content": "Hello AI agent."},
        {"role": "user", "content": "Please provide a summary of Nexus project."}
    ]
    sql_injection_payload = "' OR '1'='1"
    xss_payload = "<script>alert('xss')</script>"

    # Helper to send chat message
    def send_message(mode, message_content):
        payload = {
            "agentMode": mode,
            "message": {"role": "user", "content": message_content},
            "history": []
        }
        response = session.post(f"{BASE_URL}/api/chat/send", json=payload, headers=headers, timeout=TIMEOUT)
        return response

    # Helper to get message history
    def get_history(mode):
        response = session.get(f"{BASE_URL}/api/chat/history", params={"agentMode": mode}, headers=headers, timeout=TIMEOUT)
        return response

    # Helper to retry a message (simulate resending last user message)
    def retry_message(mode, message_id):
        payload = {"agentMode": mode, "messageId": message_id}
        response = session.post(f"{BASE_URL}/api/chat/retry", json=payload, headers=headers, timeout=TIMEOUT)
        return response

    # Helper to copy AI-generated response
    def copy_response(mode, message_id):
        response = session.get(f"{BASE_URL}/api/chat/copy", params={"agentMode": mode, "messageId": message_id}, headers=headers, timeout=TIMEOUT)
        return response

    # Authenticate user before chat interaction - test auth success
    auth_test = session.get(f"{BASE_URL}/api/auth/check", headers=headers, timeout=TIMEOUT)
    assert auth_test.status_code == 200, f"Authentication check failed with status {auth_test.status_code}"

    # Run tests for each agent mode
    for mode in agent_modes:
        # Send messages and validate AI response with history maintained
        message_ids = []
        history = []
        for msg in chat_messages:
            send_payload = {
                "agentMode": mode,
                "message": msg,
                "history": history
            }
            resp = session.post(f"{BASE_URL}/api/chat/send", json=send_payload, headers=headers, timeout=TIMEOUT)
            assert resp.status_code == 200, f"Failed sending message to mode {mode}, status {resp.status_code}"
            resp_json = resp.json()
            assert "aiResponse" in resp_json, f"No AI response in chat send for mode {mode}"
            assert "messageId" in resp_json, f"No messageId in chat send response for mode {mode}"
            message_ids.append(resp_json["messageId"])
            # Add both user message and AI response to history
            history.append(msg)
            history.append({"role": "assistant", "content": resp_json["aiResponse"]})

        # Check message history retrieval
        hist_resp = get_history(mode)
        assert hist_resp.status_code == 200, f"Failed to get history for mode {mode}"
        hist_json = hist_resp.json()
        assert isinstance(hist_json, list), f"Chat history is not a list for mode {mode}"
        # Basic check: last messages in history should match the last exchanges
        if len(hist_json) >= 2:
            assert hist_json[-2]["role"] == "user" and hist_json[-2]["content"] == chat_messages[-1]["content"], "Last user message mismatch in history"
            assert hist_json[-1]["role"] == "assistant", "Last message in history not from assistant"

        # Test copy functionality for last AI-generated response
        last_msg_id = message_ids[-1]
        copy_resp = copy_response(mode, last_msg_id)
        assert copy_resp.status_code == 200, f"Copy response failed for mode {mode}"
        copy_json = copy_resp.json()
        assert "copiedText" in copy_json and isinstance(copy_json["copiedText"], str), f"Invalid copy response content for mode {mode}"

        # Test retry functionality for last user message
        retry_resp = retry_message(mode, last_msg_id)
        assert retry_resp.status_code == 200, f"Retry message failed for mode {mode}"
        retry_json = retry_resp.json()
        assert "aiResponse" in retry_json, f"No AI response in retry for mode {mode}"

    # Security tests for SQL injection and XSS payloads

    # SQL Injection test in chat send
    sql_payload = {
        "agentMode": agent_modes[0],
        "message": {"role": "user", "content": sql_injection_payload},
        "history": []
    }
    sql_resp = session.post(f"{BASE_URL}/api/chat/send", json=sql_payload, headers=headers, timeout=TIMEOUT)
    # Should succeed but AI should sanitize input and not cause server error
    assert sql_resp.status_code == 200, "SQL injection payload caused server error"
    sql_resp_json = sql_resp.json()
    assert "aiResponse" in sql_resp_json, "No AI response on SQL injection test"

    # XSS test in chat send
    xss_payload_data = {
        "agentMode": agent_modes[0],
        "message": {"role": "user", "content": xss_payload},
        "history": []
    }
    xss_resp = session.post(f"{BASE_URL}/api/chat/send", json=xss_payload_data, headers=headers, timeout=TIMEOUT)
    assert xss_resp.status_code == 200, "XSS payload caused server error"
    xss_resp_json = xss_resp.json()
    # Ensure response does not contain raw script tags to prevent XSS vulnerabilities
    response_content = xss_resp_json.get("aiResponse", "")
    assert "<script>" not in response_content.lower(), "XSS vulnerability detected in AI response"

testaichatinterfacewithmultipleagentmodesandmessagefunctionality()