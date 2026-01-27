import { z } from "zod";

/**
 * Configuration for creating an agent
 */
export interface AgentConfig {
  name: string;
  description: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: AgentTool[];
}

/**
 * Agent tool definition
 */
export interface AgentTool {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  execute: (params: any) => Promise<any>;
}

/**
 * Result from an agent execution
 */
export interface AgentResult {
  success: boolean;
  output: string;
  data?: any;
  error?: string;
  sources?: Array<{
    title: string;
    url?: string;
    credibility?: string;
    snippet?: string;
  }>;
  metadata?: {
    tokensUsed?: number;
    duration?: number;
    executionTime?: number;
    toolsCalled?: string[];
    model?: string;
    agentType?: string;
  };
}

/**
 * Context passed to agents during execution
 */
export interface AgentContext {
  workspaceId: string;
  userId: string;
  sessionId: string;
  documents?: DocumentReference[];
  tasks?: TaskReference[];
}

export interface DocumentReference {
  id: string;
  title: string;
  content?: string;
}

export interface TaskReference {
  id: string;
  title: string;
  status: string;
  priority: string;
}

/**
 * State for the supervisor graph
 */
export interface SupervisorStateType {
  messages: any[];
  currentAgent: string | null;
  agentResults: Record<string, AgentResult>;
  plan: string[];
  completed: string[];
  context: AgentContext;
  finalOutput?: string;
}

/**
 * Agent node type for LangGraph
 */
export type AgentNodeType = "supervisor" | "research" | "writer" | "coder" | "task" | "end";
