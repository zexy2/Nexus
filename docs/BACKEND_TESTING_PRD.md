# Nexus Backend Testing PRD (Product Requirements Document)

**Version:** 2.0  
**Date:** 27 Ocak 2026  
**Author:** Nexus Development Team  
**Status:** Implementation Ready

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Architecture Overview](#2-project-architecture-overview)
3. [API Routes Specification](#3-api-routes-specification)
4. [Database Schema & Testing](#4-database-schema--testing)
5. [Agents Package Testing](#5-agents-package-testing)
6. [Workflows Package Testing](#6-workflows-package-testing)
7. [External Service Integrations](#7-external-service-integrations)
8. [Security & Authentication Testing](#8-security--authentication-testing)
9. [Performance Testing Requirements](#9-performance-testing-requirements)
10. [Current Test Coverage Analysis](#10-current-test-coverage-analysis)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [Test Environment Configuration](#12-test-environment-configuration)

---

## 1. Executive Summary

### 1.1 Purpose
Bu döküman, Nexus projesinin backend sistemlerinin kapsamlı test edilmesi için gerekli tüm gereksinimleri, spesifikasyonları ve stratejileri içermektedir.

### 1.2 Scope
- **15+ API Endpoint Grubu** - Tüm CRUD operasyonları, streaming, real-time
- **14 Veritabanı Tablosu** - PostgreSQL + pgvector
- **5 AI Agent Tipi** - LangGraph tabanlı multi-agent sistemi
- **4 Workflow Tipi** - Temporal.io durable execution
- **6+ External Servis** - Gemini, OpenAI, Tavily, Langfuse, vb.
- **225+ Test Senaryosu** - Unit, Integration, E2E, Performance

### 1.3 Success Criteria
| Metric                                 | Target  |
| -------------------------------------- | ------- |
| Unit Test Coverage                     | ≥ 85%   |
| Integration Test Coverage              | ≥ 70%   |
| API Response Time (p99)                | < 200ms |
| Database Query Time (p99)              | < 50ms  |
| Agent Response Time                    | < 30s   |
| Zero Critical Security Vulnerabilities | ✓       |

---

## 2. Project Architecture Overview

### 2.1 Technology Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│                    (Next.js 15 App Router)                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                         API LAYER                               │
│              (Next.js API Routes + Server Actions)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │Documents │ │  Tasks   │ │  Agents  │ │ Search/Embeddings│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      SERVICE LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ @nexus/agents│  │@nexus/workflows│ │  @nexus/database   │  │
│  │  (LangGraph) │  │  (Temporal)   │  │  (Drizzle ORM)     │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                     EXTERNAL SERVICES                           │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────┐│
│  │ Gemini │ │ OpenAI │ │ Tavily │ │Temporal│ │ PostgreSQL     ││
│  │  Pro   │ │  GPT-4 │ │ Search │ │  Cloud │ │ + pgvector     ││
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Package Structure

```
packages/
├── @nexus/agents          # AI Agent System (LangGraph)
│   ├── agents/            # Supervisor, Research, Writer, Coder, Task
│   ├── tools/             # Web Search, Vector Search
│   ├── embeddings.ts      # Text-embedding-004
│   ├── gemini.ts          # Gemini Pro integration
│   ├── groq.ts            # Groq Llama integration
│   └── hitl.ts            # Human-in-the-loop
│
├── @nexus/workflows       # Durable Execution (Temporal)
│   ├── activities.ts      # 15+ activities
│   ├── workflows.ts       # 4 workflow types
│   ├── worker.ts          # Temporal worker
│   └── client.ts          # Temporal client
│
├── @nexus/database        # Data Layer (Drizzle + PostgreSQL)
│   └── schema/            # 14 tables
│
└── @nexus/zero-schema     # Zero Protocol (Real-time sync)
```

---

## 3. API Routes Specification

### 3.1 Authentication Endpoints

#### POST /api/auth/sign-in
```typescript
// Request
{
  email: string;      // Required, valid email format
  password: string;   // Required, min 8 chars
  rememberMe?: boolean;
}

// Response 200
{
  user: {
    id: string;
    email: string;
    name: string;
    image?: string;
    emailVerified: boolean;
  };
  session: {
    id: string;
    token: string;
    expiresAt: string;
  };
}

// Response 401
{
  error: "INVALID_CREDENTIALS";
  message: "Email or password is incorrect";
}

// Response 429
{
  error: "RATE_LIMITED";
  message: "Too many login attempts. Try again in {retryAfter} seconds";
  retryAfter: number;
}
```

**Test Cases:**
| ID       | Scenario               | Expected Result         |
| -------- | ---------------------- | ----------------------- |
| AUTH-001 | Valid credentials      | 200 + session token     |
| AUTH-002 | Invalid email format   | 400 validation error    |
| AUTH-003 | Wrong password         | 401 INVALID_CREDENTIALS |
| AUTH-004 | Non-existent user      | 401 INVALID_CREDENTIALS |
| AUTH-005 | 5+ failed attempts     | 429 rate limited        |
| AUTH-006 | SQL injection in email | 400 validation error    |
| AUTH-007 | Empty password         | 400 validation error    |
| AUTH-008 | XSS in email field     | 400 sanitized/rejected  |

#### POST /api/auth/sign-up
```typescript
// Request
{
  email: string;      // Required, unique
  password: string;   // Required, min 8, complexity rules
  name: string;       // Required, 2-100 chars
}

// Response 201
{
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: false;
  };
  message: "Verification email sent";
}

// Response 409
{
  error: "EMAIL_EXISTS";
  message: "An account with this email already exists";
}
```

**Test Cases:**
| ID       | Scenario             | Expected Result           |
| -------- | -------------------- | ------------------------- |
| AUTH-010 | Valid registration   | 201 + verification email  |
| AUTH-011 | Duplicate email      | 409 EMAIL_EXISTS          |
| AUTH-012 | Weak password        | 400 password requirements |
| AUTH-013 | Invalid email domain | 400 validation error      |
| AUTH-014 | Name too short       | 400 validation error      |
| AUTH-015 | XSS in name field    | 400 sanitized             |

#### POST /api/auth/sign-out
```typescript
// Headers
Authorization: Bearer <token>

// Response 200
{
  success: true;
}

// Response 401
{
  error: "UNAUTHORIZED";
}
```

#### GET /api/auth/session
```typescript
// Headers
Authorization: Bearer <token>

// Response 200
{
  user: User;
  session: Session;
}

// Response 401
{
  error: "SESSION_EXPIRED";
}
```

---

### 3.2 Documents API

#### GET /api/documents
```typescript
// Query Parameters
{
  workspaceId?: string;    // Filter by workspace
  search?: string;         // Full-text search
  type?: "document" | "folder";
  parentId?: string;       // For folder contents
  page?: number;           // Default: 1
  limit?: number;          // Default: 20, max: 100
  sortBy?: "createdAt" | "updatedAt" | "title";
  sortOrder?: "asc" | "desc";
}

// Response 200
{
  documents: Document[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Document Type
interface Document {
  id: string;
  title: string;
  content: string;           // TipTap JSON or plain text
  type: "document" | "folder";
  parentId: string | null;
  workspaceId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  metadata: {
    wordCount: number;
    lastEditedBy: string;
    version: number;
  };
}
```

**Test Cases:**
| ID      | Scenario               | Expected Result         |
| ------- | ---------------------- | ----------------------- |
| DOC-001 | List all documents     | 200 + paginated list    |
| DOC-002 | Filter by workspace    | Only workspace docs     |
| DOC-003 | Full-text search       | Matching documents      |
| DOC-004 | Pagination page 2      | Correct offset          |
| DOC-005 | Invalid workspaceId    | 404 workspace not found |
| DOC-006 | Unauthorized access    | 401 error               |
| DOC-007 | Cross-workspace access | 403 forbidden           |
| DOC-008 | Sort by updatedAt desc | Correct order           |
| DOC-009 | Limit > 100            | Capped to 100           |
| DOC-010 | Empty search results   | Empty array, 200        |

#### POST /api/documents
```typescript
// Request
{
  title: string;           // Required, 1-500 chars
  content?: string;        // Optional, TipTap JSON
  type: "document" | "folder";
  parentId?: string;       // Parent folder ID
  workspaceId: string;     // Required
}

// Response 201
{
  document: Document;
}

// Response 400
{
  error: "VALIDATION_ERROR";
  details: ValidationError[];
}
```

**Test Cases:**
| ID      | Scenario                  | Expected Result      |
| ------- | ------------------------- | -------------------- |
| DOC-020 | Create valid document     | 201 + document       |
| DOC-021 | Create folder             | 201 + folder type    |
| DOC-022 | Missing title             | 400 validation       |
| DOC-023 | Invalid parentId          | 404 parent not found |
| DOC-024 | Nested folder creation    | Correct hierarchy    |
| DOC-025 | Title too long (>500)     | 400 validation       |
| DOC-026 | Invalid workspace         | 403 forbidden        |
| DOC-027 | Duplicate title in folder | 409 conflict         |
| DOC-028 | Create with empty content | 201 with empty       |
| DOC-029 | XSS in title              | Sanitized            |

#### PATCH /api/documents/[id]
```typescript
// Request
{
  title?: string;
  content?: string;
  parentId?: string | null;
}

// Response 200
{
  document: Document;
}

// Response 409 (Optimistic Locking)
{
  error: "CONFLICT";
  message: "Document was modified by another user";
  serverVersion: number;
  clientVersion: number;
}
```

**Test Cases:**
| ID      | Scenario                 | Expected Result   |
| ------- | ------------------------ | ----------------- |
| DOC-030 | Update title             | 200 + updated doc |
| DOC-031 | Update content           | 200 + new version |
| DOC-032 | Move to folder           | Updated parentId  |
| DOC-033 | Move to root             | parentId = null   |
| DOC-034 | Non-existent doc         | 404 not found     |
| DOC-035 | Concurrent edit conflict | 409 conflict      |
| DOC-036 | Unauthorized update      | 403 forbidden     |
| DOC-037 | Circular parent ref      | 400 invalid       |

#### DELETE /api/documents/[id]
```typescript
// Query Parameters
{
  permanent?: boolean;  // Default: false (soft delete)
}

// Response 200
{
  success: true;
  deletedAt: string;
}

// Response 200 (with children)
{
  success: true;
  deletedCount: number;  // Including children
}
```

**Test Cases:**
| ID      | Scenario                    | Expected Result |
| ------- | --------------------------- | --------------- |
| DOC-040 | Soft delete document        | 200 + deletedAt |
| DOC-041 | Permanent delete            | 200 + removed   |
| DOC-042 | Delete folder with children | All deleted     |
| DOC-043 | Delete non-existent         | 404             |
| DOC-044 | Delete already deleted      | 400             |
| DOC-045 | Unauthorized delete         | 403             |

---

### 3.3 Tasks API

#### GET /api/tasks
```typescript
// Query Parameters
{
  workspaceId?: string;
  projectId?: string;
  status?: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assigneeId?: string;
  dueDate?: {
    from?: string;    // ISO date
    to?: string;
  };
  tags?: string[];    // Filter by tags
  search?: string;
  page?: number;
  limit?: number;
}

// Response 200
{
  tasks: Task[];
  pagination: Pagination;
  aggregations: {
    byStatus: Record<Status, number>;
    byPriority: Record<Priority, number>;
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
  };
}

// Task Type
interface Task {
  id: string;
  title: string;
  description?: string;
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate?: string;
  assigneeId?: string;
  assignee?: User;
  projectId?: string;
  project?: Project;
  workspaceId: string;
  parentTaskId?: string;      // For subtasks
  subtasks?: Task[];
  tags: string[];
  estimatedHours?: number;
  actualHours?: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  order: number;              // For Kanban ordering
}
```

**Test Cases:**
| ID       | Scenario                  | Expected Result      |
| -------- | ------------------------- | -------------------- |
| TASK-001 | List all tasks            | 200 + aggregations   |
| TASK-002 | Filter by status          | Only matching status |
| TASK-003 | Filter by multiple status | OR condition         |
| TASK-004 | Filter by date range      | Within range         |
| TASK-005 | Filter overdue            | Past due, not done   |
| TASK-006 | Search in title/desc      | Full-text match      |
| TASK-007 | Filter by tags            | All tags match       |
| TASK-008 | Sort by priority          | Correct order        |
| TASK-009 | Include subtasks          | Nested structure     |
| TASK-010 | Aggregations accuracy     | Correct counts       |

#### POST /api/tasks
```typescript
// Request
{
  title: string;              // Required, 1-500
  description?: string;
  status?: Status;            // Default: TODO
  priority?: Priority;        // Default: MEDIUM
  dueDate?: string;
  assigneeId?: string;
  projectId?: string;
  workspaceId: string;        // Required
  parentTaskId?: string;
  tags?: string[];
  estimatedHours?: number;
}

// Response 201
{
  task: Task;
}
```

**Test Cases:**
| ID       | Scenario               | Expected Result       |
| -------- | ---------------------- | --------------------- |
| TASK-020 | Create minimal task    | 201 with defaults     |
| TASK-021 | Create with all fields | 201 complete task     |
| TASK-022 | Create subtask         | Linked to parent      |
| TASK-023 | Invalid assignee       | 404 user not found    |
| TASK-024 | Invalid project        | 404 project not found |
| TASK-025 | Due date in past       | 400 or warning        |
| TASK-026 | Circular subtask       | 400 invalid           |
| TASK-027 | Max subtask depth      | 400 if > 3 levels     |

#### PATCH /api/tasks/[id]
```typescript
// Request (Partial Update)
{
  title?: string;
  status?: Status;
  priority?: Priority;
  assigneeId?: string | null;
  order?: number;             // For reordering
}

// Response 200
{
  task: Task;
  notification?: {            // If status changed
    type: "STATUS_CHANGE";
    recipients: string[];
  };
}
```

**Test Cases:**
| ID       | Scenario         | Expected Result    |
| -------- | ---------------- | ------------------ |
| TASK-030 | Update status    | 200 + notification |
| TASK-031 | Reorder (Kanban) | Updated order      |
| TASK-032 | Bulk reorder     | All updated        |
| TASK-033 | Complete task    | completedAt set    |
| TASK-034 | Reopen task      | completedAt null   |
| TASK-035 | Assign to user   | Notification sent  |
| TASK-036 | Unassign         | assigneeId null    |

#### POST /api/tasks/[id]/time
```typescript
// Request (Time Tracking)
{
  hours: number;
  date: string;
  description?: string;
}

// Response 200
{
  task: Task;
  timeEntry: TimeEntry;
  totalHours: number;
}
```

---

### 3.4 Agents API

#### POST /api/agents/execute
```typescript
// Request
{
  agentType: "supervisor" | "research" | "writer" | "coder" | "task";
  input: string;              // User prompt
  context?: {
    documentId?: string;
    taskId?: string;
    conversationHistory?: Message[];
    workspaceId: string;
  };
  config?: {
    maxIterations?: number;   // Default: 10
    temperature?: number;     // 0-1
    model?: string;           // Default: gemini-pro
    streaming?: boolean;      // Default: true
  };
}

// Response 200 (Streaming)
// SSE Stream with events:
event: thinking
data: {"step": 1, "agent": "supervisor", "thought": "Analyzing request..."}

event: tool_call
data: {"tool": "web_search", "input": {"query": "..."}}

event: tool_result
data: {"tool": "web_search", "result": {...}}

event: agent_switch
data: {"from": "supervisor", "to": "research", "reason": "..."}

event: hitl_request
data: {"type": "approval", "action": "execute_code", "riskLevel": "high"}

event: partial
data: {"content": "Here is the "}

event: complete
data: {"content": "Full response...", "metadata": {...}}

// Response 200 (Non-streaming)
{
  result: {
    content: string;
    agentPath: string[];      // Agents used
    toolsUsed: string[];
    iterations: number;
    duration: number;
    tokenUsage: {
      input: number;
      output: number;
      total: number;
    };
  };
  metadata: {
    model: string;
    temperature: number;
    finishReason: string;
  };
}
```

**Test Cases:**
| ID        | Scenario             | Expected Result       |
| --------- | -------------------- | --------------------- |
| AGENT-001 | Simple query         | Supervisor handles    |
| AGENT-002 | Research request     | Delegates to research |
| AGENT-003 | Code generation      | Delegates to coder    |
| AGENT-004 | Writing task         | Delegates to writer   |
| AGENT-005 | Multi-agent flow     | Correct delegation    |
| AGENT-006 | Tool usage           | web_search called     |
| AGENT-007 | HITL approval        | Pauses for approval   |
| AGENT-008 | HITL rejection       | Graceful handling     |
| AGENT-009 | Stream interruption  | Cleanup on disconnect |
| AGENT-010 | Max iterations       | Stops at limit        |
| AGENT-011 | Context injection    | Uses document context |
| AGENT-012 | Conversation history | Maintains context     |
| AGENT-013 | Rate limiting        | 429 after quota       |
| AGENT-014 | Invalid agent type   | 400 validation        |
| AGENT-015 | Empty input          | 400 validation        |
| AGENT-016 | Token limit exceeded | 413 payload too large |
| AGENT-017 | Model fallback       | Uses backup on error  |
| AGENT-018 | Timeout handling     | 504 after 60s         |

#### POST /api/agents/embeddings
```typescript
// Request
{
  texts: string[];           // Max 100 texts
  model?: string;            // Default: text-embedding-004
}

// Response 200
{
  embeddings: number[][];    // 768-dim vectors
  usage: {
    totalTokens: number;
  };
}
```

**Test Cases:**
| ID      | Scenario           | Expected Result   |
| ------- | ------------------ | ----------------- |
| EMB-001 | Single text        | 768-dim vector    |
| EMB-002 | Batch texts        | All embeddings    |
| EMB-003 | Empty text         | 400 validation    |
| EMB-004 | Text too long      | Truncated/error   |
| EMB-005 | 100+ texts         | 400 batch limit   |
| EMB-006 | Special characters | Handled correctly |
| EMB-007 | Unicode/emoji      | Proper encoding   |

#### GET /api/agents/history
```typescript
// Query Parameters
{
  workspaceId: string;
  agentType?: string;
  status?: "running" | "completed" | "failed" | "cancelled";
  limit?: number;
  cursor?: string;
}

// Response 200
{
  executions: AgentExecution[];
  nextCursor?: string;
}

// AgentExecution Type
interface AgentExecution {
  id: string;
  agentType: string;
  input: string;
  output?: string;
  status: string;
  duration?: number;
  tokenUsage?: TokenUsage;
  error?: string;
  createdAt: string;
  completedAt?: string;
}
```

---

### 3.5 Search API

#### POST /api/search
```typescript
// Request
{
  query: string;
  type?: "semantic" | "keyword" | "hybrid";  // Default: hybrid
  filters?: {
    contentType?: ("document" | "task" | "message")[];
    workspaceId?: string;
    dateRange?: { from: string; to: string };
    createdBy?: string;
  };
  options?: {
    limit?: number;          // Default: 20
    offset?: number;
    includeContent?: boolean; // Return full content
    highlightMatches?: boolean;
  };
}

// Response 200
{
  results: SearchResult[];
  totalCount: number;
  facets: {
    contentType: Record<string, number>;
    workspace: Record<string, number>;
  };
  timing: {
    total: number;
    embedding: number;
    search: number;
    rerank: number;
  };
}

// SearchResult Type
interface SearchResult {
  id: string;
  type: "document" | "task" | "message";
  title: string;
  content?: string;
  snippet: string;           // With highlights
  score: number;             // Relevance score
  metadata: Record<string, any>;
  highlights?: {
    title?: string[];
    content?: string[];
  };
}
```

**Test Cases:**
| ID         | Scenario               | Expected Result      |
| ---------- | ---------------------- | -------------------- |
| SEARCH-001 | Simple keyword         | Matching results     |
| SEARCH-002 | Semantic search        | Conceptually similar |
| SEARCH-003 | Hybrid search          | Combined ranking     |
| SEARCH-004 | Filter by type         | Only matching type   |
| SEARCH-005 | Date range filter      | Within range         |
| SEARCH-006 | Empty query            | 400 validation       |
| SEARCH-007 | No results             | Empty array, 200     |
| SEARCH-008 | Pagination             | Correct offset       |
| SEARCH-009 | Highlight matches      | Bold markers         |
| SEARCH-010 | Score accuracy         | Relevance ranking    |
| SEARCH-011 | Cross-workspace        | Only authorized      |
| SEARCH-012 | Special chars in query | Escaped properly     |
| SEARCH-013 | Very long query        | Truncated/handled    |
| SEARCH-014 | Facet counts           | Accurate aggregation |

#### POST /api/search/reindex
```typescript
// Request
{
  contentType?: string[];   // Specific types to reindex
  full?: boolean;           // Full reindex
}

// Response 202
{
  jobId: string;
  status: "queued";
  estimatedTime: number;
}

// GET /api/search/reindex/[jobId]
{
  jobId: string;
  status: "running" | "completed" | "failed";
  progress: number;         // 0-100
  processedCount: number;
  totalCount: number;
  errors?: string[];
}
```

---

### 3.6 Workflows API

#### POST /api/workflows/start
```typescript
// Request
{
  workflowType: "document_processing" | "research" | "task_automation" | "code_review";
  input: Record<string, any>;
  options?: {
    priority?: "low" | "normal" | "high";
    timeout?: number;        // Seconds
    retryPolicy?: {
      maxAttempts: number;
      backoff: "linear" | "exponential";
    };
  };
}

// Response 202
{
  workflowId: string;
  runId: string;
  status: "RUNNING";
  startedAt: string;
}
```

**Test Cases:**
| ID     | Scenario                | Expected Result         |
| ------ | ----------------------- | ----------------------- |
| WF-001 | Start document workflow | 202 + IDs               |
| WF-002 | Start research workflow | 202 + IDs               |
| WF-003 | Invalid workflow type   | 400 validation          |
| WF-004 | Missing required input  | 400 validation          |
| WF-005 | Temporal unavailable    | 503 service unavailable |
| WF-006 | Duplicate workflow ID   | 409 conflict            |

#### GET /api/workflows/[workflowId]
```typescript
// Response 200
{
  workflowId: string;
  runId: string;
  type: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
  input: Record<string, any>;
  output?: Record<string, any>;
  error?: {
    message: string;
    type: string;
    stackTrace?: string;
  };
  history: WorkflowEvent[];
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

// WorkflowEvent Type
interface WorkflowEvent {
  id: string;
  type: "ACTIVITY_STARTED" | "ACTIVITY_COMPLETED" | "SIGNAL_RECEIVED" | "TIMER_FIRED";
  timestamp: string;
  details: Record<string, any>;
}
```

**Test Cases:**
| ID     | Scenario               | Expected Result |
| ------ | ---------------------- | --------------- |
| WF-010 | Get running workflow   | Current status  |
| WF-011 | Get completed workflow | Output included |
| WF-012 | Get failed workflow    | Error details   |
| WF-013 | Non-existent workflow  | 404             |
| WF-014 | History pagination     | All events      |

#### POST /api/workflows/[workflowId]/signal
```typescript
// Request
{
  signalName: string;
  payload?: Record<string, any>;
}

// Response 200
{
  success: true;
  signalId: string;
}
```

#### POST /api/workflows/[workflowId]/cancel
```typescript
// Response 200
{
  success: true;
  cancelledAt: string;
}
```

---

### 3.7 Collaboration API (Real-time)

#### WebSocket /api/collaboration/[documentId]
```typescript
// Connection
ws://host/api/collaboration/{documentId}?token={authToken}

// Client → Server Messages
{
  type: "awareness" | "sync" | "update";
  payload: Uint8Array;       // Yjs encoded
}

// Server → Client Messages
{
  type: "sync" | "update" | "awareness";
  payload: Uint8Array;
}

// Awareness Update
{
  type: "awareness";
  clients: {
    id: string;
    user: { name: string; color: string };
    cursor?: { x: number; y: number };
    selection?: { anchor: number; head: number };
  }[];
}
```

**Test Cases:**
| ID         | Scenario             | Expected Result         |
| ---------- | -------------------- | ----------------------- |
| COLLAB-001 | Connect to document  | Sync initial state      |
| COLLAB-002 | Send update          | Broadcast to others     |
| COLLAB-003 | Concurrent edits     | CRDT merge              |
| COLLAB-004 | Awareness update     | Cursor positions        |
| COLLAB-005 | Disconnect handling  | Cleanup awareness       |
| COLLAB-006 | Reconnect sync       | State recovery          |
| COLLAB-007 | Invalid token        | 401 connection rejected |
| COLLAB-008 | Document not found   | 404                     |
| COLLAB-009 | 10+ concurrent users | No conflicts            |
| COLLAB-010 | Large document sync  | Performance OK          |

---

### 3.8 Settings API

#### GET /api/settings
```typescript
// Response 200
{
  user: {
    theme: "light" | "dark" | "system";
    language: string;
    timezone: string;
    notifications: {
      email: boolean;
      push: boolean;
      mentions: boolean;
      taskUpdates: boolean;
    };
  };
  workspace: {
    name: string;
    logo?: string;
    defaultAgentModel: string;
    features: {
      aiAssistant: boolean;
      collaboration: boolean;
      workflows: boolean;
    };
  };
  integrations: {
    github?: { connected: boolean; username?: string };
    slack?: { connected: boolean; workspace?: string };
    google?: { connected: boolean; email?: string };
  };
}
```

#### PATCH /api/settings
```typescript
// Request (Partial)
{
  user?: Partial<UserSettings>;
  workspace?: Partial<WorkspaceSettings>;
}

// Response 200
{
  settings: Settings;
  changedFields: string[];
}
```

---

## 4. Database Schema & Testing

### 4.1 Complete Schema

```sql
-- =============================================
-- USERS & AUTHENTICATION
-- =============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    image TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,           -- 'google', 'github', 'credentials'
    provider_account_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(provider, provider_account_id)
);

CREATE TABLE verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(255) NOT NULL,        -- email
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    type VARCHAR(50) NOT NULL                -- 'email', 'password_reset'
);

-- =============================================
-- WORKSPACES
-- =============================================

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo TEXT,
    settings JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member', 'guest'
    invited_by UUID REFERENCES users(id),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

-- =============================================
-- DOCUMENTS
-- =============================================

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    content TEXT,                            -- TipTap JSON
    type VARCHAR(20) NOT NULL DEFAULT 'document', -- 'document', 'folder'
    parent_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    version INTEGER DEFAULT 1,
    deleted_at TIMESTAMP WITH TIME ZONE,     -- Soft delete
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_documents_workspace ON documents(workspace_id);
CREATE INDEX idx_documents_parent ON documents(parent_id);
CREATE INDEX idx_documents_fulltext ON documents USING gin(to_tsvector('english', title || ' ' || COALESCE(content, '')));

-- =============================================
-- TASKS
-- =============================================

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    color VARCHAR(7),                        -- Hex color
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    archived_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'TODO',
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    due_date TIMESTAMP WITH TIME ZONE,
    assignee_id UUID REFERENCES users(id),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    tags TEXT[] DEFAULT '{}',
    estimated_hours DECIMAL(10, 2),
    actual_hours DECIMAL(10, 2),
    completed_at TIMESTAMP WITH TIME ZONE,
    "order" INTEGER DEFAULT 0,               -- Kanban order
    created_by UUID REFERENCES users(id),
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_project ON tasks(project_id);

CREATE TABLE task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    hours DECIMAL(10, 2) NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- AI AGENTS
-- =============================================

CREATE TABLE agent_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    agent_type VARCHAR(50) NOT NULL,
    input TEXT NOT NULL,
    output TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed', 'cancelled'
    error TEXT,
    metadata JSONB DEFAULT '{}',             -- tokens, duration, tools used
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_agent_executions_workspace ON agent_executions(workspace_id);
CREATE INDEX idx_agent_executions_status ON agent_executions(status);

CREATE TABLE agent_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(200),
    messages JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- EMBEDDINGS (pgvector)
-- =============================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type VARCHAR(50) NOT NULL,       -- 'document', 'task', 'message'
    content_id UUID NOT NULL,
    chunk_index INTEGER DEFAULT 0,
    chunk_text TEXT NOT NULL,
    embedding vector(768) NOT NULL,          -- text-embedding-004
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_embeddings_content ON embeddings(content_type, content_id);
CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =============================================
-- WORKFLOWS (Temporal)
-- =============================================

CREATE TABLE workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id VARCHAR(255) UNIQUE NOT NULL,
    run_id VARCHAR(255) NOT NULL,
    workflow_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    input JSONB,
    output JSONB,
    error TEXT,
    workspace_id UUID REFERENCES workspaces(id),
    started_by UUID REFERENCES users(id),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX idx_workflow_runs_workspace ON workflow_runs(workspace_id);
```

### 4.2 Database Test Cases

#### Connection & Pool Tests
| ID     | Test                     | Expected           |
| ------ | ------------------------ | ------------------ |
| DB-001 | Connection establishment | Pool created       |
| DB-002 | Connection pool limits   | Max 20 connections |
| DB-003 | Connection timeout       | 5s timeout         |
| DB-004 | Reconnect on failure     | Auto-reconnect     |
| DB-005 | Health check query       | `SELECT 1` works   |

#### Schema & Migration Tests
| ID     | Test                    | Expected          |
| ------ | ----------------------- | ----------------- |
| DB-010 | All tables exist        | 14 tables         |
| DB-011 | pgvector extension      | Enabled           |
| DB-012 | All indexes exist       | 15+ indexes       |
| DB-013 | Foreign key constraints | All valid         |
| DB-014 | Default values          | Applied correctly |
| DB-015 | Migration up            | No errors         |
| DB-016 | Migration down          | Rollback works    |

#### CRUD Operation Tests
| ID     | Test                   | Expected         |
| ------ | ---------------------- | ---------------- |
| DB-020 | Insert user            | ID returned      |
| DB-021 | Insert duplicate email | Unique violation |
| DB-022 | Update user            | Updated row      |
| DB-023 | Delete cascade         | Children deleted |
| DB-024 | Soft delete            | deleted_at set   |
| DB-025 | Upsert operation       | Insert or update |

#### Query Performance Tests
| ID     | Test                   | Target  |
| ------ | ---------------------- | ------- |
| DB-030 | Simple SELECT          | < 5ms   |
| DB-031 | JOIN 3 tables          | < 20ms  |
| DB-032 | Full-text search       | < 50ms  |
| DB-033 | Vector similarity      | < 100ms |
| DB-034 | Aggregation query      | < 30ms  |
| DB-035 | Pagination (1000 rows) | < 50ms  |

#### Transaction Tests
| ID     | Test                 | Expected        |
| ------ | -------------------- | --------------- |
| DB-040 | Transaction commit   | Data persisted  |
| DB-041 | Transaction rollback | Data reverted   |
| DB-042 | Nested transaction   | Savepoints work |
| DB-043 | Concurrent update    | Optimistic lock |
| DB-044 | Deadlock detection   | Error raised    |

---

## 5. Agents Package Testing

### 5.1 Agent Types

#### Supervisor Agent
```typescript
// Capabilities
- Route requests to appropriate specialized agents
- Coordinate multi-agent workflows
- Aggregate results from multiple agents
- Handle errors and fallbacks

// Test Scenarios
| ID             | Input                    | Expected Behavior   |
| -------------- | ------------------------ | ------------------- |
| SUPERVISOR-001 | "What is the weather?"   | Route to Research   |
| SUPERVISOR-002 | "Write a blog post"      | Route to Writer     |
| SUPERVISOR-003 | "Create a function"      | Route to Coder      |
| SUPERVISOR-004 | "Create a task"          | Route to Task Agent |
| SUPERVISOR-005 | "Research and summarize" | Multi-agent         |
| SUPERVISOR-006 | Invalid request          | Graceful error      |
```

#### Research Agent
```typescript
// Tools Available
- web_search(query: string): SearchResult[]
- vector_search(query: string, namespace: string): Document[]

// Test Scenarios
| ID           | Scenario        | Expected          |
| ------------ | --------------- | ----------------- |
| RESEARCH-001 | Simple search   | Use web_search    |
| RESEARCH-002 | Document search | Use vector_search |
| RESEARCH-003 | Combined search | Both tools        |
| RESEARCH-004 | Source citation | Include sources   |
| RESEARCH-005 | Rate limit      | Handle gracefully |
```

#### Writer Agent
```typescript
// Capabilities
- Generate various content types
- Follow specific writing styles
- Edit and improve existing content

// Test Scenarios
| ID         | Input           | Expected Output    |
| ---------- | --------------- | ------------------ |
| WRITER-001 | "Write email"   | Professional email |
| WRITER-002 | "Blog post"     | Structured article |
| WRITER-003 | "Summarize doc" | Concise summary    |
| WRITER-004 | "Improve text"  | Enhanced version   |
| WRITER-005 | Specified tone  | Matches tone       |
```

#### Coder Agent
```typescript
// Capabilities
- Generate code in multiple languages
- Explain code
- Debug and fix issues
- Write tests

// Test Scenarios
| ID        | Input               | Expected          |
| --------- | ------------------- | ----------------- |
| CODER-001 | "Python function"   | Valid Python      |
| CODER-002 | "TypeScript class"  | Valid TS          |
| CODER-003 | "Explain this code" | Clear explanation |
| CODER-004 | "Fix this bug"      | Corrected code    |
| CODER-005 | "Write tests"       | Test cases        |
| CODER-006 | Syntax error input  | Identifies issue  |
```

#### Task Agent
```typescript
// Capabilities
- Create and update tasks
- Parse natural language to task format
- Set priorities and due dates

// Test Scenarios
| ID       | Input            | Expected           |
| -------- | ---------------- | ------------------ |
| TASK-001 | "Create task"    | Task object        |
| TASK-002 | "High priority"  | priority: HIGH     |
| TASK-003 | "Due tomorrow"   | Correct date       |
| TASK-004 | "Assign to John" | Assignee set       |
| TASK-005 | Ambiguous input  | Asks clarification |
```

### 5.2 Human-in-the-Loop (HITL)

```typescript
// Risk Levels
type RiskLevel = "low" | "medium" | "high" | "critical";

// Actions Requiring Approval
{
  high: ["execute_code", "modify_file", "send_email"],
  critical: ["delete_data", "api_key_access", "external_api_call"]
}

// Test Scenarios
| ID       | Scenario         | Expected           |
| -------- | ---------------- | ------------------ |
| HITL-001 | Low risk action  | Auto-approve       |
| HITL-002 | High risk action | Pause for approval |
| HITL-003 | User approves    | Continue execution |
| HITL-004 | User rejects     | Graceful stop      |
| HITL-005 | Approval timeout | Default action     |
| HITL-006 | Critical action  | Always require     |
```

### 5.3 Embeddings

```typescript
// Configuration
{
  model: "text-embedding-004",
  dimensions: 768,
  maxTokensPerChunk: 512,
  overlapTokens: 50
}

// Test Scenarios
| ID      | Test               | Expected        |
| ------- | ------------------ | --------------- |
| EMB-001 | Generate embedding | 768-dim vector  |
| EMB-002 | Batch embeddings   | All succeed     |
| EMB-003 | Long text chunking | Multiple chunks |
| EMB-004 | Similarity search  | Top-K results   |
| EMB-005 | Index performance  | < 100ms         |
| EMB-006 | Empty input        | Error handling  |
| EMB-007 | Unicode text       | Proper encoding |
```

---

## 6. Workflows Package Testing

### 6.1 Workflow Definitions

#### Document Processing Workflow
```typescript
// Definition
workflow documentProcessingWorkflow(input: DocumentInput): DocumentOutput {
  // 1. Extract content
  const extracted = await extractContent(input.fileUrl);
  
  // 2. Generate embeddings
  const embeddings = await generateEmbeddings(extracted.text);
  
  // 3. Store in database
  await storeDocument({ ...extracted, embeddings });
  
  // 4. Index for search
  await indexDocument(extracted.id);
  
  return { documentId: extracted.id };
}

// Test Scenarios
| ID         | Scenario        | Expected            |
| ---------- | --------------- | ------------------- |
| WF-DOC-001 | PDF upload      | All steps complete  |
| WF-DOC-002 | Large file      | Chunked processing  |
| WF-DOC-003 | Invalid format  | Error at step 1     |
| WF-DOC-004 | Step 2 fails    | Retry 3x, then fail |
| WF-DOC-005 | Partial failure | Rollback            |
```

#### Research Workflow
```typescript
// Definition
workflow researchWorkflow(input: ResearchInput): ResearchOutput {
  // 1. Analyze query
  const analysis = await analyzeQuery(input.query);
  
  // 2. Gather sources
  const sources = await gatherSources(analysis.topics);
  
  // 3. Synthesize findings
  const synthesis = await synthesizeFindings(sources);
  
  // 4. Generate report
  const report = await generateReport(synthesis);
  
  return { report, sources };
}

// Test Scenarios
| ID         | Scenario         | Expected          |
| ---------- | ---------------- | ----------------- |
| WF-RES-001 | Simple query     | Full report       |
| WF-RES-002 | Complex query    | Multi-source      |
| WF-RES-003 | No sources found | Graceful handling |
| WF-RES-004 | API rate limit   | Backoff & retry   |
```

### 6.2 Activities

```typescript
// All Activities
const activities = {
  // Document activities
  extractContent: { timeout: 30s, retries: 3 },
  generateEmbeddings: { timeout: 60s, retries: 2 },
  storeDocument: { timeout: 10s, retries: 3 },
  indexDocument: { timeout: 30s, retries: 2 },
  
  // Research activities
  analyzeQuery: { timeout: 15s, retries: 2 },
  gatherSources: { timeout: 120s, retries: 3 },
  synthesizeFindings: { timeout: 90s, retries: 2 },
  generateReport: { timeout: 60s, retries: 2 },
  
  // Task activities
  parseTaskInput: { timeout: 10s, retries: 2 },
  createTask: { timeout: 5s, retries: 3 },
  updateTask: { timeout: 5s, retries: 3 },
  notifyAssignee: { timeout: 10s, retries: 3 },
};

// Activity Test Scenarios
| ID      | Activity           | Scenario    | Expected         |
| ------- | ------------------ | ----------- | ---------------- |
| ACT-001 | extractContent     | Success     | Content returned |
| ACT-002 | extractContent     | Timeout     | Retry 3x         |
| ACT-003 | generateEmbeddings | Large text  | Chunked          |
| ACT-004 | gatherSources      | API down    | Backoff retry    |
| ACT-005 | createTask         | DB error    | Retry + rollback |
| ACT-006 | notifyAssignee     | Email fails | Log & continue   |
```

### 6.3 Temporal Worker & Client

```typescript
// Worker Configuration
{
  namespace: "nexus-production",
  taskQueue: "nexus-workflows",
  maxConcurrentActivities: 100,
  maxConcurrentWorkflows: 50,
  stickyScheduleToStartTimeout: 5s,
}

// Test Scenarios
| ID         | Test                  | Expected             |
| ---------- | --------------------- | -------------------- |
| WORKER-001 | Worker startup        | Connects to Temporal |
| WORKER-002 | Activity registration | All registered       |
| WORKER-003 | Workflow registration | All registered       |
| WORKER-004 | Graceful shutdown     | In-flight completes  |
| WORKER-005 | Connection lost       | Reconnect            |
| CLIENT-001 | Start workflow        | WorkflowId returned  |
| CLIENT-002 | Query workflow        | Status returned      |
| CLIENT-003 | Signal workflow       | Signal delivered     |
| CLIENT-004 | Cancel workflow       | Workflow cancelled   |
```

---

## 7. External Service Integrations

### 7.1 AI Providers

#### Google Gemini
```typescript
// Configuration
{
  model: "gemini-pro",
  maxTokens: 8192,
  temperature: 0.7,
  timeout: 60000,
}

// Test Scenarios
| ID         | Scenario        | Expected           |
| ---------- | --------------- | ------------------ |
| GEMINI-001 | Simple prompt   | Valid response     |
| GEMINI-002 | Streaming       | Chunks received    |
| GEMINI-003 | Long context    | Handles 30k tokens |
| GEMINI-004 | Rate limited    | 429 + retry        |
| GEMINI-005 | Invalid API key | 401 error          |
| GEMINI-006 | Timeout         | Fallback to Groq   |
| GEMINI-007 | Safety filter   | Content filtered   |
```

#### OpenAI
```typescript
// Configuration
{
  model: "gpt-4-turbo",
  maxTokens: 4096,
  temperature: 0.7,
}

// Test Scenarios
| ID         | Scenario         | Expected        |
| ---------- | ---------------- | --------------- |
| OPENAI-001 | Chat completion  | Valid response  |
| OPENAI-002 | Function calling | Tool calls      |
| OPENAI-003 | Vision (GPT-4V)  | Image analysis  |
| OPENAI-004 | Embeddings       | Vector returned |
| OPENAI-005 | Rate limited     | Backoff + retry |
```

#### Groq (Fallback)
```typescript
// Configuration
{
  model: "llama-3.1-70b-versatile",
  maxTokens: 4096,
  timeout: 30000,
}

// Test Scenarios
| ID       | Scenario         | Expected            |
| -------- | ---------------- | ------------------- |
| GROQ-001 | Fallback trigger | Gemini fails → Groq |
| GROQ-002 | Fast inference   | < 5s response       |
| GROQ-003 | Streaming        | Chunks received     |
```

### 7.2 Search Services

#### Tavily (Web Search)
```typescript
// Configuration
{
  apiKey: process.env.TAVILY_API_KEY,
  searchDepth: "advanced",
  maxResults: 10,
}

// Test Scenarios
| ID         | Scenario      | Expected          |
| ---------- | ------------- | ----------------- |
| TAVILY-001 | Basic search  | Results array     |
| TAVILY-002 | News search   | Recent articles   |
| TAVILY-003 | No results    | Empty array       |
| TAVILY-004 | Rate limited  | Handle gracefully |
| TAVILY-005 | Invalid query | Validation error  |
```

### 7.3 Observability

#### OpenTelemetry + Jaeger
```typescript
// Configuration
{
  serviceName: "nexus-backend",
  samplingRatio: 0.1,
  exporterEndpoint: "http://jaeger:4318",
}

// Test Scenarios
| ID       | Scenario          | Expected              |
| -------- | ----------------- | --------------------- |
| OTEL-001 | Span creation     | Trace ID generated    |
| OTEL-002 | Nested spans      | Parent-child relation |
| OTEL-003 | Custom attributes | Attached to span      |
| OTEL-004 | Error recording   | Error spans           |
| OTEL-005 | Export to Jaeger  | Traces visible        |
```

#### Langfuse (LLM Observability)
```typescript
// Configuration
{
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
}

// Test Scenarios
| ID           | Scenario         | Expected           |
| ------------ | ---------------- | ------------------ |
| LANGFUSE-001 | Trace creation   | Trace in dashboard |
| LANGFUSE-002 | Token counting   | Accurate count     |
| LANGFUSE-003 | Latency tracking | Recorded           |
| LANGFUSE-004 | Cost calculation | Per-model cost     |
```

### 7.4 Temporal.io

```typescript
// Configuration
{
  address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  namespace: "nexus-production",
  tls: {
    clientCertPath: "/certs/client.pem",
    clientKeyPath: "/certs/client.key",
  },
}

// Test Scenarios
| ID           | Scenario              | Expected            |
| ------------ | --------------------- | ------------------- |
| TEMPORAL-001 | Connection            | Connected           |
| TEMPORAL-002 | Workflow start        | WorkflowId returned |
| TEMPORAL-003 | Activity execution    | Completed           |
| TEMPORAL-004 | Signal handling       | Signal processed    |
| TEMPORAL-005 | Workflow query        | State returned      |
| TEMPORAL-006 | Retry policy          | Retries on failure  |
| TEMPORAL-007 | Timeout handling      | Activity times out  |
| TEMPORAL-008 | Workflow cancellation | Clean cancellation  |
```

---

## 8. Security & Authentication Testing

### 8.1 Authentication (BetterAuth)

```typescript
// Supported Methods
- Credentials (email/password)
- OAuth (Google, GitHub)
- Magic Link (email)

// Session Configuration
{
  maxAge: 30 * 24 * 60 * 60,  // 30 days
  updateAge: 24 * 60 * 60,    // 1 day
  secure: true,
  httpOnly: true,
  sameSite: "lax",
}

// Test Scenarios
| ID           | Scenario                  | Expected             |
| ------------ | ------------------------- | -------------------- |
| SEC-AUTH-001 | Valid login               | Session created      |
| SEC-AUTH-002 | Invalid password          | 401 + attempt logged |
| SEC-AUTH-003 | Brute force (5+ attempts) | Account locked       |
| SEC-AUTH-004 | Session expiry            | 401 + redirect       |
| SEC-AUTH-005 | Session refresh           | New token            |
| SEC-AUTH-006 | Logout                    | Session invalidated  |
| SEC-AUTH-007 | Multi-device login        | All sessions listed  |
| SEC-AUTH-008 | Force logout all          | All sessions ended   |
| SEC-AUTH-009 | OAuth flow                | Tokens exchanged     |
| SEC-AUTH-010 | Magic link                | Valid for 15 min     |
```

### 8.2 Authorization

```typescript
// Role-Based Access Control
{
  owner: ["*"],                              // All permissions
  admin: ["read", "write", "delete", "invite"],
  member: ["read", "write"],
  guest: ["read"],
}

// Resource-Based Permissions
{
  document: ["view", "edit", "delete", "share"],
  task: ["view", "edit", "delete", "assign"],
  agent: ["execute", "configure"],
  workflow: ["start", "cancel", "view"],
}

// Test Scenarios
| ID            | Scenario        | Expected           |
| ------------- | --------------- | ------------------ |
| SEC-AUTHZ-001 | Owner access    | Full permissions   |
| SEC-AUTHZ-002 | Member read     | Allowed            |
| SEC-AUTHZ-003 | Member delete   | 403 forbidden      |
| SEC-AUTHZ-004 | Guest write     | 403 forbidden      |
| SEC-AUTHZ-005 | Cross-workspace | 403 forbidden      |
| SEC-AUTHZ-006 | Share document  | Permission granted |
| SEC-AUTHZ-007 | Revoke access   | Permission removed |
```

### 8.3 Input Validation & Sanitization

```typescript
// Validation Rules
const validationRules = {
  email: z.string().email().max(255),
  password: z.string().min(8).max(100).regex(/[A-Z]/).regex(/[0-9]/),
  title: z.string().min(1).max(500).trim(),
  content: z.string().max(1_000_000),
  id: z.string().uuid(),
};

// Test Scenarios
| ID          | Attack Type       | Input                           | Expected         |
| ----------- | ----------------- | ------------------------------- | ---------------- |
| SEC-VAL-001 | SQL Injection     | `'; DROP TABLE users;--`        | Escaped/rejected |
| SEC-VAL-002 | XSS               | `<script>alert('xss')</script>` | Sanitized        |
| SEC-VAL-003 | Path Traversal    | `../../etc/passwd`              | Rejected         |
| SEC-VAL-004 | Command Injection | `; rm -rf /`                    | Rejected         |
| SEC-VAL-005 | NoSQL Injection   | `{"$gt": ""}`                   | Rejected         |
| SEC-VAL-006 | SSRF              | `http://localhost:22`           | Blocked          |
| SEC-VAL-007 | XML Injection     | `<!DOCTYPE foo [...]>`          | Rejected         |
| SEC-VAL-008 | Buffer overflow   | 10MB string                     | Rejected         |
| SEC-VAL-009 | Unicode abuse     | Homoglyph attack                | Normalized       |
| SEC-VAL-010 | Null bytes        | `file%00.txt`                   | Stripped         |
```

### 8.4 Rate Limiting

```typescript
// Rate Limit Configuration
{
  api: {
    authenticated: { requests: 1000, window: "1m" },
    unauthenticated: { requests: 100, window: "1m" },
  },
  auth: {
    login: { requests: 5, window: "15m" },
    signup: { requests: 3, window: "1h" },
    passwordReset: { requests: 3, window: "1h" },
  },
  agents: {
    execute: { requests: 50, window: "1h" },
    embeddings: { requests: 100, window: "1m" },
  },
}

// Test Scenarios
| ID           | Scenario           | Expected               |
| ------------ | ------------------ | ---------------------- |
| SEC-RATE-001 | Under limit        | Request allowed        |
| SEC-RATE-002 | At limit           | Request allowed        |
| SEC-RATE-003 | Over limit         | 429 + Retry-After      |
| SEC-RATE-004 | Window reset       | Requests allowed again |
| SEC-RATE-005 | Different users    | Separate limits        |
| SEC-RATE-006 | Distributed attack | IP-based blocking      |
```

### 8.5 API Security

```typescript
// Security Headers
{
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Content-Security-Policy": "default-src 'self'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
}

// Test Scenarios
| ID          | Scenario            | Expected             |
| ----------- | ------------------- | -------------------- |
| SEC-API-001 | HTTPS redirect      | 301 to HTTPS         |
| SEC-API-002 | Security headers    | All present          |
| SEC-API-003 | CORS preflight      | Correct origins      |
| SEC-API-004 | Invalid origin      | Request blocked      |
| SEC-API-005 | JWT validation      | Signature verified   |
| SEC-API-006 | Expired token       | 401 + refresh prompt |
| SEC-API-007 | Tampered token      | 401 error            |
| SEC-API-008 | Missing auth header | 401 error            |
```

---

## 9. Performance Testing Requirements

### 9.1 Load Testing Targets

| Metric                | Target  | Max Acceptable |
| --------------------- | ------- | -------------- |
| Concurrent Users      | 1,000   | 5,000          |
| Requests/Second       | 500     | 2,000          |
| API Latency (p50)     | < 50ms  | < 100ms        |
| API Latency (p99)     | < 200ms | < 500ms        |
| Database Query (p99)  | < 50ms  | < 100ms        |
| Agent Response Time   | < 10s   | < 30s          |
| WebSocket Connections | 500     | 2,000          |
| Memory Usage          | < 2GB   | < 4GB          |
| CPU Usage             | < 50%   | < 80%          |

### 9.2 Test Scenarios

#### API Load Tests
```yaml
# k6 Test Configuration
scenarios:
  smoke:
    executor: 'constant-vus'
    vus: 10
    duration: '1m'
    
  load:
    executor: 'ramping-vus'
    startVUs: 0
    stages:
      - { duration: '2m', target: 100 }
      - { duration: '5m', target: 100 }
      - { duration: '2m', target: 0 }
      
  stress:
    executor: 'ramping-vus'
    startVUs: 0
    stages:
      - { duration: '2m', target: 200 }
      - { duration: '5m', target: 500 }
      - { duration: '2m', target: 1000 }
      - { duration: '5m', target: 1000 }
      - { duration: '5m', target: 0 }
      
  spike:
    executor: 'ramping-vus'
    startVUs: 0
    stages:
      - { duration: '10s', target: 1000 }
      - { duration: '1m', target: 1000 }
      - { duration: '10s', target: 0 }
```

#### Database Performance Tests
| ID          | Test                         | Target      |
| ----------- | ---------------------------- | ----------- |
| PERF-DB-001 | 1000 concurrent reads        | < 100ms avg |
| PERF-DB-002 | 100 concurrent writes        | < 50ms avg  |
| PERF-DB-003 | Vector search (1M rows)      | < 200ms     |
| PERF-DB-004 | Full-text search (100k docs) | < 100ms     |
| PERF-DB-005 | Complex join (5 tables)      | < 150ms     |
| PERF-DB-006 | Bulk insert (1000 rows)      | < 1s        |

#### WebSocket Performance Tests
| ID          | Test                            | Target        |
| ----------- | ------------------------------- | ------------- |
| PERF-WS-001 | 500 concurrent connections      | Stable        |
| PERF-WS-002 | Message broadcast (500 clients) | < 100ms       |
| PERF-WS-003 | Reconnection handling           | < 5s recovery |
| PERF-WS-004 | Memory per connection           | < 2MB         |

### 9.3 Benchmarks

```typescript
// Expected Benchmarks
const benchmarks = {
  // API Endpoints
  "GET /api/documents": { p50: "30ms", p99: "100ms" },
  "POST /api/documents": { p50: "50ms", p99: "150ms" },
  "POST /api/search": { p50: "100ms", p99: "300ms" },
  "POST /api/agents/execute": { p50: "5s", p99: "20s" },
  
  // Database Queries
  "SELECT with index": { p50: "2ms", p99: "10ms" },
  "SELECT with JOIN": { p50: "10ms", p99: "50ms" },
  "INSERT single": { p50: "5ms", p99: "20ms" },
  "Vector similarity": { p50: "50ms", p99: "150ms" },
  
  // External Services
  "Gemini API": { p50: "2s", p99: "10s" },
  "Tavily Search": { p50: "500ms", p99: "2s" },
  "Temporal Workflow Start": { p50: "100ms", p99: "500ms" },
};
```

---

## 10. Current Test Coverage Analysis

### 10.1 Existing Test Files

| File                  | Type        | Coverage | Status                |
| --------------------- | ----------- | -------- | --------------------- |
| agents.test.ts        | Unit        | 60%      | Needs expansion       |
| api-routes.test.ts    | Integration | 40%      | Needs expansion       |
| auth.test.ts          | Unit        | 75%      | Good                  |
| chat.test.ts          | Unit        | 50%      | Needs expansion       |
| collaboration.test.ts | Integration | 30%      | Needs expansion       |
| database.test.ts      | Integration | 70%      | Good                  |
| docs.test.ts          | Unit        | 55%      | Needs expansion       |
| edge-cases.test.ts    | Unit        | 40%      | Needs expansion       |
| integration.test.ts   | Integration | 35%      | Needs expansion       |
| negative.test.ts      | Unit        | 45%      | Needs expansion       |
| performance.test.ts   | Performance | 20%      | Needs major expansion |
| search.test.ts        | Unit        | 50%      | Needs expansion       |
| security.test.ts      | Security    | 60%      | Good                  |
| settings.test.ts      | Unit        | 70%      | Good                  |
| tasks.test.ts         | Unit        | 65%      | Good                  |
| ui-components.test.ts | Unit        | 80%      | Good                  |
| workflows.test.ts     | Unit        | 45%      | Needs expansion       |

### 10.2 Coverage Gaps

```
❌ CRITICAL GAPS
├── Agent streaming responses - Not tested
├── HITL approval flows - Minimal coverage
├── Workflow error recovery - Not tested
├── Vector search accuracy - Not tested
├── WebSocket reconnection - Not tested
├── Rate limiting enforcement - Partial
└── Concurrent edit conflicts - Not tested

⚠️ MODERATE GAPS
├── API pagination edge cases
├── Bulk operations
├── File upload processing
├── OAuth token refresh
├── Temporal signal handling
└── Cross-workspace security

✅ WELL COVERED
├── Basic CRUD operations
├── Authentication flows
├── Input validation
├── Settings management
└── UI components
```

### 10.3 Recommended Additions

```
Priority 1 (Critical)
├── agent-streaming.test.ts - Agent SSE/streaming
├── hitl-approval.test.ts - Human-in-the-loop
├── workflow-recovery.test.ts - Error recovery
└── vector-search.test.ts - Embedding accuracy

Priority 2 (High)
├── rate-limiting.test.ts - Comprehensive rate limit
├── concurrent-edit.test.ts - CRDT/conflict resolution
├── websocket.test.ts - Real-time features
└── bulk-operations.test.ts - Bulk CRUD

Priority 3 (Medium)
├── oauth.test.ts - OAuth flows
├── temporal.test.ts - Workflow signaling
├── cross-workspace.test.ts - Multi-tenant security
└── file-upload.test.ts - File processing
```

---

## 11. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
```
□ Set up test environment with Docker Compose
□ Configure Vitest for unit tests
□ Configure Playwright for E2E tests
□ Set up k6 for performance tests
□ Create test utilities and fixtures
□ Implement database seeding scripts
```

### Phase 2: Core API Tests (Week 3-4)
```
□ Documents API - All CRUD operations
□ Tasks API - All CRUD operations
□ Authentication - All flows
□ Authorization - Role-based tests
□ Input validation - Security tests
```

### Phase 3: Agent Tests (Week 5-6)
```
□ Supervisor agent routing
□ Specialized agent behaviors
□ Tool integration tests
□ HITL approval flows
□ Streaming response tests
□ Error handling & fallbacks
```

### Phase 4: Integration Tests (Week 7-8)
```
□ Workflow execution E2E
□ Database transaction tests
□ External service mocking
□ WebSocket collaboration
□ Search functionality
```

### Phase 5: Performance & Security (Week 9-10)
```
□ Load testing with k6
□ Database query benchmarks
□ API latency profiling
□ Security penetration tests
□ Rate limiting verification
```

### Phase 6: CI/CD Integration (Week 11-12)
```
□ GitHub Actions pipeline
□ Pre-merge test gates
□ Coverage reporting
□ Performance regression alerts
□ Security scanning automation
```

---

## 12. Test Environment Configuration

### 12.1 Docker Compose

```yaml
# docker-compose.test.yml
version: '3.8'

services:
  postgres-test:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: nexus_test
      POSTGRES_USER: test_user
      POSTGRES_PASSWORD: test_password
    ports:
      - "5433:5432"
    volumes:
      - postgres_test_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test_user -d nexus_test"]
      interval: 5s
      timeout: 5s
      retries: 5

  temporal-test:
    image: temporalio/auto-setup:1.22
    ports:
      - "7234:7233"
    environment:
      - DB=postgresql
      - DB_PORT=5432
      - POSTGRES_USER=test_user
      - POSTGRES_PWD=test_password
      - POSTGRES_SEEDS=postgres-test
    depends_on:
      postgres-test:
        condition: service_healthy

  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    command: redis-server --appendonly yes

  jaeger-test:
    image: jaegertracing/all-in-one:1.52
    ports:
      - "16687:16686"
      - "4318:4318"

volumes:
  postgres_test_data:
```

### 12.2 Environment Variables

```bash
# .env.test
NODE_ENV=test
DATABASE_URL=postgresql://test_user:test_password@localhost:5433/nexus_test
TEMPORAL_ADDRESS=localhost:7234
REDIS_URL=redis://localhost:6380

# API Keys (use test/mock values)
GEMINI_API_KEY=test_gemini_key
OPENAI_API_KEY=test_openai_key
TAVILY_API_KEY=test_tavily_key

# Auth
BETTER_AUTH_SECRET=test_auth_secret_32_chars_min
BETTER_AUTH_URL=http://localhost:3000

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
LANGFUSE_PUBLIC_KEY=test_public_key
LANGFUSE_SECRET_KEY=test_secret_key
```

### 12.3 Test Scripts

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --testPathPattern='.test.ts$'",
    "test:integration": "vitest run --testPathPattern='.integration.test.ts$'",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "test:performance": "k6 run tests/performance/load.js",
    "test:security": "npm-audit && snyk test",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:ci": "docker-compose -f docker-compose.test.yml up -d && npm run test:all && docker-compose -f docker-compose.test.yml down"
  }
}
```

---

## Appendix A: Test Case Summary

| Category       | Test Cases | Priority |
| -------------- | ---------- | -------- |
| Authentication | 25         | Critical |
| Authorization  | 20         | Critical |
| Documents API  | 40         | High     |
| Tasks API      | 35         | High     |
| Agents API     | 30         | High     |
| Search API     | 20         | Medium   |
| Workflows API  | 25         | Medium   |
| Collaboration  | 15         | Medium   |
| Database       | 30         | High     |
| Security       | 35         | Critical |
| Performance    | 25         | Medium   |
| **TOTAL**      | **300+**   | -        |

---

## Appendix B: Glossary

| Term       | Definition                                       |
| ---------- | ------------------------------------------------ |
| HITL       | Human-in-the-Loop - User approval for AI actions |
| CRDT       | Conflict-free Replicated Data Type               |
| pgvector   | PostgreSQL extension for vector similarity       |
| SSE        | Server-Sent Events for streaming                 |
| Temporal   | Durable execution platform                       |
| LangGraph  | Framework for multi-agent systems                |
| BetterAuth | Next.js authentication library                   |
| Drizzle    | TypeScript ORM for PostgreSQL                    |

---

**Document End**

*Bu döküman, Nexus backend test gereksinimlerinin kapsamlı bir referansıdır. Herhangi bir sorunuz için development ekibiyle iletişime geçin.*
