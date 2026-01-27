/**
 * Nexus Agents Package
 * 
 * LangGraph-based multi-agent orchestration system with supervisor pattern.
 * Implements autonomous AI agents for document, task, research, and code generation.
 */

export { createSupervisor, SupervisorState, type AgentNode } from "./supervisor";
export { ChatGemini } from "./gemini";
export { createResearchAgent } from "./agents/research";
export { createWriterAgent } from "./agents/writer";
export { createCoderAgent } from "./agents/coder";
export { createTaskAgent } from "./agents/task";
export type { AgentConfig, AgentResult, AgentContext } from "./types";

// Human-in-the-Loop
export {
  HITLState,
  createApprovalRequest,
  requiresApproval,
  getRiskLevel,
  isRequestValid,
  hitlCheckpoint,
  hitlResume,
  type CriticalAction,
  type RiskLevel,
  type ApprovalRequest,
  type HITLStateType,
} from "./hitl";

// Tools
export {
  webSearchTool,
  vectorSearchTool,
  agentTools,
  searchTavily,
  searchVectors,
  type TavilySearchResult,
  type TavilySearchResponse,
  type VectorSearchResult,
} from "./tools";

// Embeddings & RAG
export {
  generateEmbedding,
  generateEmbeddings,
  chunkText,
  cosineSimilarity,
  vectorStore,
  indexDocument,
  semanticSearch,
  buildRAGContext,
  type DocumentChunk,
  type SearchResult,
  type EmbeddingInput,
  type EmbeddingResult,
} from "./embeddings";
