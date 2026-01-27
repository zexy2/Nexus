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
// USER SETTINGS (Kullanıcı Ayarları)
// ==========================================

export const userSettings = pgTable("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  
  // AI Settings
  defaultModel: varchar("default_model", { length: 50 }).notNull().default("gemini-2.5-flash"),
  geminiApiKey: text("gemini_api_key"), // Encrypted in production
  openaiApiKey: text("openai_api_key"), // Encrypted in production
  anthropicApiKey: text("anthropic_api_key"), // Encrypted in production
  groqApiKey: text("groq_api_key"), // Encrypted in production - for Llama models
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
