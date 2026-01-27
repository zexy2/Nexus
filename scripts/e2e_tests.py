#!/usr/bin/env python3
"""
Nexus E2E Test Suite
Comprehensive API Testing
"""

import requests
import json
import uuid
import time
from datetime import datetime

BASE_URL = "http://localhost:3000"
SESSION = requests.Session()

# Test results
results = {"passed": 0, "failed": 0, "warnings": 0, "details": []}

def log_pass(test_id, message):
    results["passed"] += 1
    results["details"].append({"id": test_id, "status": "PASS", "message": message})
    print(f"✅ PASS: {test_id} - {message}")

def log_fail(test_id, message, expected, got):
    results["failed"] += 1
    results["details"].append({"id": test_id, "status": "FAIL", "message": f"{message} (expected {expected}, got {got})"})
    print(f"❌ FAIL: {test_id} - {message} (expected {expected}, got {got})")

def log_warn(test_id, message):
    results["warnings"] += 1
    results["details"].append({"id": test_id, "status": "WARN", "message": message})
    print(f"⚠️  WARN: {test_id} - {message}")

def log_info(message):
    print(f"ℹ️  {message}")

# ========== AUTH TESTS ==========
def test_auth():
    print("\n" + "="*50)
    print("📦 AUTH TESTS")
    print("="*50)
    
    test_email = f"e2e_{int(time.time())}@test.com"
    test_pass = "SecurePass123!"
    
    # AUTH-001: Registration
    log_info("AUTH-001: User Registration")
    try:
        resp = SESSION.post(f"{BASE_URL}/api/auth/sign-up/email", json={
            "email": test_email,
            "password": test_pass,
            "name": "E2E Test User"
        })
        if resp.status_code in [200, 201]:
            log_pass("AUTH-001", f"Registration successful ({resp.status_code})")
        else:
            log_fail("AUTH-001", "Registration", "200/201", resp.status_code)
    except Exception as e:
        log_fail("AUTH-001", "Registration", "200/201", str(e))
    
    # AUTH-002: Login
    log_info("AUTH-002: User Login")
    try:
        resp = SESSION.post(f"{BASE_URL}/api/auth/sign-in/email", json={
            "email": test_email,
            "password": test_pass
        })
        if resp.status_code == 200:
            log_pass("AUTH-002", f"Login successful ({resp.status_code})")
        else:
            log_fail("AUTH-002", "Login", "200", resp.status_code)
    except Exception as e:
        log_fail("AUTH-002", "Login", "200", str(e))
    
    # AUTH-003: Get Session
    log_info("AUTH-003: Get Session")
    try:
        resp = SESSION.get(f"{BASE_URL}/api/auth/get-session")
        if resp.status_code == 200 and "user" in resp.text:
            log_pass("AUTH-003", f"Session valid ({resp.status_code})")
        else:
            log_fail("AUTH-003", "Get Session", "200 with user", resp.status_code)
    except Exception as e:
        log_fail("AUTH-003", "Get Session", "200", str(e))
    
    # AUTH-N01: Wrong Password
    log_info("AUTH-N01: Wrong Password")
    try:
        resp = requests.post(f"{BASE_URL}/api/auth/sign-in/email", json={
            "email": test_email,
            "password": "WrongPassword"
        })
        if resp.status_code in [400, 401]:
            log_pass("AUTH-N01", f"Wrong password rejected ({resp.status_code})")
        else:
            log_fail("AUTH-N01", "Wrong password", "400/401", resp.status_code)
    except Exception as e:
        log_fail("AUTH-N01", "Wrong password", "400/401", str(e))
    
    return test_email

# ========== DOCS TESTS ==========
def test_docs():
    print("\n" + "="*50)
    print("📦 DOCS TESTS")
    print("="*50)
    
    doc_id = None
    
    # DOC-001: Unauth access
    log_info("DOC-001: Unauth docs access")
    try:
        resp = requests.get(f"{BASE_URL}/api/docs")
        if resp.status_code == 401:
            log_pass("DOC-001", f"Unauth rejected ({resp.status_code})")
        else:
            log_fail("DOC-001", "Unauth access", "401", resp.status_code)
    except Exception as e:
        log_fail("DOC-001", "Unauth access", "401", str(e))
    
    # DOC-002: Auth docs list
    log_info("DOC-002: Auth docs list")
    try:
        resp = SESSION.get(f"{BASE_URL}/api/docs")
        if resp.status_code == 200:
            log_pass("DOC-002", f"Docs list ({resp.status_code})")
        else:
            log_fail("DOC-002", "Docs list", "200", resp.status_code)
    except Exception as e:
        log_fail("DOC-002", "Docs list", "200", str(e))
    
    # DOC-003: Create Doc
    log_info("DOC-003: Create Doc")
    try:
        resp = SESSION.post(f"{BASE_URL}/api/docs", json={
            "title": f"E2E Test Doc {int(time.time())}",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Test content"}]}]
        })
        if resp.status_code in [200, 201]:
            data = resp.json()
            doc_id = data.get("id")
            log_pass("DOC-003", f"Created doc ({doc_id[:8]}...)")
        else:
            log_fail("DOC-003", "Create doc", "200/201", resp.status_code)
    except Exception as e:
        log_fail("DOC-003", "Create doc", "200/201", str(e))
    
    # DOC-004: Get Doc
    if doc_id:
        log_info("DOC-004: Get Doc by ID")
        try:
            resp = SESSION.get(f"{BASE_URL}/api/docs/{doc_id}")
            if resp.status_code == 200:
                log_pass("DOC-004", f"Get doc ({resp.status_code})")
            else:
                log_fail("DOC-004", "Get doc", "200", resp.status_code)
        except Exception as e:
            log_fail("DOC-004", "Get doc", "200", str(e))
    
    # DOC-005: Update Doc (PATCH)
    if doc_id:
        log_info("DOC-005: Update Doc (PATCH)")
        try:
            resp = SESSION.patch(f"{BASE_URL}/api/docs/{doc_id}", json={
                "title": "Updated E2E Doc"
            })
            if resp.status_code == 200:
                log_pass("DOC-005", f"PATCH doc ({resp.status_code})")
            else:
                log_fail("DOC-005", "PATCH doc", "200", resp.status_code)
        except Exception as e:
            log_fail("DOC-005", "PATCH doc", "200", str(e))
    
    # DOC-006: Update Doc (PUT)
    if doc_id:
        log_info("DOC-006: Update Doc (PUT)")
        try:
            resp = SESSION.put(f"{BASE_URL}/api/docs/{doc_id}", json={
                "title": "PUT Updated Doc"
            })
            if resp.status_code == 200:
                log_pass("DOC-006", f"PUT doc ({resp.status_code})")
            else:
                log_fail("DOC-006", "PUT doc", "200", resp.status_code)
        except Exception as e:
            log_fail("DOC-006", "PUT doc", "200", str(e))
    
    # DOC-007: Invalid UUID
    log_info("DOC-007: Invalid UUID")
    try:
        resp = requests.get(f"{BASE_URL}/api/docs/invalid-uuid")
        if resp.status_code == 400:
            log_pass("DOC-007", f"Invalid UUID rejected ({resp.status_code})")
        else:
            log_fail("DOC-007", "Invalid UUID", "400", resp.status_code)
    except Exception as e:
        log_fail("DOC-007", "Invalid UUID", "400", str(e))
    
    # DOC-008: Not Found
    log_info("DOC-008: Doc Not Found")
    try:
        resp = requests.get(f"{BASE_URL}/api/docs/00000000-0000-0000-0000-000000000000")
        if resp.status_code == 404:
            log_pass("DOC-008", f"Not found ({resp.status_code})")
        else:
            log_fail("DOC-008", "Not found", "404", resp.status_code)
    except Exception as e:
        log_fail("DOC-008", "Not found", "404", str(e))
    
    # Cleanup
    if doc_id:
        log_info("Cleanup: Delete test doc")
        try:
            resp = SESSION.delete(f"{BASE_URL}/api/docs/{doc_id}")
            if resp.status_code == 200:
                log_pass("DOC-CLN", f"Doc deleted")
        except:
            log_warn("DOC-CLN", "Cleanup failed")
    
    return doc_id

# ========== TASKS TESTS ==========
def test_tasks():
    print("\n" + "="*50)
    print("📦 TASKS TESTS")
    print("="*50)
    
    task_id = None
    
    # TASK-001: Unauth access
    log_info("TASK-001: Unauth tasks access")
    try:
        resp = requests.get(f"{BASE_URL}/api/tasks")
        if resp.status_code == 401:
            log_pass("TASK-001", f"Unauth rejected ({resp.status_code})")
        else:
            log_fail("TASK-001", "Unauth access", "401", resp.status_code)
    except Exception as e:
        log_fail("TASK-001", "Unauth access", "401", str(e))
    
    # TASK-002: Create Task
    log_info("TASK-002: Create Task")
    try:
        resp = SESSION.post(f"{BASE_URL}/api/tasks", json={
            "title": "E2E Test Task",
            "description": "Test description",
            "priority": "high"
        })
        if resp.status_code in [200, 201]:
            data = resp.json()
            task_id = data.get("id")
            log_pass("TASK-002", f"Created task ({task_id[:8]}...)")
        else:
            log_fail("TASK-002", "Create task", "200/201", resp.status_code)
    except Exception as e:
        log_fail("TASK-002", "Create task", "200/201", str(e))
    
    # TASK-003: Update status with hyphen
    if task_id:
        log_info("TASK-003: Update status (in-progress → in_progress)")
        try:
            resp = SESSION.patch(f"{BASE_URL}/api/tasks/{task_id}", json={
                "status": "in-progress"
            })
            if resp.status_code == 200 and "in_progress" in resp.text:
                log_pass("TASK-003", f"Status normalized to in_progress")
            else:
                log_fail("TASK-003", "Status normalize", "in_progress", resp.text[:50])
        except Exception as e:
            log_fail("TASK-003", "Status normalize", "200", str(e))
    
    # TASK-004: Invalid UUID
    log_info("TASK-004: Invalid Task UUID")
    try:
        resp = requests.get(f"{BASE_URL}/api/tasks/not-a-uuid")
        if resp.status_code == 400:
            log_pass("TASK-004", f"Invalid UUID rejected ({resp.status_code})")
        else:
            log_fail("TASK-004", "Invalid UUID", "400", resp.status_code)
    except Exception as e:
        log_fail("TASK-004", "Invalid UUID", "400", str(e))
    
    # Cleanup
    if task_id:
        log_info("Cleanup: Delete test task")
        try:
            resp = SESSION.delete(f"{BASE_URL}/api/tasks/{task_id}")
            if resp.status_code == 200:
                log_pass("TASK-CLN", f"Task deleted")
        except:
            log_warn("TASK-CLN", "Cleanup failed")

# ========== SECURITY TESTS ==========
def test_security():
    print("\n" + "="*50)
    print("📦 SECURITY TESTS")
    print("="*50)
    
    endpoints = [
        ("SEARCH", "POST", "/api/search", {"query": "test"}),
        ("SYNC-PULL", "GET", "/api/sync/pull?since=0", None),
        ("SYNC-PUSH", "POST", "/api/sync/push", {"id": "test", "table": "docs"}),
        ("WORKFLOW", "POST", "/api/workflows", {"workflowType": "research"}),
        ("EMBEDDINGS", "POST", "/api/embeddings", {"docId": "test"}),
        ("RESEARCH", "POST", "/api/research", {"topic": "AI"}),
        ("APPROVALS", "GET", "/api/approvals", None),
    ]
    
    for name, method, path, data in endpoints:
        log_info(f"SEC-{name}: Unauth access")
        try:
            if method == "GET":
                resp = requests.get(f"{BASE_URL}{path}")
            else:
                resp = requests.post(f"{BASE_URL}{path}", json=data)
            
            if resp.status_code == 401:
                log_pass(f"SEC-{name}", f"Unauth rejected ({resp.status_code})")
            else:
                log_fail(f"SEC-{name}", "Unauth access", "401", resp.status_code)
        except Exception as e:
            log_fail(f"SEC-{name}", "Unauth access", "401", str(e))
    
    # Special: Traces (internal endpoint)
    log_info("SEC-TRACES: Internal traces endpoint")
    try:
        resp = requests.get(f"{BASE_URL}/api/traces")
        if resp.status_code == 200:
            log_warn("SEC-TRACES", f"Traces exposed without auth ({resp.status_code})")
        else:
            log_pass("SEC-TRACES", f"Traces protected ({resp.status_code})")
    except Exception as e:
        log_fail("SEC-TRACES", "Traces check", "any", str(e))

# ========== SYNC TESTS ==========
def test_sync():
    print("\n" + "="*50)
    print("📦 SYNC TESTS")
    print("="*50)
    
    # SYNC-001: Auth pull
    log_info("SYNC-001: Auth pull")
    try:
        resp = SESSION.get(f"{BASE_URL}/api/sync/pull?since=0")
        if resp.status_code == 200:
            data = resp.json()
            log_pass("SYNC-001", f"Pull successful (got {len(data.get('docs', []))} docs)")
        else:
            log_fail("SYNC-001", "Pull", "200", resp.status_code)
    except Exception as e:
        log_fail("SYNC-001", "Pull", "200", str(e))
    
    # SYNC-002: Push mutation
    log_info("SYNC-002: Push mutation")
    try:
        doc_uuid = str(uuid.uuid4())
        ts = int(time.time() * 1000)
        resp = SESSION.post(f"{BASE_URL}/api/sync/push", json={
            "id": f"mut-{doc_uuid}",
            "table": "docs",
            "operation": "insert",
            "data": {
                "id": doc_uuid,
                "title": "Sync Test Doc",
                "content": [],
                "createdAt": ts,
                "updatedAt": ts
            },
            "timestamp": ts
        })
        if resp.status_code == 200:
            log_pass("SYNC-002", f"Push successful ({resp.status_code})")
        else:
            log_fail("SYNC-002", "Push", "200", resp.status_code)
    except Exception as e:
        log_fail("SYNC-002", "Push", "200", str(e))

# ========== MAIN ==========
def main():
    print("="*60)
    print("🧪 NEXUS E2E TEST SUITE")
    print(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60)
    
    try:
        # Check server
        resp = requests.get(f"{BASE_URL}/api/docs", timeout=5)
        print(f"✅ Server is running at {BASE_URL}")
    except:
        print(f"❌ Server is not running at {BASE_URL}")
        return
    
    # Run tests
    test_auth()
    test_docs()
    test_tasks()
    test_security()
    test_sync()
    
    # Summary
    print("\n" + "="*60)
    print("📊 TEST RESULTS SUMMARY")
    print("="*60)
    total = results["passed"] + results["failed"]
    pass_rate = (results["passed"] / total * 100) if total > 0 else 0
    
    print(f"✅ Passed:   {results['passed']}")
    print(f"❌ Failed:   {results['failed']}")
    print(f"⚠️  Warnings: {results['warnings']}")
    print(f"📈 Pass Rate: {pass_rate:.1f}%")
    print("="*60)
    
    # Failed tests detail
    if results["failed"] > 0:
        print("\n❌ FAILED TESTS:")
        for detail in results["details"]:
            if detail["status"] == "FAIL":
                print(f"   - {detail['id']}: {detail['message']}")
    
    # Save results
    with open("/tmp/e2e_test_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n📄 Results saved to /tmp/e2e_test_results.json")

if __name__ == "__main__":
    main()
