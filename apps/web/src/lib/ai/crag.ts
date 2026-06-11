/**
 * Corrective RAG (CRAG) Implementation
 * 
 * Self-correcting retrieval mechanism that evaluates document relevance
 * and refines search queries when results are not satisfactory.
 * 
 * Based on the paper "Corrective Retrieval Augmented Generation"
 * Reference: https://arxiv.org/abs/2401.15884
 */

import { searchWeb } from "./tavily";
import { searchWorkspaceContent } from "@/lib/workspace-search";

// Simple RAG document interface
interface RAGDocument {
  content: string;
  metadata?: {
    source?: string;
    docId?: string;
    similarity?: number;
  };
}

// Local search using the search API with semantic embeddings
async function searchSimilarDocuments(query: string, workspaceId?: string): Promise<RAGDocument[]> {
  if (!workspaceId) return [];

  try {
    const results = await searchWorkspaceContent(query, workspaceId, { limit: 5 });
    return results.map((r) => ({
      content: r.content || "",
      metadata: {
        source: r.title || "local",
        docId: r.id,
        similarity: r.score,
      }
    }));
  } catch (error) {
    console.error("[CRAG] Local search error:", error);
    return [];
  }
}

export interface CRAGResult {
  query: string;
  relevantDocuments: Array<{
    content: string;
    source: string;
    relevanceScore: number;
    isRelevant: boolean;
  }>;
  corrections: number;
  finalAnswer?: string;
  searchHistory: Array<{
    query: string;
    resultCount: number;
    relevantCount: number;
    action: "keep" | "refine" | "web_search";
  }>;
}

interface CRAGOptions {
  maxCorrections?: number;
  relevanceThreshold?: number;
  minRelevantDocs?: number;
  includeWebSearch?: boolean;
  useGeminiForEval?: boolean;
}

/**
 * Evaluate document relevance using LLM
 */
async function evaluateRelevance(
  query: string,
  document: string,
  useGemini: boolean = true
): Promise<{ isRelevant: boolean; score: number; reason: string }> {
  if (!useGemini || !process.env.GEMINI_API_KEY) {
    // Simple keyword matching fallback
    const queryWords = query.toLowerCase().split(/\s+/);
    const docLower = document.toLowerCase();
    const matchCount = queryWords.filter(word => docLower.includes(word)).length;
    const score = matchCount / queryWords.length;
    
    return {
      isRelevant: score > 0.3,
      score,
      reason: `Keyword match: ${matchCount}/${queryWords.length} words found`
    };
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `You are a relevance evaluator. Given a query and a document, determine if the document is relevant to answering the query.
            
Respond with ONLY a JSON object in this format:
{
  "isRelevant": true/false,
  "score": 0.0-1.0,
  "reason": "brief explanation"
}` }] },
        contents: [{ role: "user", parts: [{ text: `Query: ${query}\n\nDocument:\n${document.slice(0, 1000)}` }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 150,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    try {
      const result = JSON.parse(content);
      return {
        isRelevant: result.isRelevant ?? false,
        score: result.score ?? 0,
        reason: result.reason ?? "Unknown"
      };
    } catch {
      // Fallback to simple check
      const isRelevant = content.toLowerCase().includes("relevant") && !content.toLowerCase().includes("not relevant");
      return { isRelevant, score: isRelevant ? 0.7 : 0.3, reason: content };
    }
  } catch (error) {
    console.error("[CRAG] Relevance evaluation error:", error);
    return { isRelevant: true, score: 0.5, reason: "Evaluation failed, defaulting to relevant" };
  }
}

/**
 * Refine search query based on poor results
 */
async function refineQuery(
  originalQuery: string,
  poorResults: string[],
  attempt: number
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    // Simple query expansion
    const expansions = [
      `detailed ${originalQuery}`,
      `${originalQuery} explained`,
      `how to ${originalQuery}`,
      `${originalQuery} tutorial guide`
    ];
    return expansions[attempt % expansions.length];
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `You are a search query optimizer. The user's original query did not return relevant results.
            
Generate an improved, more specific search query. Return ONLY the new query, nothing else.` }] },
        contents: [{ role: "user", parts: [{ text: `Original query: "${originalQuery}"

The following results were not relevant:
${poorResults.slice(0, 3).map((r, i) => `${i + 1}. ${r.slice(0, 200)}...`).join("\n")}

Generate a better search query:` }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 50,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || originalQuery;
  } catch (error) {
    console.error("[CRAG] Query refinement error:", error);
    return `detailed ${originalQuery}`;
  }
}

/**
 * Corrective RAG - Main function
 * 
 * 1. Retrieve documents from local knowledge base
 * 2. Evaluate relevance of each document
 * 3. If documents are not relevant enough:
 *    a. Refine the query and search again
 *    b. Fall back to web search if local search fails
 * 4. Return the most relevant documents
 */
export async function correctiveRAG(
  query: string,
  workspaceId?: string,
  options: CRAGOptions = {}
): Promise<CRAGResult> {
  const {
    maxCorrections = 3,
    minRelevantDocs = 2,
    includeWebSearch = true,
    useGeminiForEval = true
  } = options;

  const result: CRAGResult = {
    query,
    relevantDocuments: [],
    corrections: 0,
    searchHistory: []
  };

  let currentQuery = query;
  let attempts = 0;

  console.log(`[CRAG] Starting corrective retrieval for: "${query}"`);

  while (attempts <= maxCorrections) {
    // Step 1: Search local documents
    console.log(`[CRAG] Attempt ${attempts + 1}: Searching with query: "${currentQuery}"`);
    
    const localDocs = await searchSimilarDocuments(currentQuery, workspaceId);
    
    // Step 2: Evaluate relevance of each document
    const evaluatedDocs: Array<{
      content: string;
      source: string;
      relevanceScore: number;
      isRelevant: boolean;
    }> = [];

    for (const doc of localDocs.slice(0, 5)) {
      const evaluation = await evaluateRelevance(currentQuery, doc.content, useGeminiForEval);
      evaluatedDocs.push({
        content: doc.content,
        source: doc.metadata?.source || "local",
        relevanceScore: evaluation.score,
        isRelevant: evaluation.isRelevant
      });
    }

    const relevantDocs = evaluatedDocs.filter(d => d.isRelevant);
    
    result.searchHistory.push({
      query: currentQuery,
      resultCount: evaluatedDocs.length,
      relevantCount: relevantDocs.length,
      action: relevantDocs.length >= minRelevantDocs ? "keep" : 
              attempts < maxCorrections ? "refine" : "web_search"
    });

    // Step 3: Check if we have enough relevant documents
    if (relevantDocs.length >= minRelevantDocs) {
      console.log(`[CRAG] Found ${relevantDocs.length} relevant documents`);
      result.relevantDocuments = evaluatedDocs;
      break;
    }

    if (evaluatedDocs.length === 0 && !includeWebSearch) {
      console.log("[CRAG] No local documents found; skipping query refinement");
      break;
    }

    // Step 4: Refine query or fall back to web search
    if (attempts < maxCorrections) {
      const irrelevantContent = evaluatedDocs
        .filter(d => !d.isRelevant)
        .map(d => d.content);
      
      currentQuery = await refineQuery(query, irrelevantContent, attempts);
      result.corrections++;
      attempts++;
      console.log(`[CRAG] Refined query to: "${currentQuery}"`);
    } else if (includeWebSearch) {
      // Fall back to web search
      console.log("[CRAG] Falling back to web search...");
      
      try {
        const webResults = await searchWeb(query, {
          maxResults: 5,
          includeAnswer: true
        });

        for (const webDoc of webResults.results) {
          const evaluation = await evaluateRelevance(query, webDoc.content, useGeminiForEval);
          result.relevantDocuments.push({
            content: webDoc.content,
            source: webDoc.url,
            relevanceScore: evaluation.score,
            isRelevant: evaluation.isRelevant
          });
        }

        if (webResults.answer) {
          result.finalAnswer = webResults.answer;
        }

        result.searchHistory.push({
          query,
          resultCount: webResults.results.length,
          relevantCount: result.relevantDocuments.filter(d => d.isRelevant).length,
          action: "web_search"
        });
      } catch (error) {
        console.error("[CRAG] Web search fallback failed:", error);
      }
      
      break;
    } else {
      result.relevantDocuments = evaluatedDocs;
      break;
    }
  }

  console.log(`[CRAG] Completed with ${result.corrections} corrections, ${result.relevantDocuments.length} documents`);
  
  return result;
}

/**
 * Generate answer using CRAG results
 */
export async function generateCRAGAnswer(
  query: string,
  cragResult: CRAGResult
): Promise<string> {
  const relevantDocs = cragResult.relevantDocuments.filter(d => d.isRelevant);
  
  if (relevantDocs.length === 0 && !cragResult.finalAnswer) {
    return "I couldn't find relevant information to answer your question. Please try rephrasing or provide more context.";
  }

  if (cragResult.finalAnswer) {
    return cragResult.finalAnswer;
  }

  if (!process.env.GEMINI_API_KEY) {
    return relevantDocs.map(d => d.content).join("\n\n---\n\n");
  }

  try {
    const context = relevantDocs
      .slice(0, 3)
      .map((d, i) => `[Source ${i + 1}: ${d.source}]\n${d.content}`)
      .join("\n\n");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `You are a helpful assistant. Answer the user's question based on the provided context. 
If the context doesn't fully answer the question, say so but provide what information you can.
Always cite your sources using [Source X] format.` }] },
        contents: [{ role: "user", parts: [{ text: `Context:\n${context}\n\nQuestion: ${query}` }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Unable to generate answer.";
  } catch (error) {
    console.error("[CRAG] Answer generation error:", error);
    return relevantDocs.map(d => d.content).join("\n\n---\n\n");
  }
}
