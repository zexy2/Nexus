import { z } from "zod";

/**
 * Input for document generation workflow
 */
export const DocumentGenerationInputSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  title: z.string(),
  prompt: z.string(),
  style: z.enum(["formal", "casual", "technical"]).optional(),
  maxLength: z.number().optional(),
});

export type DocumentGenerationInput = z.infer<typeof DocumentGenerationInputSchema>;

/**
 * Input for research workflow
 */
export const ResearchWorkflowInputSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  query: z.string(),
  sources: z.array(z.enum(["web", "documents", "both"])).optional(),
  depth: z.enum(["shallow", "medium", "deep"]).optional(),
});

export type ResearchWorkflowInput = z.infer<typeof ResearchWorkflowInputSchema>;

/**
 * Input for task breakdown workflow
 */
export const TaskBreakdownInputSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  docId: z.string().optional(),
  projectDescription: z.string(),
  deadline: z.number().optional(),
  teamSize: z.number().optional(),
});

export type TaskBreakdownInput = z.infer<typeof TaskBreakdownInputSchema>;

/**
 * Input for code generation workflow
 */
export const CodeGenerationInputSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  specification: z.string(),
  language: z.string(),
  framework: z.string().optional(),
  includeTests: z.boolean().optional(),
});

export type CodeGenerationInput = z.infer<typeof CodeGenerationInputSchema>;

export const PlanImpactInputSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  docId: z.string(),
});

export type PlanImpactInput = z.infer<typeof PlanImpactInputSchema>;

export type PlanChangeDecision = {
  decision: "approve" | "reject";
  selectedProposalIds?: string[];
  userId: string;
};

export interface PlanImpactOutput {
  changeSetId: string;
  docId: string;
  versionNumber: number;
  decision: "applied" | "rejected" | "expired";
  summary: string;
  stats: Record<string, number>;
  applied?: {
    applied: number;
    rejected: number;
    createdTaskIds: string[];
    externalOperationIds: string[];
    external: {
      succeeded: number;
      failed: number;
      status: "applied" | "partially_applied" | "external_failed";
    } | null;
  };
  steps: AgentStepResult[];
}

/**
 * Workflow execution status
 */
export type WorkflowStatus = 
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TERMINATED"
  | "CONTINUED_AS_NEW"
  | "TIMED_OUT";

/**
 * Workflow execution result
 */
export interface WorkflowResult<T = unknown> {
  workflowId: string;
  runId: string;
  status: WorkflowStatus;
  result?: T;
  error?: string;
}

/**
 * Agent step result for tracking
 */
export interface AgentStepResult {
  agentName: string;
  input: string;
  output: string;
  success: boolean;
  duration: number;
  tokensUsed?: number;
}

/**
 * Document generation output
 */
export interface DocumentGenerationOutput {
  documentId: string;
  title: string;
  content: string;
  steps: AgentStepResult[];
}

/**
 * Research workflow output
 */
export interface ResearchOutput {
  summary: string;
  sources: Array<{
    title: string;
    url?: string;
    snippet: string;
    relevance: number;
  }>;
  steps: AgentStepResult[];
}

/**
 * Task breakdown output
 */
export interface TaskBreakdownOutput {
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: "low" | "medium" | "high" | "urgent";
    estimatedHours: number;
    dependencies: string[];
  }>;
  steps: AgentStepResult[];
}

/**
 * Code generation output
 */
export interface CodeGenerationOutput {
  files: Array<{
    path: string;
    content: string;
    language: string;
  }>;
  explanation: string;
  steps: AgentStepResult[];
}
