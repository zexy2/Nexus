import {
  createSchema,
  createTableSchema,
  definePermissions,
  type Row,
  type TableSchema,
  ANYONE_CAN,
  NOBODY_CAN,
} from "@rocicorp/zero";

// ==========================================
// TABLE SCHEMAS
// ==========================================

const userSchema = createTableSchema({
  tableName: "users",
  columns: {
    id: { type: "string" },
    email: { type: "string" },
    name: { type: "string" },
    avatarUrl: { type: "string" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
  },
  primaryKey: "id",
});

const workspaceSchema = createTableSchema({
  tableName: "workspaces",
  columns: {
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    ownerId: { type: "string" },
    iconUrl: { type: "string" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
  },
  primaryKey: "id",
  relationships: {
    owner: {
      sourceField: "ownerId",
      destSchema: () => userSchema,
      destField: "id",
    },
  },
});

const workspaceMemberSchema = createTableSchema({
  tableName: "workspace_members",
  columns: {
    id: { type: "string" },
    workspaceId: { type: "string" },
    userId: { type: "string" },
    role: { type: "string" }, // 'owner' | 'admin' | 'member'
    joinedAt: { type: "number" },
  },
  primaryKey: "id",
  relationships: {
    workspace: {
      sourceField: "workspaceId",
      destSchema: () => workspaceSchema,
      destField: "id",
    },
    user: {
      sourceField: "userId",
      destSchema: () => userSchema,
      destField: "id",
    },
  },
});

const docSchema = createTableSchema({
  tableName: "docs",
  columns: {
    id: { type: "string" },
    workspaceId: { type: "string" },
    parentId: { type: "string" },
    title: { type: "string" },
    content: { type: "json" }, // BlockNote JSON
    iconEmoji: { type: "string" },
    coverUrl: { type: "string" },
    isArchived: { type: "boolean" },
    createdBy: { type: "string" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
  },
  primaryKey: "id",
  relationships: {
    workspace: {
      sourceField: "workspaceId",
      destSchema: () => workspaceSchema,
      destField: "id",
    },
    parent: {
      sourceField: "parentId",
      destSchema: () => docSchema,
      destField: "id",
    },
    creator: {
      sourceField: "createdBy",
      destSchema: () => userSchema,
      destField: "id",
    },
  },
});

const taskSchema = createTableSchema({
  tableName: "tasks",
  columns: {
    id: { type: "string" },
    workspaceId: { type: "string" },
    docId: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    status: { type: "string" }, // 'todo' | 'in_progress' | 'done'
    priority: { type: "string" }, // 'low' | 'medium' | 'high' | 'urgent'
    assigneeId: { type: "string" },
    assigneeAgentType: { type: "string" }, // AI agent type
    dueDate: { type: "number" },
    completedAt: { type: "number" },
    position: { type: "number" },
    createdBy: { type: "string" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
  },
  primaryKey: "id",
  relationships: {
    workspace: {
      sourceField: "workspaceId",
      destSchema: () => workspaceSchema,
      destField: "id",
    },
    doc: {
      sourceField: "docId",
      destSchema: () => docSchema,
      destField: "id",
    },
    assignee: {
      sourceField: "assigneeId",
      destSchema: () => userSchema,
      destField: "id",
    },
    creator: {
      sourceField: "createdBy",
      destSchema: () => userSchema,
      destField: "id",
    },
  },
});

const agentExecutionSchema = createTableSchema({
  tableName: "agent_executions",
  columns: {
    id: { type: "string" },
    workspaceId: { type: "string" },
    agentType: { type: "string" }, // 'supervisor' | 'researcher' | 'writer' | 'coder' | 'project_manager'
    status: { type: "string" }, // 'pending' | 'running' | 'completed' | 'failed'
    input: { type: "json" },
    output: { type: "json" },
    errorMessage: { type: "string" },
    temporalWorkflowId: { type: "string" },
    startedAt: { type: "number" },
    completedAt: { type: "number" },
    createdAt: { type: "number" },
  },
  primaryKey: "id",
  relationships: {
    workspace: {
      sourceField: "workspaceId",
      destSchema: () => workspaceSchema,
      destField: "id",
    },
  },
});

const chatMessageSchema = createTableSchema({
  tableName: "chat_messages",
  columns: {
    id: { type: "string" },
    workspaceId: { type: "string" },
    executionId: { type: "string" },
    role: { type: "string" }, // 'user' | 'assistant' | 'system' | 'tool'
    content: { type: "string" },
    metadata: { type: "json" },
    createdAt: { type: "number" },
  },
  primaryKey: "id",
  relationships: {
    workspace: {
      sourceField: "workspaceId",
      destSchema: () => workspaceSchema,
      destField: "id",
    },
    execution: {
      sourceField: "executionId",
      destSchema: () => agentExecutionSchema,
      destField: "id",
    },
  },
});

// ==========================================
// SCHEMA DEFINITION
// ==========================================

export const schema = createSchema({
  version: 1,
  tables: {
    users: userSchema,
    workspaces: workspaceSchema,
    workspace_members: workspaceMemberSchema,
    docs: docSchema,
    tasks: taskSchema,
    agent_executions: agentExecutionSchema,
    chat_messages: chatMessageSchema,
  },
});

// ==========================================
// TYPES
// ==========================================

export type Schema = typeof schema;
export type User = Row<typeof userSchema>;
export type Workspace = Row<typeof workspaceSchema>;
export type WorkspaceMember = Row<typeof workspaceMemberSchema>;
export type Doc = Row<typeof docSchema>;
export type Task = Row<typeof taskSchema>;
export type AgentExecution = Row<typeof agentExecutionSchema>;
export type ChatMessage = Row<typeof chatMessageSchema>;

// Task status and priority types
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type AgentType = "supervisor" | "researcher" | "writer" | "coder" | "project_manager";
export type ExecutionStatus = "pending" | "running" | "completed" | "failed";
export type MessageRole = "user" | "assistant" | "system" | "tool";

// ==========================================
// PERMISSIONS
// ==========================================

type AuthData = {
  sub: string; // User ID
};

export const permissions = definePermissions<AuthData, Schema>(schema, () => {
  // For development, allow all operations
  // In production, implement proper row-level security
  return {
    users: {
      row: {
        select: ANYONE_CAN,
        insert: ANYONE_CAN,
        update: ANYONE_CAN,
        delete: NOBODY_CAN,
      },
    },
    workspaces: {
      row: {
        select: ANYONE_CAN,
        insert: ANYONE_CAN,
        update: ANYONE_CAN,
        delete: ANYONE_CAN,
      },
    },
    workspace_members: {
      row: {
        select: ANYONE_CAN,
        insert: ANYONE_CAN,
        update: ANYONE_CAN,
        delete: ANYONE_CAN,
      },
    },
    docs: {
      row: {
        select: ANYONE_CAN,
        insert: ANYONE_CAN,
        update: ANYONE_CAN,
        delete: ANYONE_CAN,
      },
    },
    tasks: {
      row: {
        select: ANYONE_CAN,
        insert: ANYONE_CAN,
        update: ANYONE_CAN,
        delete: ANYONE_CAN,
      },
    },
    agent_executions: {
      row: {
        select: ANYONE_CAN,
        insert: ANYONE_CAN,
        update: ANYONE_CAN,
        delete: NOBODY_CAN,
      },
    },
    chat_messages: {
      row: {
        select: ANYONE_CAN,
        insert: ANYONE_CAN,
        update: NOBODY_CAN,
        delete: NOBODY_CAN,
      },
    },
  };
});
