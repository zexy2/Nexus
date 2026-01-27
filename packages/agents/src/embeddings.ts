import { OpenAIEmbeddings } from "@langchain/openai";
import { z } from "zod";

// Embedding configuration
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

// Schema for embedding requests
export const EmbeddingInputSchema = z.object({
  text: z.string().min(1).max(8000),
  metadata: z.record(z.unknown()).optional(),
});

export const EmbeddingResultSchema = z.object({
  text: z.string(),
  embedding: z.array(z.number()),
  metadata: z.record(z.unknown()).optional(),
  model: z.string(),
  dimensions: z.number(),
});

export type EmbeddingInput = z.infer<typeof EmbeddingInputSchema>;
export type EmbeddingResult = z.infer<typeof EmbeddingResultSchema>;

// Document chunk for RAG
export interface DocumentChunk {
  id: string;
  docId: string;
  content: string;
  embedding?: number[];
  metadata: {
    title?: string;
    type: "document" | "task" | "message";
    position: number;
    charStart: number;
    charEnd: number;
  };
}

// Search result
export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
  distance: number;
}

// Create embeddings client
function createEmbeddings() {
  return new OpenAIEmbeddings({
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
  });
}

// Generate embedding for a single text
export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddings = createEmbeddings();
  const result = await embeddings.embedQuery(text);
  return result;
}

// Generate embeddings for multiple texts (batch)
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings = createEmbeddings();
  const results = await embeddings.embedDocuments(texts);
  return results;
}

// Chunk text for embedding (simple sentence-based chunking)
export function chunkText(
  text: string,
  options: {
    chunkSize?: number;
    chunkOverlap?: number;
    separator?: string;
  } = {}
): { content: string; charStart: number; charEnd: number }[] {
  const { 
    chunkSize = 500, 
    chunkOverlap = 50,
    separator = "\n\n"
  } = options;
  
  const chunks: { content: string; charStart: number; charEnd: number }[] = [];
  
  // Split by separator first
  const sections = text.split(separator);
  let currentChunk = "";
  let charStart = 0;
  let currentStart = 0;
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) continue;
    
    const sectionStart = text.indexOf(section, charStart);
    if (sectionStart === -1) continue;
    
    if (currentChunk.length + section.length > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        content: currentChunk.trim(),
        charStart: currentStart,
        charEnd: charStart - separator.length,
      });
      
      // Start new chunk with overlap
      const overlapText = currentChunk.slice(-chunkOverlap);
      currentChunk = overlapText + separator + section;
      currentStart = charStart - chunkOverlap;
    } else {
      if (currentChunk.length === 0) {
        currentStart = sectionStart;
      }
      currentChunk += (currentChunk.length > 0 ? separator : "") + section;
    }
    
    charStart = sectionStart + section.length + separator.length;
  }
  
  // Add remaining chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      charStart: currentStart,
      charEnd: text.length,
    });
  }
  
  return chunks;
}

// Calculate cosine similarity between two vectors
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// In-memory vector store for development (will be replaced with pgvector)
class InMemoryVectorStore {
  private vectors: Map<string, { embedding: number[]; chunk: DocumentChunk }> = new Map();
  
  async add(chunk: DocumentChunk, embedding: number[]): Promise<void> {
    this.vectors.set(chunk.id, { embedding, chunk });
  }
  
  async addMany(items: { chunk: DocumentChunk; embedding: number[] }[]): Promise<void> {
    for (const item of items) {
      await this.add(item.chunk, item.embedding);
    }
  }
  
  async search(
    queryEmbedding: number[],
    options: { limit?: number; threshold?: number } = {}
  ): Promise<SearchResult[]> {
    const { limit = 5, threshold = 0.5 } = options;
    
    const results: SearchResult[] = [];
    
    for (const [, { embedding, chunk }] of this.vectors) {
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      if (similarity >= threshold) {
        results.push({
          chunk,
          score: similarity,
          distance: 1 - similarity,
        });
      }
    }
    
    // Sort by score descending and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  
  async searchByDocId(docId: string): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    for (const [, { chunk }] of this.vectors) {
      if (chunk.docId === docId) {
        chunks.push(chunk);
      }
    }
    return chunks.sort((a, b) => a.metadata.position - b.metadata.position);
  }
  
  async delete(id: string): Promise<void> {
    this.vectors.delete(id);
  }
  
  async deleteByDocId(docId: string): Promise<void> {
    for (const [id, { chunk }] of this.vectors) {
      if (chunk.docId === docId) {
        this.vectors.delete(id);
      }
    }
  }
  
  get size(): number {
    return this.vectors.size;
  }
}

// Global vector store instance
export const vectorStore = new InMemoryVectorStore();

// Index a document for semantic search
export async function indexDocument(
  docId: string,
  content: string,
  metadata: { title?: string; type: "document" | "task" | "message" } = { type: "document" }
): Promise<DocumentChunk[]> {
  // Remove existing chunks for this document
  await vectorStore.deleteByDocId(docId);
  
  // Chunk the content
  const textChunks = chunkText(content);
  
  // Generate embeddings for all chunks
  const embeddings = await generateEmbeddings(textChunks.map(c => c.content));
  
  // Create document chunks with embeddings
  const chunks: DocumentChunk[] = [];
  const itemsToAdd: { chunk: DocumentChunk; embedding: number[] }[] = [];
  
  for (let i = 0; i < textChunks.length; i++) {
    const textChunk = textChunks[i];
    const embedding = embeddings[i];
    
    if (!textChunk || !embedding) continue;
    
    const chunk: DocumentChunk = {
      id: `${docId}-chunk-${i}`,
      docId,
      content: textChunk.content,
      embedding,
      metadata: {
        ...metadata,
        position: i,
        charStart: textChunk.charStart,
        charEnd: textChunk.charEnd,
      },
    };
    
    chunks.push(chunk);
    itemsToAdd.push({ chunk, embedding });
  }
  
  // Add to vector store
  await vectorStore.addMany(itemsToAdd);
  
  return chunks;
}

// Semantic search across all indexed documents
export async function semanticSearch(
  query: string,
  options: { limit?: number; threshold?: number; docIds?: string[] } = {}
): Promise<SearchResult[]> {
  const { limit = 5, threshold = 0.5, docIds } = options;
  
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  
  // Search vector store
  let results = await vectorStore.search(queryEmbedding, { limit: limit * 2, threshold });
  
  // Filter by docIds if provided
  if (docIds && docIds.length > 0) {
    results = results.filter(r => docIds.includes(r.chunk.docId));
  }
  
  return results.slice(0, limit);
}

// RAG context builder
export async function buildRAGContext(
  query: string,
  options: { maxTokens?: number; limit?: number } = {}
): Promise<string> {
  const { maxTokens = 2000, limit = 5 } = options;
  
  const results = await semanticSearch(query, { limit });
  
  if (results.length === 0) {
    return "";
  }
  
  // Build context string with relevance info
  let context = "### Relevant Context:\n\n";
  let totalTokens = 0;
  const avgTokensPerChar = 0.25; // rough estimate
  
  for (const result of results) {
    const chunkTokens = Math.ceil(result.chunk.content.length * avgTokensPerChar);
    if (totalTokens + chunkTokens > maxTokens) break;
    
    context += `**Source: ${result.chunk.metadata.title || "Document"} (relevance: ${(result.score * 100).toFixed(1)}%)**\n`;
    context += result.chunk.content + "\n\n";
    totalTokens += chunkTokens;
  }
  
  return context;
}
