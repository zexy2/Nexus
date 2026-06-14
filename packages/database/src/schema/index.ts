import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  jsonb,
  integer,
  index,
  pgEnum,
  boolean,
  customType,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ==========================================
// CUSTOM TYPES (pgvector support)
// ==========================================

/**
 * pgvector vector type for Drizzle ORM
 * Stores embeddings as float arrays
 */
export const vector = customType<{
  data: number[];
  config: { dimensions: number };
  driverData: string;
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    // Parse "[0.1,0.2,...]" format
    const cleaned = value.replace(/[\[\]]/g, "");
    return cleaned.split(",").map(Number);
  },
});

// ==========================================
// ENUMS
// ==========================================

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "done",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const agentTypeEnum = pgEnum("agent_type", [
  "supervisor",
  "researcher",
  "writer",
  "coder",
  "project_manager",
]);

// ==========================================
// BETTER AUTH TABLES
// ==========================================

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ==========================================
// WORKSPACES (Çalışma Alanları)
// ==========================================

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  iconUrl: text("icon_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ==========================================
// WORKSPACE MEMBERS (Çoklu Kullanıcı Desteği)
// ==========================================

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("member"), // owner, admin, member
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("workspace_members_workspace_idx").on(table.workspaceId),
    index("workspace_members_user_idx").on(table.userId),
  ]
);

// ==========================================
// DOCS (Dökümanlar - BlockNote/ProseMirror JSON)
// ==========================================

export const docs = pgTable(
  "docs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"), // Hiyerarşik yapı için
    title: varchar("title", { length: 500 }).notNull().default("Untitled"),
    content: jsonb("content").$type<Record<string, unknown>>(), // BlockNote JSON formatı
    iconEmoji: varchar("icon_emoji", { length: 10 }),
    coverUrl: text("cover_url"),
    isArchived: integer("is_archived").notNull().default(0), // Boolean yerine integer (Zero Sync uyumluluğu)
    createdBy: text("created_by").references(() => users.id),
    // pgvector embedding for semantic search
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("docs_workspace_idx").on(table.workspaceId),
    index("docs_parent_idx").on(table.parentId),
    // Note: IVFFlat index should be created via SQL migration after data exists
    // CREATE INDEX docs_embedding_idx ON docs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  ]
);

// ==========================================
// TASKS (Görevler - Kanban)
// ==========================================

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    docId: uuid("doc_id").references(() => docs.id, { onDelete: "set null" }), // İlişkili döküman
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    assigneeId: text("assignee_id").references(() => users.id), // İnsan kullanıcı
    assigneeAgentType: agentTypeEnum("assignee_agent_type"), // AI Ajan atanabilir
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    position: integer("position").notNull().default(0), // Kanban sıralama
    isArchived: integer("is_archived").notNull().default(0),
    alignmentStatus: varchar("alignment_status", { length: 30 })
      .notNull()
      .default("orphaned"),
    alignmentUpdatedAt: timestamp("alignment_updated_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("tasks_workspace_idx").on(table.workspaceId),
    index("tasks_status_idx").on(table.status),
    index("tasks_assignee_idx").on(table.assigneeId),
    index("tasks_doc_idx").on(table.docId),
    index("tasks_archived_idx").on(table.isArchived),
  ]
);

// ==========================================
// LIVING PLANS (Immutable plan versions)
// ==========================================

export const planVersions = pgTable(
  "plan_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    docId: uuid("doc_id")
      .notNull()
      .references(() => docs.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    content: jsonb("content").$type<Record<string, unknown> | unknown[]>(),
    contentText: text("content_text").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("proposed"),
    baseVersionId: uuid("base_version_id"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("plan_versions_doc_version_idx").on(table.docId, table.versionNumber),
    index("plan_versions_workspace_idx").on(table.workspaceId),
    index("plan_versions_doc_idx").on(table.docId),
    index("plan_versions_status_idx").on(table.status),
  ]
);

export const requirements = pgTable(
  "requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    docId: uuid("doc_id")
      .notNull()
      .references(() => docs.id, { onDelete: "cascade" }),
    planVersionId: uuid("plan_version_id")
      .notNull()
      .references(() => planVersions.id, { onDelete: "cascade" }),
    stableKey: varchar("stable_key", { length: 40 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description").notNull(),
    acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>().notNull().default([]),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    changeType: varchar("change_type", { length: 30 }).notNull().default("added"),
    confidence: integer("confidence").notNull().default(100),
    previousRequirementId: uuid("previous_requirement_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("requirements_version_key_idx").on(table.planVersionId, table.stableKey),
    index("requirements_workspace_idx").on(table.workspaceId),
    index("requirements_doc_idx").on(table.docId),
    index("requirements_plan_version_idx").on(table.planVersionId),
    index("requirements_stable_key_idx").on(table.stableKey),
  ]
);

export const requirementTaskLinks = pgTable(
  "requirement_task_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("requirement_task_links_unique_idx").on(table.requirementId, table.taskId),
    index("requirement_task_links_workspace_idx").on(table.workspaceId),
    index("requirement_task_links_task_idx").on(table.taskId),
  ]
);

export const changeSets = pgTable(
  "change_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    docId: uuid("doc_id")
      .notNull()
      .references(() => docs.id, { onDelete: "cascade" }),
    baseVersionId: uuid("base_version_id").references(() => planVersions.id, {
      onDelete: "set null",
    }),
    proposedVersionId: uuid("proposed_version_id")
      .notNull()
      .references(() => planVersions.id, { onDelete: "cascade" }),
    temporalWorkflowId: varchar("temporal_workflow_id", { length: 255 }),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    summary: text("summary").notNull(),
    stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("change_sets_workspace_idx").on(table.workspaceId),
    index("change_sets_doc_idx").on(table.docId),
    index("change_sets_status_idx").on(table.status),
    index("change_sets_workflow_idx").on(table.temporalWorkflowId),
  ]
);

export const changeProposals = pgTable(
  "change_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    changeSetId: uuid("change_set_id")
      .notNull()
      .references(() => changeSets.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    requirementId: uuid("requirement_id").references(() => requirements.id, {
      onDelete: "set null",
    }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    action: varchar("action", { length: 40 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    priority: varchar("priority", { length: 20 }),
    rationale: text("rationale").notNull(),
    confidence: integer("confidence").notNull().default(100),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("change_proposals_change_set_idx").on(table.changeSetId),
    index("change_proposals_workspace_idx").on(table.workspaceId),
    index("change_proposals_task_idx").on(table.taskId),
    index("change_proposals_status_idx").on(table.status),
  ]
);

// ==========================================
// VECTORS (Embeddings - pgvector)
// ==========================================

// NOT: pgvector extension'ı PostgreSQL'de aktif olmalı
// CREATE EXTENSION IF NOT EXISTS vector;
// Kolonu eklemek için: ALTER TABLE vectors ADD COLUMN embedding vector(1536);

export const vectors = pgTable(
  "vectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceType: varchar("source_type", { length: 50 }).notNull(), // 'doc' | 'task'
    sourceId: uuid("source_id").notNull(),
    docId: uuid("doc_id"), // Document reference for semantic search
    workspaceId: uuid("workspace_id"), // Workspace scope
    content: text("content").notNull(), // Original text chunk
    // pgvector native column for semantic search
    embedding: vector("embedding", { dimensions: 1536 }),
    // Fallback JSON storage (deprecated - use embedding column)
    embeddingJson: jsonb("embedding_json").$type<number[]>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vectors_source_idx").on(table.sourceType, table.sourceId),
    index("vectors_workspace_idx").on(table.workspaceId),
    index("vectors_doc_idx").on(table.docId),
    // Note: IVFFlat index should be created via SQL migration after data exists
    // CREATE INDEX vectors_embedding_idx ON vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  ]
);

// ==========================================
// AGENT EXECUTIONS (Ajan Çalışma Kayıtları)
// ==========================================

export const agentExecutions = pgTable(
  "agent_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentType: agentTypeEnum("agent_type").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, running, completed, failed
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    errorMessage: text("error_message"),
    temporalWorkflowId: varchar("temporal_workflow_id", { length: 255 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agent_executions_workspace_idx").on(table.workspaceId),
    index("agent_executions_status_idx").on(table.status),
  ]
);

// ==========================================
// CHAT MESSAGES (Ajan Sohbet Geçmişi)
// ==========================================

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id").references(() => agentExecutions.id),
    role: varchar("role", { length: 50 }).notNull(), // 'user' | 'assistant' | 'system' | 'tool'
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chat_messages_workspace_idx").on(table.workspaceId),
    index("chat_messages_execution_idx").on(table.executionId),
  ]
);

// ==========================================
// RELATIONS
// ==========================================

export const usersRelations = relations(users, ({ many }) => ({
  ownedWorkspaces: many(workspaces),
  workspaceMemberships: many(workspaceMembers),
  assignedTasks: many(tasks),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id],
  }),
  members: many(workspaceMembers),
  docs: many(docs),
  tasks: many(tasks),
  agentExecutions: many(agentExecutions),
  chatMessages: many(chatMessages),
}));

export const workspaceMembersRelations = relations(
  workspaceMembers,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMembers.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [workspaceMembers.userId],
      references: [users.id],
    }),
  })
);

export const docsRelations = relations(docs, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [docs.workspaceId],
    references: [workspaces.id],
  }),
  parent: one(docs, {
    fields: [docs.parentId],
    references: [docs.id],
    relationName: "docHierarchy",
  }),
  children: many(docs, { relationName: "docHierarchy" }),
  creator: one(users, {
    fields: [docs.createdBy],
    references: [users.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [tasks.workspaceId],
    references: [workspaces.id],
  }),
  doc: one(docs, {
    fields: [tasks.docId],
    references: [docs.id],
  }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [tasks.createdBy],
    references: [users.id],
  }),
}));

export const planVersionsRelations = relations(planVersions, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [planVersions.workspaceId],
    references: [workspaces.id],
  }),
  doc: one(docs, {
    fields: [planVersions.docId],
    references: [docs.id],
  }),
  requirements: many(requirements),
  changeSets: many(changeSets),
}));

export const requirementsRelations = relations(requirements, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [requirements.workspaceId],
    references: [workspaces.id],
  }),
  doc: one(docs, {
    fields: [requirements.docId],
    references: [docs.id],
  }),
  planVersion: one(planVersions, {
    fields: [requirements.planVersionId],
    references: [planVersions.id],
  }),
  taskLinks: many(requirementTaskLinks),
  proposals: many(changeProposals),
}));

export const requirementTaskLinksRelations = relations(requirementTaskLinks, ({ one }) => ({
  requirement: one(requirements, {
    fields: [requirementTaskLinks.requirementId],
    references: [requirements.id],
  }),
  task: one(tasks, {
    fields: [requirementTaskLinks.taskId],
    references: [tasks.id],
  }),
}));

export const changeSetsRelations = relations(changeSets, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [changeSets.workspaceId],
    references: [workspaces.id],
  }),
  doc: one(docs, {
    fields: [changeSets.docId],
    references: [docs.id],
  }),
  proposedVersion: one(planVersions, {
    fields: [changeSets.proposedVersionId],
    references: [planVersions.id],
  }),
  proposals: many(changeProposals),
}));

export const changeProposalsRelations = relations(changeProposals, ({ one }) => ({
  changeSet: one(changeSets, {
    fields: [changeProposals.changeSetId],
    references: [changeSets.id],
  }),
  requirement: one(requirements, {
    fields: [changeProposals.requirementId],
    references: [requirements.id],
  }),
  task: one(tasks, {
    fields: [changeProposals.taskId],
    references: [tasks.id],
  }),
}));

export const agentExecutionsRelations = relations(
  agentExecutions,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [agentExecutions.workspaceId],
      references: [workspaces.id],
    }),
    messages: many(chatMessages),
  })
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [chatMessages.workspaceId],
    references: [workspaces.id],
  }),
  execution: one(agentExecutions, {
    fields: [chatMessages.executionId],
    references: [agentExecutions.id],
  }),
}));

// ==========================================
// RATE LIMIT BUCKETS (Production quota state)
// ==========================================

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 255 }).notNull(),
    bucket: varchar("bucket", { length: 100 }).notNull(),
    count: integer("count").notNull().default(0),
    limit: integer("limit").notNull(),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("rate_limit_buckets_key_bucket_idx").on(table.key, table.bucket),
    index("rate_limit_buckets_reset_idx").on(table.resetAt),
  ]
);

// ==========================================
// AUDIT LOGS (Production critical event trail)
// ==========================================

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    event: varchar("event", { length: 120 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("success"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    occurredOn: timestamp("occurred_on", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_user_idx").on(table.userId),
    index("audit_logs_workspace_idx").on(table.workspaceId),
    index("audit_logs_event_idx").on(table.event),
    index("audit_logs_occurred_on_idx").on(table.occurredOn),
  ]
);

// ==========================================
// WORKER HEARTBEATS (Production worker health)
// ==========================================

export const workerHeartbeats = pgTable(
  "worker_heartbeats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workerId: varchar("worker_id", { length: 120 }).notNull(),
    taskQueue: varchar("task_queue", { length: 120 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("healthy"),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("worker_heartbeats_worker_id_idx").on(table.workerId),
    index("worker_heartbeats_last_heartbeat_idx").on(table.lastHeartbeatAt),
  ]
);

// ==========================================
// USER SETTINGS (Kullanıcı Ayarları)
// ==========================================

export const userSettings = pgTable("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  
  // AI Settings
  // NOTE: BYOK (bring-your-own-key) is disabled in v1 — AI providers are managed
  // by server secrets. The per-user API-key columns were removed because they
  // stored plaintext keys and were never read by application code.
  defaultModel: varchar("default_model", { length: 50 }).notNull().default("gemini-2.5-flash"),
  autoSaveAiOutputs: boolean("auto_save_ai_outputs").notNull().default(true),
  
  // Notification Settings
  emailNotifications: boolean("email_notifications").notNull().default(true),
  agentNotifications: boolean("agent_notifications").notNull().default(true),
  taskReminders: boolean("task_reminders").notNull().default(true),
  
  // Appearance Settings
  theme: varchar("theme", { length: 20 }).notNull().default("system"), // light, dark, system
  compactMode: boolean("compact_mode").notNull().default(false),
  
  // Sync Settings
  offlineMode: boolean("offline_mode").notNull().default(true),
  syncFrequency: varchar("sync_frequency", { length: 20 }).notNull().default("realtime"), // realtime, 5min, 15min, manual
  
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id],
  }),
}));
