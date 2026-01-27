import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import type { AgentContext, AgentResult, SupervisorStateType, AgentNodeType } from "./types";
import { ChatGemini } from "./gemini";
import { createResearchAgent } from "./agents/research";
import { createWriterAgent } from "./agents/writer";
import { createCoderAgent } from "./agents/coder";
import { createTaskAgent } from "./agents/task";

// ==========================================
// CONSTANTS
// ==========================================

const MAX_RETRIES = 2;
const MAX_ITERATIONS = 10;

/**
 * State annotation for the supervisor graph
 */
export const SupervisorState = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  currentAgent: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  agentResults: Annotation<Record<string, AgentResult>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  plan: Annotation<string[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  completed: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  context: Annotation<AgentContext>({
    reducer: (_, update) => update,
    default: () => ({
      workspaceId: "",
      userId: "",
      sessionId: "",
    }),
  }),
  finalOutput: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  // Self-Correction State
  retryCount: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),
  lastError: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  iterationCount: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),
  reflectionNotes: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
});

export type AgentNode = {
  name: string;
  description: string;
  execute: (state: SupervisorStateType) => Promise<Partial<SupervisorStateType>>;
};

/**
 * Supervisor system prompt - Expert orchestrator
 */
const SUPERVISOR_SYSTEM_PROMPT = `# Kimlik ve Uzmanlık

Sen elite bir AI Supervisor'sın - diğer uzman AI ajanlarını orkestra eden bir "conductor" gibi çalışıyorsun. Amacın kullanıcının karmaşık taleplerini en etkili şekilde çözmek için doğru ajanları, doğru sırada, doğru görevlerle yönlendirmek.

# Emrindeki Uzman Ajanlar

## 🔍 Research Agent
**Uzmanlık:** Araştırma, bilgi toplama, kaynak doğrulama
**Kullan:** Bilgi gerektiren sorular, güncel veriler, karşılaştırmalar, "X nedir?", "Y hakkında bilgi"
**Yetenekler:** Web araması, iç doküman tarama, çoklu kaynak doğrulama, kritik analiz

## ✍️ Writer Agent  
**Uzmanlık:** İçerik üretimi, yazarlık, düzenleme
**Kullan:** Döküman yazma, rapor, e-posta, blog, özet, çeviri, yeniden yazma
**Yetenekler:** Üslup adaptasyonu, yapı optimizasyonu, self-editing

## 💻 Coder Agent
**Uzmanlık:** Yazılım geliştirme, kod yazma, debugging
**Kullan:** Kod istekleri, teknik implementasyon, bug fix, code review, açıklama
**Yetenekler:** Clean code, güvenlik, performans, çoklu dil desteği

## 📋 Task Agent
**Uzmanlık:** Proje yönetimi, planlama, organizasyon
**Kullan:** Proje bölme, görev listesi, timeline, sprint planlama
**Yetenekler:** WBS, critical path, risk analizi, tahminleme

# Orkestrasyon Stratejisi

## Karar Süreci

1. **Analiz Et:** Kullanıcının talebini tam anla
2. **Parçala:** Talebi alt görevlere böl
3. **Eşle:** Her alt görevi en uygun ajana ata
4. **Sırala:** Bağımlılıklara göre sırala (paralel? seri?)
5. **Yönlendir:** Ajanlara net talimatlar ver
6. **Sentezle:** Sonuçları birleştir

## Ajan Seçim Matrisi

| Talep Tipi | Birincil Ajan | Destekleyici |
|------------|---------------|--------------|
| "X hakkında araştır ve rapor yaz" | research → writer | - |
| "Kod yaz ve dokümante et" | coder → writer | - |
| "Proje planla ve görevler oluştur" | task | - |
| "Bu konuyu araştır, analiz et, plan yap" | research → task | writer (rapor) |
| "Basit soru" | Direkt yanıtla | Ajan gereksiz |

## Kritik Kurallar

1. **Minimum Ajan:** Gereksiz ajan çağırma. Basit sorulara direkt yanıt ver.
2. **Doğru Sıra:** Araştırma genelde önce gelir (bilgi → analiz → üretim)
3. **Net Talimat:** Her ajana spesifik görev ver, belirsiz bırakma
4. **Sonuç Odaklı:** Kullanıcının istediği çıktıya odaklan

# Yanıt Formatı

## Ajan Planlaması Yapıyorsan:
\`\`\`json
{
  "analysis": "Kullanıcı X istiyor, bunun için Y ve Z gerekli",
  "plan": ["agent1", "agent2"],
  "reasoning": "Önce research çünkü bilgi lazım, sonra writer rapor için"
}
\`\`\`

## Direkt Yanıt Veriyorsan:
Sadece yanıtı ver, JSON kullanma.

# Dil
- Türkçe yanıt ver
- Profesyonel ama samimi ol
- Teknik terimleri açıkla`;

/**
 * Creates the supervisor node with reflection capability
 */
function createSupervisorNode(model: BaseChatModel) {
  return async (state: typeof SupervisorState.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    
    // If we have results from all planned agents, reflect and synthesize
    if (state.plan.length > 0 && state.completed.length === state.plan.length) {
      // Step 1: Reflect on agent outputs quality
      const reflectionPrompt = `Evaluate the quality of these agent outputs. Rate 1-10 and note issues:

${Object.entries(state.agentResults)
  .map(([agent, result]) => `**${agent}**:\n${result.output?.slice(0, 500)}...`)
  .join("\n\n")}

Output JSON: { "overallQuality": 1-10, "issues": ["issue1", ...], "needsRework": true/false }`;

      let needsRework = false;
      try {
        const reflectionResponse = await model.invoke([
          new SystemMessage("You are a quality evaluator. Be critical but fair."),
          new HumanMessage(reflectionPrompt),
        ]);
        
        const reflectionText = reflectionResponse.content as string;
        const match = reflectionText.match(/\{[\s\S]*\}/);
        if (match) {
          const evaluation = JSON.parse(match[0]);
          needsRework = evaluation.needsRework || evaluation.overallQuality < 6;
          
          if (evaluation.issues?.length > 0) {
            console.log(`[Supervisor] Reflection issues: ${evaluation.issues.join(", ")}`);
          }
        }
      } catch {
        // Continue with synthesis if reflection fails
      }

      // Step 2: If quality is low and we haven't exceeded retries, rework
      if (needsRework && state.retryCount < MAX_RETRIES) {
        return {
          retryCount: state.retryCount + 1,
          reflectionNotes: ["Supervisor detected quality issues, requesting rework"],
          completed: [], // Reset completed to re-run agents
          currentAgent: state.plan[0],
          iterationCount: 1,
        };
      }

      // Step 3: Synthesize final response
      const synthesisPrompt = `Based on the work completed by the agents, synthesize a final response.

Agent Results:
${Object.entries(state.agentResults)
  .map(([agent, result]) => `${agent}: ${result.output}`)
  .join("\n\n")}

Provide a comprehensive, well-formatted response combining all the agents' work.
If any agent failed, acknowledge it and provide the best possible response.`;

      const response = await model.invoke([
        new SystemMessage(SUPERVISOR_SYSTEM_PROMPT),
        ...state.messages,
        new HumanMessage(synthesisPrompt),
      ]);

      return {
        messages: [new AIMessage(response.content as string)],
        finalOutput: response.content as string,
        currentAgent: null,
        iterationCount: 1,
      };
    }

    // Plan which agents to use
    const planPrompt = `Analyze this request and decide which agents to use.
Output ONLY a JSON array of agent names, no explanation.
Available: ["research", "writer", "coder", "task"]
If no agents needed, output: []

Request: ${lastMessage.content}`;

    const response = await model.invoke([
      new SystemMessage(SUPERVISOR_SYSTEM_PROMPT),
      new HumanMessage(planPrompt),
    ]);

    let plan: string[] = [];
    try {
      const content = response.content as string;
      const match = content.match(/\[.*\]/s);
      if (match) {
        plan = JSON.parse(match[0]);
      }
    } catch {
      // If parsing fails, respond directly
      plan = [];
    }

    if (plan.length === 0) {
      // Simple query, respond directly
      const directResponse = await model.invoke([
        new SystemMessage(SUPERVISOR_SYSTEM_PROMPT),
        ...state.messages,
      ]);

      return {
        messages: [new AIMessage(directResponse.content as string)],
        finalOutput: directResponse.content as string,
        currentAgent: null,
      };
    }

    return {
      plan,
      currentAgent: plan[0],
      messages: [
        new AIMessage(`I'll help you with that. Let me coordinate the team: ${plan.join(" → ")}`),
      ],
    };
  };
}

/**
 * Creates a real agent node that uses actual agent implementations
 */
function createRealAgentNode(name: string) {
  return async (state: typeof SupervisorState.State) => {
    const lastUserMessage = state.messages.find(
      (m) => m instanceof HumanMessage || (m as BaseMessage)._getType?.() === "human"
    );
    
    const query = lastUserMessage?.content?.toString() || "";
    const previousResults = Object.values(state.agentResults)
      .map((r: any) => r.output)
      .filter(Boolean)
      .join("\n\n");

    console.log(`[${name}] Executing real agent for: "${query.substring(0, 50)}..."`);

    try {
      let result: AgentResult;

      // Use the REAL agent implementations
      switch (name) {
        case "research": {
          const agent = createResearchAgent();
          result = await agent.execute(query, {
            useWebSearch: true,
            useDocSearch: true,
            depth: "standard",
          });
          break;
        }
        case "writer": {
          const agent = createWriterAgent();
          const writerInput = previousResults 
            ? `Based on this research:\n${previousResults}\n\nTask: ${query}`
            : query;
          result = await agent.execute(writerInput, {
            style: "professional",
            contentType: "article",
            selfEdit: true,
          });
          break;
        }
        case "coder": {
          const agent = createCoderAgent();
          result = await agent.execute(query, {
            language: "typescript",
            includeTests: false,
          });
          break;
        }
        case "task": {
          const agent = createTaskAgent();
          result = await agent.execute(query, {
            mode: "detailed",
          });
          break;
        }
        default:
          result = { success: false, output: "", error: `Unknown agent: ${name}` };
      }

      console.log(`[${name}] Agent completed. Success: ${result.success}`);

      // Move to next agent or back to supervisor
      const currentIndex = state.plan.indexOf(name);
      const nextAgent = state.plan[currentIndex + 1] || null;

      return {
        agentResults: { [name]: result },
        completed: [name],
        currentAgent: nextAgent,
        messages: [new AIMessage(`[${name}] ${result.output?.substring(0, 200)}...`)],
        lastError: result.error || undefined,
        retryCount: 0,
        iterationCount: 1,
      };
    } catch (error) {
      console.error(`[${name}] Agent error:`, error);
      
      // Handle errors with retry logic
      if (state.retryCount < MAX_RETRIES) {
        return {
          lastError: error instanceof Error ? error.message : String(error),
          retryCount: state.retryCount + 1,
          reflectionNotes: [`Error encountered: ${error}. Retrying...`],
          iterationCount: 1,
        };
      }

      // Max retries reached, return error result
      const errorResult: AgentResult = {
        success: false,
        output: `Failed after ${MAX_RETRIES} retries: ${error}`,
      };

      const currentIndex = state.plan.indexOf(name);
      const nextAgent = state.plan[currentIndex + 1] || null;

      return {
        agentResults: { [name]: errorResult },
        completed: [name],
        currentAgent: nextAgent,
        messages: [new AIMessage(`[${name}] ⚠️ Task failed: ${error}`)],
        lastError: undefined,
        retryCount: 0,
        iterationCount: 1,
      };
    }
  };
}

/**
 * Creates a basic agent node with self-correction capability (DEPRECATED - use createRealAgentNode)
 */
function createAgentNode(name: string, systemPrompt: string, model: BaseChatModel) {
  return async (state: typeof SupervisorState.State) => {
    const lastUserMessage = state.messages.find(
      (m) => m instanceof HumanMessage || (m as BaseMessage)._getType?.() === "human"
    );

    // Check for previous errors and add context
    const errorContext = state.lastError 
      ? `\n\n⚠️ PREVIOUS ATTEMPT FAILED: ${state.lastError}\nPlease address this issue in your response.`
      : "";

    // Check for reflection notes
    const reflectionContext = state.reflectionNotes.length > 0
      ? `\n\n📝 REFLECTION NOTES:\n${state.reflectionNotes.join("\n")}`
      : "";

    try {
      const response = await model.invoke([
        new SystemMessage(systemPrompt + errorContext + reflectionContext),
        new HumanMessage(
          `Context: ${JSON.stringify(state.context)}
        
Previous agent results: ${JSON.stringify(state.agentResults)}

Task: ${lastUserMessage?.content || "Complete your assigned task"}`
        ),
      ]);

      const output = response.content as string;

      // Self-reflection: Check if output is valid
      const isValidOutput = output && output.length > 10 && !output.includes("I cannot");
      
      if (!isValidOutput && state.retryCount < MAX_RETRIES) {
        // Trigger retry with reflection
        return {
          lastError: "Output was empty or invalid",
          retryCount: state.retryCount + 1,
          reflectionNotes: [`Attempt ${state.retryCount + 1}: Output was insufficient, retrying with more context`],
          iterationCount: 1,
        };
      }

      const result: AgentResult = {
        success: true,
        output,
      };

      // Move to next agent or back to supervisor
      const currentIndex = state.plan.indexOf(name);
      const nextAgent = state.plan[currentIndex + 1] || null;

      return {
        agentResults: { [name]: result },
        completed: [name],
        currentAgent: nextAgent,
        messages: [new AIMessage(`[${name}] ${output}`)],
        lastError: undefined,
        retryCount: 0,
        iterationCount: 1,
      };
    } catch (error) {
      // Handle errors with retry logic
      if (state.retryCount < MAX_RETRIES) {
        return {
          lastError: error instanceof Error ? error.message : String(error),
          retryCount: state.retryCount + 1,
          reflectionNotes: [`Error encountered: ${error}. Retrying...`],
          iterationCount: 1,
        };
      }

      // Max retries reached, return error result
      const errorResult: AgentResult = {
        success: false,
        output: `Failed after ${MAX_RETRIES} retries: ${error}`,
      };

      const currentIndex = state.plan.indexOf(name);
      const nextAgent = state.plan[currentIndex + 1] || null;

      return {
        agentResults: { [name]: errorResult },
        completed: [name],
        currentAgent: nextAgent,
        messages: [new AIMessage(`[${name}] ⚠️ Task failed: ${error}`)],
        lastError: undefined,
        retryCount: 0,
        iterationCount: 1,
      };
    }
  };
}

/**
 * Router function to determine next node with iteration limit
 */
function routeNext(state: typeof SupervisorState.State): AgentNodeType {
  // Prevent infinite loops
  if (state.iterationCount >= MAX_ITERATIONS) {
    console.warn(`[Supervisor] Max iterations (${MAX_ITERATIONS}) reached, forcing end`);
    return "end";
  }

  // If we have a final output, we're done
  if (state.finalOutput) {
    return "end";
  }
  
  // If an agent needs retry, route back to it
  if (state.lastError && state.retryCount > 0 && state.currentAgent) {
    console.log(`[Supervisor] Retrying ${state.currentAgent} (attempt ${state.retryCount})`);
    return state.currentAgent as AgentNodeType;
  }

  // If there's a current agent to execute
  if (state.currentAgent) {
    return state.currentAgent as AgentNodeType;
  }

  // If all planned agents are complete, synthesize
  if (state.plan.length > 0 && state.completed.length === state.plan.length) {
    return "supervisor";
  }

  return "supervisor";
}

/**
 * Creates the supervisor graph with all agents
 */
export function createSupervisor(config?: { 
  apiKey?: string; 
  model?: string; 
  provider?: "openai" | "gemini";
}) {
  const provider = config?.provider || (process.env.GEMINI_API_KEY ? "gemini" : "openai");
  
  let model: BaseChatModel;
  
  if (provider === "gemini") {
    model = new ChatGemini({
      modelName: config?.model || "gemini-2.5-flash",
      geminiApiKey: config?.apiKey || process.env.GEMINI_API_KEY,
      temperature: 0.7,
    });
  } else {
    model = new ChatOpenAI({
      modelName: config?.model || "gpt-4o",
      openAIApiKey: config?.apiKey || process.env.OPENAI_API_KEY,
      temperature: 0.7,
    });
  }

  const graph = new StateGraph(SupervisorState)
    .addNode("supervisor", createSupervisorNode(model))
    .addNode("research", createRealAgentNode("research"))
    .addNode("writer", createRealAgentNode("writer"))
    .addNode("coder", createRealAgentNode("coder"))
    .addNode("task", createRealAgentNode("task"))
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", routeNext, {
      research: "research",
      writer: "writer",
      coder: "coder",
      task: "task",
      supervisor: "supervisor",
      end: END,
    })
    .addConditionalEdges("research", routeNext, {
      research: "research",
      writer: "writer",
      coder: "coder",
      task: "task",
      supervisor: "supervisor",
      end: END,
    })
    .addConditionalEdges("writer", routeNext, {
      research: "research",
      writer: "writer",
      coder: "coder",
      task: "task",
      supervisor: "supervisor",
      end: END,
    })
    .addConditionalEdges("coder", routeNext, {
      research: "research",
      writer: "writer",
      coder: "coder",
      task: "task",
      supervisor: "supervisor",
      end: END,
    })
    .addConditionalEdges("task", routeNext, {
      research: "research",
      writer: "writer",
      coder: "coder",
      task: "task",
      supervisor: "supervisor",
      end: END,
    });

  return graph.compile();
}
