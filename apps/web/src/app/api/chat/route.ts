/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Chat API Route
 * 
 * Note: This file uses 'any' types for dynamic imports (LangGraph, AI SDK)
 * because the types are not available at compile time when using dynamic imports.
 * The AI SDK model types vary between providers and require runtime type checking.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, generateText } from "ai";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { workspaces, docs, tasks, userSettings } from "@nexus/database/schema";
import { eq, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { searchWeb } from "@/lib/tavily";
import { correctiveRAG } from "@/lib/crag";

// LangGraph imports (dynamically loaded to avoid build issues)
let createSupervisor: any = null;
let HumanMessage: any = null;

// Initialize LangGraph at runtime
async function initLangGraph() {
  if (createSupervisor) return true;
  try {
    const agents = await import("@nexus/agents");
    const messages = await import("@langchain/core/messages");
    createSupervisor = agents.createSupervisor;
    HumanMessage = messages.HumanMessage;
    console.log("✅ LangGraph initialized");
    return true;
  } catch (e) {
    console.log("⚠️ LangGraph not available, using fallback:", e);
    return false;
  }
}

// Allow streaming responses up to 60 seconds for agent operations
export const maxDuration = 60;

// Configure AI providers - Server defaults (fallback)
const gemini = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const serverOpenai = process.env.OPENAI_API_KEY 
  ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Get user's preferred model and API keys from settings
async function getUserModelConfig(userId: string): Promise<{
  model: any;
  modelName: string;
  provider: "gemini" | "openai" | "anthropic" | "groq";
}> {
  try {
    const settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    });
    
    const defaultModel = settings?.defaultModel || "gemini-2.5-flash";
    
    // Determine provider from model name
    let provider: "gemini" | "openai" | "anthropic" | "groq" = "gemini";
    if (defaultModel.startsWith("gpt")) provider = "openai";
    else if (defaultModel.startsWith("claude")) provider = "anthropic";
    else if (defaultModel.startsWith("llama")) provider = "groq";
    
    // Try to use user's API key first, then fallback to server key
    if (provider === "gemini") {
      const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
      if (apiKey) {
        const userGemini = createGoogleGenerativeAI({ apiKey });
        // Map model names to Gemini format
        const geminiModelMap: Record<string, string> = {
          "gemini-2.5-flash": "gemini-2.5-flash",
          "gemini-2.0-pro": "gemini-2.0-pro-exp",
        };
        const modelId = geminiModelMap[defaultModel] || "gemini-2.5-flash";
        return { 
          model: userGemini(modelId), 
          modelName: defaultModel,
          provider 
        };
      }
    }
    
    if (provider === "openai") {
      const apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY;
      if (apiKey) {
        const userOpenai = createOpenAI({ apiKey });
        return { 
          model: userOpenai(defaultModel), 
          modelName: defaultModel,
          provider 
        };
      }
    }
    
    if (provider === "anthropic") {
      const apiKey = settings?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        const userAnthropic = createAnthropic({ apiKey });
        // Map model names to Anthropic format
        const anthropicModelMap: Record<string, string> = {
          "claude-3-opus": "claude-3-opus-20240229",
          "claude-3-sonnet": "claude-3-5-sonnet-20241022",
          "claude-3-haiku": "claude-3-haiku-20240307",
        };
        const modelId = anthropicModelMap[defaultModel] || "claude-3-5-sonnet-20241022";
        return { 
          model: userAnthropic(modelId), 
          modelName: defaultModel,
          provider 
        };
      }
    }
    
    if (provider === "groq") {
      const apiKey = settings?.groqApiKey;
      if (apiKey) {
        // Groq uses OpenAI-compatible API
        const userGroq = createOpenAI({ 
          apiKey,
          baseURL: "https://api.groq.com/openai/v1",
        });
        // Map model names to Groq format
        const groqModelMap: Record<string, string> = {
          "llama-3.3-70b": "llama-3.3-70b-versatile",
          "llama-3.1-8b": "llama-3.1-8b-instant",
        };
        const modelId = groqModelMap[defaultModel] || "llama-3.3-70b-versatile";
        return { 
          model: userGroq(modelId), 
          modelName: defaultModel,
          provider 
        };
      }
    }
    
    // Fallback to Gemini (always available on server)
    return { 
      model: gemini("gemini-2.5-flash"), 
      modelName: "gemini-2.5-flash",
      provider: "gemini" 
    };
  } catch (error) {
    console.error("Error getting user model config:", error);
    return { 
      model: gemini("gemini-2.5-flash"), 
      modelName: "gemini-2.5-flash",
      provider: "gemini" 
    };
  }
}

// ==========================================
// RAG FUNCTIONS (Retrieval Augmented Generation)
// ==========================================

// Extract text from BlockNote JSON content
function extractTextFromContent(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  
  if (Array.isArray(content)) {
    return content.map(block => {
      if (block.content && Array.isArray(block.content)) {
        return block.content.map((c: any) => c.text || "").join(" ");
      }
      return "";
    }).join(" ");
  }
  
  return "";
}

// Simple text search scoring for RAG
function searchScore(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const words = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  if (words.length === 0) return 0;
  
  let score = 0;
  for (const word of words) {
    if (textLower.includes(word)) {
      score += 1;
    }
  }
  
  if (textLower.includes(queryLower)) {
    score += 2;
  }
  
  return score / words.length;
}

// Get RAG context from workspace documents - Uses CRAG (Corrective RAG)
async function getRAGContext(query: string, workspaceId: string): Promise<string> {
  const USE_CRAG = process.env.USE_CRAG !== "false"; // Default to true
  
  try {
    if (USE_CRAG) {
      // Use Corrective RAG for self-correcting retrieval
      console.log("[RAG] Using CRAG (Corrective RAG)...");
      
      const cragResult = await correctiveRAG(query, workspaceId, {
        maxCorrections: 2,
        relevanceThreshold: 0.4,
        minRelevantDocs: 1,
        includeWebSearch: false, // Don't use web in RAG, separate step
        useGeminiForEval: !!process.env.GEMINI_API_KEY,
      });
      
      if (cragResult.relevantDocuments.length === 0) {
        console.log("[RAG] CRAG found no relevant documents");
        return "";
      }
      
      let context = "\n\n### 📚 Relevant context from your workspace:\n\n";
      for (const doc of cragResult.relevantDocuments.slice(0, 3)) {
        context += `**${doc.source}** (relevance: ${Math.round(doc.relevanceScore * 100)}%)\n${doc.content.slice(0, 500)}\n\n`;
      }
      
      if (cragResult.corrections > 0) {
        console.log(`[RAG] CRAG made ${cragResult.corrections} corrections to improve results`);
      }
      
      return context;
    }
    
    // Fallback to simple RAG if CRAG is disabled
    // Get documents
    const documents = await db.query.docs.findMany({
      where: eq(docs.workspaceId, workspaceId),
      orderBy: [desc(docs.updatedAt)],
      limit: 20,
    });
    
    // Get tasks
    const taskList = await db.query.tasks.findMany({
      where: eq(tasks.workspaceId, workspaceId),
      orderBy: [desc(tasks.updatedAt)],
      limit: 20,
    });
    
    // Score and rank
    const results: { title: string; content: string; score: number; type: string }[] = [];
    
    for (const doc of documents) {
      const contentText = extractTextFromContent(doc.content);
      const fullText = `${doc.title} ${contentText}`;
      const score = searchScore(query, fullText);
      
      if (score > 0.3) {
        results.push({
          title: doc.title,
          content: contentText.slice(0, 500),
          score,
          type: "document"
        });
      }
    }
    
    for (const task of taskList) {
      const fullText = `${task.title} ${task.description || ""}`;
      const score = searchScore(query, fullText);
      
      if (score > 0.3) {
        results.push({
          title: task.title,
          content: task.description || "",
          score,
          type: "task"
        });
      }
    }
    
    // Get top 3 results
    const topResults = results
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    
    if (topResults.length === 0) return "";
    
    let context = "\n\n### 📚 Relevant context from your workspace:\n\n";
    for (const r of topResults) {
      context += `**${r.title}** (${r.type})\n${r.content}\n\n`;
    }
    
    return context;
  } catch (e) {
    console.error("RAG error:", e);
    return "";
  }
}

// ==========================================
// AGENT DEFINITIONS (Multi-Agent System)
// ==========================================

interface AgentResult {
  success: boolean;
  output: string;
  data?: any;
}

const AGENTS = {
  research: {
    name: "Araştırmacı",
    emoji: "🔍",
    description: "Expert at finding information, data analysis, and research",
    systemPrompt: `Sen Gemini 2.5 Pro tabanlı bir araştırma asistanısın.

GÖREVİN:
- Kullanıcının sorularına kapsamlı ve doğru yanıtlar ver
- Bilgileri açık ve anlaşılır şekilde sun
- Gerektiğinde örnekler ve açıklamalar ekle

YANIT STİLİ:
- Doğal, akıcı bir dil kullan (robot gibi değil, gerçek bir insan gibi yaz)
- Gereksiz emoji veya özel formatlama kullanma
- Markdown kullanabilirsin ama sade tut
- Doğrudan konuya gir, gereksiz girişler yapma
- Uzun listeler yerine açıklayıcı paragraflar tercih et

Türkçe yanıt ver. Samimi ama profesyonel ol.`,
  },
  writer: {
    name: "Yazar",
    emoji: "✍️",
    description: "Expert at creating documents, reports, and written content",
    systemPrompt: `Sen Gemini 2.5 Flash tabanlı bir içerik yazma asistanısın.

GÖREVİN:
- İyi yapılandırılmış, okunabilir içerikler oluştur
- Blog yazısı, makale, rapor, doküman yaz
- Net ve akıcı bir dil kullan

YANIT STİLİ:
- Doğal, insani bir dil kullan
- Markdown ile temiz formatlama yap (başlık, paragraf)
- Gereksiz emoji kullanma
- İçeriği mantıklı bölümlere ayır

Türkçe yanıt ver.`,
  },
  coder: {
    name: "Yazılımcı",
    emoji: "💻",
    description: "Expert at writing code, debugging, and technical tasks",
    systemPrompt: `Sen Gemini 2.5 Flash tabanlı bir yazılım geliştirme asistanısın.

GÖREVİN:
- Temiz, okunabilir ve çalışan kod yaz
- Hata ayıkla ve çözümler öner
- Teknik kavramları açıkla

YANIT STİLİ:
- Kod bloklarını uygun syntax highlighting ile ver
- Kısa açıklamalar ekle (gereksiz detaya girme)
- Koda yorum satırları ekle
- Gereksiz emoji kullanma

TypeScript, JavaScript, Python, React, Node.js konularında uzmansın.
Açıklamaları Türkçe, kod İngilizce olabilir.`,
  },
  task: {
    name: "Görev Yöneticisi",
    emoji: "📋",
    description: "Expert at creating tasks, organizing workflows, and project planning",
    systemPrompt: `Sen Gemini 2.5 Flash tabanlı bir proje yönetim asistanısın.

GÖREVİN:
- Projeleri yönetilebilir görevlere böl
- Öncelik ve zaman tahminleri yap
- Net görev listeleri oluştur

YANIT STİLİ:
- Görevleri maddeler halinde listele
- Her görev için kısa açıklama ekle
- Öncelik belirt (yüksek/orta/düşük)
- Gereksiz emoji kullanma

Türkçe yanıt ver.`,
  },
};

type AgentType = keyof typeof AGENTS;

// ==========================================
// SUPERVISOR LOGIC
// ==========================================

const SUPERVISOR_PROMPT = `You are Nexus AI Supervisor, orchestrating a team of specialized AI agents.

Your team:
- 🔍 **research**: Finding information, data analysis
- ✍️ **writer**: Creating documents and content  
- 💻 **coder**: Writing code and technical tasks
- 📋 **task**: Project planning and task management

INSTRUCTIONS:
1. Analyze the user's request
2. Decide which agent(s) to use
3. If multiple agents needed, execute them in order
4. Synthesize results into a cohesive response

RESPONSE FORMAT:
First line MUST be a JSON array of agents to use: ["research", "writer"]
Or empty array if you can answer directly: []

Then provide your response.

EXAMPLES:
- "Write a blog post about AI" → ["research", "writer"]
- "Create a Python script" → ["coder"]  
- "What's the weather?" → [] (no agents, answer directly)
- "Research competitors and create a task list" → ["research", "task"]`;

// Helper to get/create workspace for user
async function getUserWorkspace(userId: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId)
  });
  if (workspace) return workspace.id;
  
  const [newWs] = await db.insert(workspaces).values({
    name: "My Workspace",
    ownerId: userId,
  }).returning();
  return newWs.id;
}

// Get current user
async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  let userId = session?.user?.id;
  
  if (!userId && process.env.NODE_ENV === 'development') {
    const u = await db.query.users.findFirst();
    if (u) userId = u.id;
  }
  
  return userId;
}

// Create document in database
async function createDocument(title: string, content: string) {
  const userId = await getCurrentUser();
  if (!userId) return { success: false, error: "Not authenticated" };

  const workspaceId = await getUserWorkspace(userId);
  
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
  const blockContent = paragraphs.map((text, index) => {
    const isHeading = /^#{1,3}\s/.test(text) || /^\*\*[^*]+\*\*$/.test(text.trim());
    const cleanText = text.replace(/^#{1,3}\s/, '').replace(/^\*\*|\*\*$/g, '');
    
    return {
      id: `block-${index + 1}`,
      type: isHeading ? "heading" : "paragraph",
      props: isHeading 
        ? { level: 2, textColor: "default", backgroundColor: "default", textAlignment: "left" }
        : { textColor: "default", backgroundColor: "default", textAlignment: "left" },
      content: [{ type: "text", text: cleanText.trim(), styles: {} }],
      children: []
    };
  });

  const [doc] = await db.insert(docs).values({
    workspaceId,
    title,
    content: blockContent as any,
    createdBy: userId
  }).returning();
  
  console.log("✅ Document saved:", doc.id);
  return { success: true, id: doc.id, title };
}

// Create task in database  
async function createTask(title: string, description: string, priority: string = "medium") {
  const userId = await getCurrentUser();
  if (!userId) return { success: false, error: "Not authenticated" };

  const workspaceId = await getUserWorkspace(userId);
  
  const [task] = await db.insert(tasks).values({
    workspaceId,
    title,
    description,
    status: "todo",
    priority: priority as any,
    assigneeId: userId,
    createdBy: userId
  }).returning();
  
  console.log("✅ Task created:", task.id);
  return { success: true, id: task.id, title };
}

// Execute a single agent
async function executeAgent(
  agentType: AgentType, 
  query: string, 
  context: string,
  model: any
): Promise<AgentResult> {
  const agent = AGENTS[agentType];
  console.log(`${agent.emoji} Running ${agent.name}...`);

  const { text } = await generateText({
    model,
    system: agent.systemPrompt,
    prompt: `${context ? `Context from previous agents:\n${context}\n\n` : ""}User request: ${query}`,
  });

  return {
    success: true,
    output: text,
  };
}

// ==========================================
// LANGGRAPH SUPERVISOR EXECUTION
// ==========================================

// LangGraph-based multi-agent execution
async function executeWithLangGraph(
  userMessage: string,
  ragContext: string,
  workspaceId: string,
  userId: string
): Promise<{ success: boolean; output: string; agentsUsed: string[] }> {
  try {
    // Initialize LangGraph if not already done
    const langGraphReady = await initLangGraph();
    if (!langGraphReady || !createSupervisor || !HumanMessage) {
      return {
        success: false,
        output: "LangGraph not available",
        agentsUsed: [],
      };
    }
    
    console.log("🧠 LangGraph Supervisor starting...");
    
    // Create the LangGraph supervisor with Gemini
    const supervisor = createSupervisor({
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: process.env.GEMINI_API_KEY,
    });
    
    // Prepare initial state
    const initialState = {
      messages: [new HumanMessage(userMessage)],
      currentAgent: null,
      agentResults: {},
      plan: [],
      completed: [],
      context: {
        workspaceId,
        userId,
        sessionId: `session-${Date.now()}`,
        ragContext,
      },
      finalOutput: undefined,
    };
    
    // Invoke the graph
    const result = await supervisor.invoke(initialState);
    
    const agentsUsed = result.completed || [];
    const output = result.finalOutput || 
      Object.values(result.agentResults || {})
        .map((r: any) => r.output)
        .join("\n\n") ||
      "No response generated.";
    
    console.log("✅ LangGraph completed. Agents used:", agentsUsed);
    
    return {
      success: true,
      output,
      agentsUsed,
    };
  } catch (error) {
    console.error("LangGraph error:", error);
    return {
      success: false,
      output: `Error with LangGraph: ${error}`,
      agentsUsed: [],
    };
  }
}

// ==========================================
// MAIN HANDLER (Multi-Agent Orchestration)
// ==========================================

export async function POST(req: Request) {
  const { messages, agentMode } = await req.json();
  const userMessage = messages[messages.length - 1].content;
  const userMessageLower = userMessage.toLowerCase();
  console.log("📨 Chat:", userMessage.substring(0, 100));
  console.log("🤖 Agent mode:", agentMode || "auto");

  // Get current user for personalized model selection
  const userId = await getCurrentUser();
  
  // Get user's preferred model and API keys
  const { model, modelName, provider } = userId 
    ? await getUserModelConfig(userId)
    : { model: gemini("gemini-2.5-flash"), modelName: "gemini-2.5-flash", provider: "gemini" as const };
  
  console.log(`🎯 Using model: ${modelName} (${provider})`);
  console.log(`   User has own API key: ${provider !== "gemini" ? "Yes" : "No (using server fallback)"}`);
  

  // ==========================================
  // EXPLICIT SAVE DETECTION
  // ==========================================
  const saveKeywords = ['kaydet', 'save it', 'save this', 'bunu kaydet', 'çalışmayı kaydet', 'calismayı kaydet'];
  const wantsSave = saveKeywords.some(k => userMessageLower.includes(k));

  if (wantsSave) {
    console.log("💾 Save intent detected");
    
    const conversationHistory = messages
      .map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    
    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
    const lastAssistantContent = assistantMessages.length > 0 
      ? assistantMessages[assistantMessages.length - 1].content 
      : '';

    const { text: docJson } = await generateText({
      model,
      prompt: `Extract the content to save as a document from this conversation.

CONVERSATION:
${conversationHistory}

Create a JSON response with title and content. Content should include the main information from the assistant's responses.
Respond ONLY with JSON: {"title": "...", "content": "..."}`,
    });

    try {
      const match = docJson.match(/\{[\s\S]*\}/);
      if (match) {
        const { title, content } = JSON.parse(match[0]);
        if (title && content) {
          const result = await createDocument(title, content);
          if (result.success) {
            return new Response(`✅ **Document Saved!**\n\n📄 **${result.title}**\n\nYou can find it in the Documents section.`);
          }
        }
      }
    } catch (e) {
      console.error("Save error:", e);
    }
    
    return new Response("❌ Could not save the document. Please try again.");
  }

  // ==========================================
  // MULTI-AGENT ORCHESTRATION
  // ==========================================
  
  // If specific agent mode selected, use that agent directly
  if (agentMode && agentMode !== "auto" && AGENTS[agentMode as AgentType]) {
    console.log(`🎯 Direct agent mode: ${agentMode}`);
    const agent = AGENTS[agentMode as AgentType];
    
    // Get RAG context for the specific agent too
    let agentRagContext = "";
    if (userId) {
      const workspaceId = await getUserWorkspace(userId);
      agentRagContext = await getRAGContext(userMessage, workspaceId);
      if (agentRagContext) {
        console.log("📚 RAG context found for agent");
      }
    }
    
    // Web search for research mode using Tavily
    let webContext = "";
    if (agentMode === "research") {
      console.log("🌐 Tavily web search for research mode...");
      try {
        const webResults = await searchWeb(userMessage, { maxResults: 5, includeAnswer: true });
        if (webResults.answer) {
          const sources = webResults.results
            .slice(0, 5)
            .map(r => `- [${r.title}](${r.url})`)
            .join("\n");
          webContext = `**Web Search Results (${new Date().toLocaleDateString()}):**\n${webResults.answer}\n\n**Sources:**\n${sources}`;
          console.log("✅ Tavily results found:", webResults.results.length);
        }
      } catch (e) {
        console.error("Tavily error:", e);
      }
    }
    
    const contextParts: string[] = [];
    if (agentRagContext) {
      contextParts.push(`📚 WORKSPACE BAĞLAMI:\n${agentRagContext}`);
    }
    if (webContext) {
      contextParts.push(`🌐 GÜNCEL WEB BİLGİSİ:\n${webContext}`);
    }
    
    const enhancedSystem = agent.systemPrompt + (contextParts.length > 0
      ? `\n\n---\n${contextParts.join("\n\n---\n")}`
      : "");
    
    const result = streamText({
      model,
      system: enhancedSystem,
      messages,
    });
    
    return result.toTextStreamResponse();
  }

  // Auto mode: Use LangGraph Supervisor for multi-agent orchestration
  console.log("🧠 LangGraph Supervisor starting...");
  
  // Get user context for the graph (reuse userId from above)
  let ragContext = "";
  let workspaceId = "";
  
  if (userId) {
    workspaceId = await getUserWorkspace(userId);
    ragContext = await getRAGContext(userMessage, workspaceId);
    if (ragContext) {
      console.log("📚 RAG context found");
    }
  }

  // Use LangGraph for multi-agent execution
  const USE_LANGGRAPH = process.env.USE_LANGGRAPH !== "false"; // Default to true
  
  if (USE_LANGGRAPH && userId) {
    const langGraphResult = await executeWithLangGraph(
      userMessage + (ragContext ? `\n\nWorkspace Context:\n${ragContext}` : ""),
      ragContext,
      workspaceId,
      userId
    );
    
    if (langGraphResult.success) {
      let finalResponse = langGraphResult.output;
      
      // Check if we should create a document or task
      const taskKeywords = ['task', 'görev', 'yapılacak', 'todo', 'plan'];
      const docKeywords = ['document', 'doküman', 'belge', 'rapor', 'report', 'write', 'yaz'];
      
      const shouldCreateTask = langGraphResult.agentsUsed.includes("task") && 
        taskKeywords.some(k => userMessageLower.includes(k));
      const shouldCreateDoc = langGraphResult.agentsUsed.includes("writer") && 
        docKeywords.some(k => userMessageLower.includes(k));

      // Auto-save if task agent was used
      if (shouldCreateTask) {
        const taskLines = finalResponse.split('\n').filter(line => 
          line.match(/^[-*•]\s/) || line.match(/^\d+\.\s/)
        );
        
        if (taskLines.length > 0) {
          finalResponse += `\n\n✅ **Tasks Created:**\n`;
          for (const line of taskLines.slice(0, 5)) {
            const title = line.replace(/^[-*•\d.]\s*/, '').trim();
            if (title.length > 3) {
              const result = await createTask(title, "", "medium");
              if (result.success) {
                finalResponse += `- ${title}\n`;
              }
            }
          }
          finalResponse += `\nView them in the Tasks section.`;
        }
      }

      // Auto-save document if writer was used
      if (shouldCreateDoc) {
        const titleMatch = finalResponse.match(/^#\s*(.+)$/m) || finalResponse.match(/^\*\*(.+)\*\*$/m);
        const title = titleMatch ? titleMatch[1] : `Document: ${userMessage.substring(0, 50)}`;
        
        const result = await createDocument(title, finalResponse);
        if (result.success) {
          finalResponse += `\n\n📄 **Document saved:** ${result.title}\n\nView it in the Documents section.`;
        }
      }

      return new Response(finalResponse);
    }
  }
  
  // Fallback: Manual supervisor logic if LangGraph fails or is disabled
  console.log("🔄 Fallback to manual supervisor...");
  
  const { text: planResponse } = await generateText({
    model,
    system: SUPERVISOR_PROMPT,
    prompt: userMessage,
  });

  // Extract agent plan from response
  let agentPlan: AgentType[] = [];
  const planMatch = planResponse.match(/\[([^\]]*)\]/);
  if (planMatch) {
    try {
      agentPlan = JSON.parse(`[${planMatch[1]}]`).filter(
        (a: string) => AGENTS[a as AgentType]
      );
    } catch {}
  }

  console.log("📋 Agent plan:", agentPlan);

  // If no agents needed, respond directly (simple queries)
  if (agentPlan.length === 0) {
    const systemWithRAG = `You are Nexus AI, a helpful, intelligent assistant. Be concise and informative.${ragContext ? `\n\nYou have access to the user's workspace context:${ragContext}` : ""}`;
    
    const result = streamText({
      model,
      system: systemWithRAG,
      messages,
    });
    return result.toTextStreamResponse();
  }

  // Execute agents in sequence with RAG context
  let context = ragContext;
  const agentOutputs: { agent: AgentType; output: string }[] = [];

  for (const agentType of agentPlan) {
    const result = await executeAgent(agentType, userMessage, context, model);
    agentOutputs.push({ agent: agentType, output: result.output });
    context += `\n\n[${AGENTS[agentType].name}]:\n${result.output}`;
  }

  // Check if we should create a document or task
  const taskKeywords = ['task', 'görev', 'yapılacak', 'todo', 'plan'];
  const docKeywords = ['document', 'doküman', 'belge', 'rapor', 'report', 'write', 'yaz'];
  
  const shouldCreateTask = agentPlan.includes("task") && taskKeywords.some(k => userMessageLower.includes(k));
  const shouldCreateDoc = agentPlan.includes("writer") && docKeywords.some(k => userMessageLower.includes(k));

  // Build final response - show agent output directly without heavy formatting
  let finalResponse = "";
  
  // If only one agent, show its output directly
  if (agentOutputs.length === 1) {
    finalResponse = agentOutputs[0].output;
  } else {
    // Multiple agents - show each with minimal formatting
    for (const { agent, output } of agentOutputs) {
      const agentInfo = AGENTS[agent];
      finalResponse += `### ${agentInfo.emoji} ${agentInfo.name}\n\n${output}\n\n`;
    }
  }

  // Auto-save if task agent was used and user wanted tasks
  if (shouldCreateTask && agentOutputs.find(a => a.agent === "task")) {
    const taskOutput = agentOutputs.find(a => a.agent === "task")?.output || "";
    
    // Extract tasks from output
    const taskLines = taskOutput.split('\n').filter(line => 
      line.match(/^[-*•]\s/) || line.match(/^\d+\.\s/)
    );
    
    if (taskLines.length > 0) {
      finalResponse += `\n✅ **Tasks Created:**\n`;
      for (const line of taskLines.slice(0, 5)) { // Max 5 tasks
        const title = line.replace(/^[-*•\d.]\s*/, '').trim();
        if (title.length > 3) {
          const result = await createTask(title, "", "medium");
          if (result.success) {
            finalResponse += `- ${title}\n`;
          }
        }
      }
      finalResponse += `\nView them in the Tasks section.`;
    }
  }

  // Auto-save document if writer was used for explicit document request
  if (shouldCreateDoc && agentOutputs.find(a => a.agent === "writer")) {
    const writerOutput = agentOutputs.find(a => a.agent === "writer")?.output || "";
    
    // Extract title from first heading or generate one
    const titleMatch = writerOutput.match(/^#\s*(.+)$/m) || writerOutput.match(/^\*\*(.+)\*\*$/m);
    const title = titleMatch ? titleMatch[1] : `Document: ${userMessage.substring(0, 50)}`;
    
    const result = await createDocument(title, writerOutput);
    if (result.success) {
      finalResponse += `\n📄 **Document saved:** ${result.title}\n\nView it in the Documents section.`;
    }
  }

  return new Response(finalResponse);
}
