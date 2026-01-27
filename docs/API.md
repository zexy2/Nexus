# 📚 Nexus API Documentation

> **Version:** 1.0.0  
> **Base URL:** `http://localhost:3000/api`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Documents API](#documents-api)
3. [Tasks API](#tasks-api)
4. [Chat & AI API](#chat--ai-api)
5. [Agents API](#agents-api)
6. [Workflows API](#workflows-api)
7. [Sync API](#sync-api)
8. [Search API](#search-api)
9. [Settings API](#settings-api)
10. [Error Handling](#error-handling)

---

## Authentication

All protected endpoints require a valid session. Authentication is handled via Better-Auth.

### POST /api/auth/sign-in
Sign in with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "user-123",
    "name": "John Doe",
    "email": "user@example.com"
  },
  "session": {
    "id": "session-456",
    "expiresAt": "2026-02-20T00:00:00Z"
  }
}
```

### POST /api/auth/sign-up
Create a new user account.

### POST /api/auth/sign-out
End the current session.

### GET /api/auth/session
Get current session information.

---

## Documents API

### GET /api/docs
List all documents for the current user.

**Query Parameters:**
| Parameter         | Type    | Description               |
| ----------------- | ------- | ------------------------- |
| `workspaceId`     | string  | Filter by workspace       |
| `limit`           | number  | Max results (default: 50) |
| `includeArchived` | boolean | Include archived docs     |

**Response:** `200 OK`
```json
[
  {
    "id": "doc-123",
    "title": "My Document",
    "content": [...],
    "workspaceId": "workspace-456",
    "iconEmoji": "📄",
    "isArchived": false,
    "createdAt": "2026-01-15T10:00:00Z",
    "updatedAt": "2026-01-20T14:30:00Z"
  }
]
```

### GET /api/docs/:id
Get a single document by ID.

**Response:** `200 OK`
```json
{
  "id": "doc-123",
  "title": "My Document",
  "content": [
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "Hello world" }]
    }
  ],
  "workspaceId": "workspace-456",
  "parentId": null,
  "iconEmoji": "📄",
  "isArchived": false,
  "createdBy": "user-123",
  "createdAt": "2026-01-15T10:00:00Z",
  "updatedAt": "2026-01-20T14:30:00Z"
}
```

### POST /api/docs
Create a new document.

**Request Body:**
```json
{
  "title": "New Document",
  "content": [],
  "workspaceId": "workspace-456",
  "iconEmoji": "📝",
  "parentId": null
}
```

**Response:** `201 Created`
```json
{
  "id": "doc-789",
  "message": "Document created successfully"
}
```

### PATCH /api/docs/:id
Update a document.

**Request Body:**
```json
{
  "title": "Updated Title",
  "content": [...],
  "iconEmoji": "📌"
}
```

**Response:** `200 OK`
```json
{
  "message": "Document updated successfully"
}
```

### DELETE /api/docs/:id
Delete (archive) a document.

**Response:** `200 OK`
```json
{
  "message": "Document deleted successfully"
}
```

---

## Tasks API

### GET /api/tasks
List all tasks.

**Query Parameters:**
| Parameter     | Type   | Description                                     |
| ------------- | ------ | ----------------------------------------------- |
| `workspaceId` | string | Filter by workspace                             |
| `status`      | string | Filter by status: `todo`, `in_progress`, `done` |
| `assigneeId`  | string | Filter by assignee                              |
| `priority`    | string | Filter by priority                              |

**Response:** `200 OK`
```json
[
  {
    "id": "task-123",
    "title": "Complete documentation",
    "description": "Write API docs",
    "status": "in_progress",
    "priority": "high",
    "assigneeId": "user-456",
    "dueDate": "2026-01-25T00:00:00Z",
    "workspaceId": "workspace-789",
    "createdAt": "2026-01-15T10:00:00Z"
  }
]
```

### GET /api/tasks/:id
Get a single task by ID.

### POST /api/tasks
Create a new task.

**Request Body:**
```json
{
  "title": "New Task",
  "description": "Task description",
  "status": "todo",
  "priority": "medium",
  "workspaceId": "workspace-456",
  "dueDate": "2026-02-01T00:00:00Z"
}
```

**Response:** `201 Created`

### PATCH /api/tasks/:id
Update a task.

**Request Body:**
```json
{
  "status": "done",
  "completedAt": "2026-01-20T15:00:00Z"
}
```

### DELETE /api/tasks/:id
Delete a task.

---

## Chat & AI API

### POST /api/chat
Send a message to the AI chat system.

**Request Body:**
```json
{
  "messages": [
    { "role": "user", "content": "Araştırma yap ve rapor oluştur" }
  ],
  "mode": "auto",
  "workspaceId": "workspace-123"
}
```

**Modes:**
- `auto` - Supervisor decides which agents to use
- `researcher` - Direct to research agent
- `writer` - Direct to writer agent
- `coder` - Direct to coder agent
- `task` - Direct to task agent
- `simple` - No agents, direct LLM response

**Response:** Streaming text/event-stream
```
data: {"type": "text", "content": "Starting research..."}
data: {"type": "agent", "agent": "researcher", "status": "active"}
data: {"type": "text", "content": "Here is what I found..."}
data: [DONE]
```

---

## Agents API

### GET /api/agents/executions
List agent execution history.

**Query Parameters:**
| Parameter     | Type   | Description                              |
| ------------- | ------ | ---------------------------------------- |
| `workspaceId` | string | Filter by workspace                      |
| `status`      | string | Filter: `running`, `completed`, `failed` |
| `limit`       | number | Max results (default: 50)                |

**Response:** `200 OK`
```json
[
  {
    "id": "exec-123",
    "agentType": "researcher",
    "status": "completed",
    "input": "AI trends research",
    "output": "...",
    "startedAt": "2026-01-20T10:00:00Z",
    "completedAt": "2026-01-20T10:01:30Z",
    "duration": "1.5min"
  }
]
```

### POST /api/agents/executions
Create a new agent execution record.

**Request Body:**
```json
{
  "agentType": "researcher",
  "workspaceId": "workspace-123",
  "input": "Research query"
}
```

### PATCH /api/agents/executions
Update an execution status.

**Request Body:**
```json
{
  "id": "exec-123",
  "status": "completed",
  "output": "Research results...",
  "error": null
}
```

### POST /api/agents
Direct agent execution (streaming).

**Request Body:**
```json
{
  "message": "Write a Python function",
  "mode": "coder",
  "context": {
    "workspaceId": "workspace-123",
    "userId": "user-456"
  }
}
```

---

## Workflows API

### POST /api/workflows
Trigger a Temporal workflow.

**Request Body:**
```json
{
  "type": "document_generation",
  "input": {
    "prompt": "Create a marketing plan",
    "title": "Q1 Marketing Plan",
    "workspaceId": "workspace-123",
    "style": "formal"
  }
}
```

**Workflow Types:**
- `document_generation` - Research + Write document
- `research` - Deep research with web search
- `task_breakdown` - Break project into tasks
- `code_generation` - Generate code with tests

**Response:** `202 Accepted`
```json
{
  "workflowId": "wf-abc123",
  "status": "started",
  "usingTemporal": true
}
```

### GET /api/workflows/:id
Get workflow status.

**Response:** `200 OK`
```json
{
  "workflowId": "wf-abc123",
  "status": "running",
  "currentActivity": "research",
  "progress": 50
}
```

---

## Sync API

### POST /api/sync/push
Push local mutations to server.

**Request Body:**
```json
{
  "clientId": "client-abc123",
  "mutations": [
    {
      "id": "mut-1",
      "table": "docs",
      "operation": "create",
      "data": {
        "id": "doc-new",
        "title": "New Doc",
        "content": []
      },
      "timestamp": 1705762800000
    }
  ]
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "applied": 1,
  "failed": 0,
  "serverTimestamp": 1705762801000
}
```

### GET /api/sync/pull
Pull changes from server.

**Query Parameters:**
| Parameter     | Type   | Description            |
| ------------- | ------ | ---------------------- |
| `lastSync`    | number | Timestamp of last sync |
| `workspaceId` | string | Filter by workspace    |

**Response:** `200 OK`
```json
{
  "docs": [...],
  "tasks": [...],
  "workspaces": [...],
  "lastSync": 1705762900000,
  "hasMore": false
}
```

---

## Search API

### GET /api/search
Keyword search across documents and tasks.

**Query Parameters:**
| Parameter | Type   | Description                    |
| --------- | ------ | ------------------------------ |
| `q`       | string | Search query                   |
| `type`    | string | Filter: `docs`, `tasks`, `all` |
| `limit`   | number | Max results                    |

**Response:** `200 OK`
```json
{
  "results": [
    {
      "type": "doc",
      "id": "doc-123",
      "title": "Matching Document",
      "content": "...matched text...",
      "score": 0.95
    }
  ],
  "total": 5
}
```

### POST /api/search
Semantic search with embeddings.

**Request Body:**
```json
{
  "query": "AI implementation strategies",
  "options": {
    "useSemantic": true,
    "limit": 10,
    "includeContext": true
  }
}
```

---

## Settings API

### GET /api/settings
Get user settings.

**Response:** `200 OK`
```json
{
  "user": {
    "id": "user-123",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "ai": {
    "defaultModel": "gemini-2.5-flash",
    "autoSaveAiOutputs": true
  },
  "sync": {
    "offlineMode": true,
    "syncFrequency": 30
  },
  "notifications": {
    "email": true,
    "agent": true
  }
}
```

### PATCH /api/settings
Update user settings.

**Request Body:**
```json
{
  "ai": {
    "defaultModel": "gpt-4o"
  }
}
```

---

## Error Handling

All endpoints return consistent error responses.

### Error Response Format
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### HTTP Status Codes

| Code  | Description                               |
| ----- | ----------------------------------------- |
| `200` | Success                                   |
| `201` | Created                                   |
| `204` | No Content                                |
| `400` | Bad Request - Invalid input               |
| `401` | Unauthorized - Not logged in              |
| `403` | Forbidden - No permission                 |
| `404` | Not Found                                 |
| `429` | Rate Limited                              |
| `500` | Internal Server Error                     |
| `503` | Service Unavailable (e.g., Temporal down) |

### Common Error Codes

| Code                   | Description                    |
| ---------------------- | ------------------------------ |
| `INVALID_INPUT`        | Request body validation failed |
| `NOT_FOUND`            | Resource doesn't exist         |
| `UNAUTHORIZED`         | Authentication required        |
| `FORBIDDEN`            | Permission denied              |
| `RATE_LIMITED`         | Too many requests              |
| `AI_ERROR`             | AI provider error              |
| `TEMPORAL_UNAVAILABLE` | Workflow engine offline        |

---

## Rate Limits

| Endpoint         | Limit       |
| ---------------- | ----------- |
| `/api/chat`      | 60 req/min  |
| `/api/agents`    | 30 req/min  |
| `/api/workflows` | 10 req/min  |
| Other endpoints  | 100 req/min |

---

## Examples

### Create Document with AI

```bash
# 1. Start a chat to generate content
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Write a blog post about TypeScript"}],
    "mode": "writer"
  }'

# 2. Save as document
curl -X POST http://localhost:3000/api/docs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "TypeScript Blog Post",
    "content": [...],
    "workspaceId": "ws-123"
  }'
```

### Trigger Research Workflow

```bash
curl -X POST http://localhost:3000/api/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "type": "research",
    "input": {
      "query": "Latest trends in AI agents",
      "workspaceId": "ws-123"
    }
  }'
```

---

*Last updated: 20 Ocak 2026*
