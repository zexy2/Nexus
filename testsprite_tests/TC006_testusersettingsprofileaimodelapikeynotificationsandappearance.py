import requests
from requests.auth import HTTPBasicAuth

BASE_URL = "http://localhost:3000"
AUTH = HTTPBasicAuth("hexac64930@gmail.com", "Test.123")
HEADERS = {"Content-Type": "application/json"}
TIMEOUT = 30

def test_usersettings_profile_aimodel_apikey_notifications_appearance():
    # Helper functions for resource creation and cleanup
    def create_api_key():
        payload = {"name": "Test API Key"}
        resp = requests.post(f"{BASE_URL}/api/user/apikeys", auth=AUTH, json=payload, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()["id"]

    def delete_api_key(key_id):
        requests.delete(f"{BASE_URL}/api/user/apikeys/{key_id}", auth=AUTH, headers=HEADERS, timeout=TIMEOUT)

    # 1. Profile Update - Normal and XSS test
    profile_url = f"{BASE_URL}/api/user/profile"
    normal_profile_data = {
        "displayName": "Test User",
        "bio": "Experienced AI user"
    }
    xss_profile_data = {
        "displayName": "<script>alert('XSS')</script>",
        "bio": "<img src=x onerror=alert('XSS')>"
    }

    # Update profile normal data
    r = requests.put(profile_url, auth=AUTH, json=normal_profile_data, headers=HEADERS, timeout=TIMEOUT)
    assert r.status_code == 200
    resp_data = r.json()
    assert resp_data.get("displayName") == "Test User"
    assert resp_data.get("bio") == "Experienced AI user"
    # Ensure no raw script tags in response (XSS prevention)
    assert "<script>" not in r.text and "<img" not in r.text

    # XSS attempt in profile update (should be sanitized or rejected)
    r = requests.put(profile_url, auth=AUTH, json=xss_profile_data, headers=HEADERS, timeout=TIMEOUT)
    assert r.status_code in (200, 400)
    if r.status_code == 200:
        # The response should not contain raw XSS scripts, verify sanitized
        resp_data = r.json()
        assert "<script>" not in resp_data.get("displayName", "")
        assert "<img" not in resp_data.get("bio", "")
    elif r.status_code == 400:
        # Bad request due to invalid input (also acceptable)
        assert "error" in r.json()

    # 2. AI Model Configuration
    aimodel_url = f"{BASE_URL}/api/user/ai-model"
    aimodel_data = {
        "model": "gpt-4",
        "temperature": 0.7,
        "maxTokens": 1500
    }
    r = requests.put(aimodel_url, auth=AUTH, json=aimodel_data, headers=HEADERS, timeout=TIMEOUT)
    assert r.status_code == 200
    resp_data = r.json()
    assert resp_data.get("model") == "gpt-4"
    assert resp_data.get("temperature") == 0.7
    assert resp_data.get("maxTokens") == 1500

    # 3. API Key Management - create, validate encryption, error and deletion
    key_id = None
    try:
        key_id = create_api_key()
        # Fetch API key info, expecting encrypted key presence or non-plaintext
        r = requests.get(f"{BASE_URL}/api/user/apikeys/{key_id}", auth=AUTH, headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code == 200
        apikey_info = r.json()
        assert "key" not in apikey_info or len(apikey_info.get("key", "")) >= 20  # Encrypted or obscured key

        # Attempt SQL injection in API key update (should fail)
        injection_payload = {"name": "InjectedName', DROP TABLE users; --"}
        r = requests.put(f"{BASE_URL}/api/user/apikeys/{key_id}", auth=AUTH, json=injection_payload, headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            assert "DROP TABLE" not in r.text
        else:
            assert "error" in r.json()

    finally:
        if key_id:
            delete_api_key(key_id)

    # 4. Notification Preferences
    notifications_url = f"{BASE_URL}/api/user/notifications"
    notifications_data = {
        "emailNotifications": True,
        "pushNotifications": False,
        "weeklySummary": True
    }
    r = requests.put(notifications_url, auth=AUTH, json=notifications_data, headers=HEADERS, timeout=TIMEOUT)
    assert r.status_code == 200
    resp_data = r.json()
    assert resp_data.get("emailNotifications") is True
    assert resp_data.get("pushNotifications") is False
    assert resp_data.get("weeklySummary") is True

    # XSS injection attempt in notifications (fields expecting strings but we put script)
    xss_notification_data = {
        "emailNotifications": True,
        "customNotificationSound": "<script>alert('XSS')</script>"
    }
    r = requests.put(notifications_url, auth=AUTH, json=xss_notification_data, headers=HEADERS, timeout=TIMEOUT)
    assert r.status_code in (200, 400)
    if r.status_code == 200:
        assert "<script>" not in r.text
    else:
        assert "error" in r.json()

    # 5. Theme Selection
    appearance_url = f"{BASE_URL}/api/user/appearance"
    appearance_data = {
        "theme": "dark",
        "fontSize": "medium"
    }
    r = requests.put(appearance_url, auth=AUTH, json=appearance_data, headers=HEADERS, timeout=TIMEOUT)
    assert r.status_code == 200
    resp_data = r.json()
    assert resp_data.get("theme") == "dark"
    assert resp_data.get("fontSize") == "medium"

    # Invalid theme selection (error scenario)
    invalid_appearance_data = {"theme": "unknown_theme"}
    r = requests.put(appearance_url, auth=AUTH, json=invalid_appearance_data, headers=HEADERS, timeout=TIMEOUT)
    assert r.status_code == 400
    assert "error" in r.json()

    # 6. Sync Options
    sync_url = f"{BASE_URL}/api/user/sync"
    sync_data = {
        "autoSync": True,
        "syncOverWifiOnly": True
    }
    r = requests.put(sync_url, auth=AUTH, json=sync_data, headers=HEADERS, timeout=TIMEOUT)
    assert r.status_code == 200
    resp_data = r.json()
    assert resp_data.get("autoSync") is True
    assert resp_data.get("syncOverWifiOnly") is True

    # SQL Injection attempt in sync options (fields expecting bool but injection string)
    injection_sync_data = {
        "autoSync": "true; DROP TABLE tasks;",
        "syncOverWifiOnly": False
    }
    r = requests.put(sync_url, auth=AUTH, json=injection_sync_data, headers=HEADERS, timeout=TIMEOUT)
    assert r.status_code in (400, 422)
    if r.status_code not in (400, 422):
        # If accepted, ensure no harmful content processed
        assert "DROP TABLE" not in r.text

# Run the test
test_usersettings_profile_aimodel_apikey_notifications_appearance()
