/**
 * Nexus Workflows Package
 * 
 * Temporal.io-based durable workflow execution for long-running
 * AI agent tasks with automatic retry, persistence, and observability.
 */

export * from "./types";
export { createTemporalClient, getWorkflowStatus, startWorkflow } from "./client";

// Activities
export {
  callResearchAgent,
  callWriterAgent,
  callCoderAgent,
  callTaskAgent,
  saveDocument,
  saveTasks,
  sendNotification,
  searchDocuments,
  searchWeb,
  searchVectors,
  generateEmbedding,
  indexDocument,
  analyzePlanImpact,
  persistPlanImpact,
  applyPlanChangeSet,
  executeExternalWriteOperation,
  syncGitHubIntegrationAfterExternalWrite,
  listRunnableExternalWriteOperationIds,
  finalizeExternalWriteOperations,
  rejectPlanChangeSet,
  expirePlanChangeSet,
} from "./activities";
