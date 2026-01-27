import { NextRequest, NextResponse } from "next/server";
import { 
  startAgentTrace, 
  addAgentStep, 
  completeAgentTrace, 
  failAgentTrace,
  logger 
} from "@/lib/observability";
import { searchWeb, getAnswer } from "@/lib/tavily";
import { correctiveRAG, generateCRAGAnswer } from "@/lib/crag";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AgentRequest {
  message: string;
  context?: {
    workspaceId?: string;
    userId?: string;
  };
  mode?: "auto" | "research" | "writer" | "coder" | "task";
  useCRAG?: boolean; // Enable Corrective RAG
}

// Gemini-powered agent response - supports both Flash and Pro models
async function getGeminiResponse(
  message: string, 
  systemPrompt: string, 
  model: "gemini-2.5-flash" | "gemini-2.5-pro" = "gemini-2.5-flash"
): Promise<{ content: string; tokens: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: message }] }],
      generationConfig: {
        temperature: model === "gemini-2.5-pro" ? 0.5 : 0.7,
        maxOutputTokens: model === "gemini-2.5-pro" ? 8192 : 4096,
      },
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
    tokens: data.usageMetadata?.totalTokenCount || 0,
  };
}

// RAG context retrieval
async function getRAGContext(query: string): Promise<string> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          options: { limit: 3, includeContext: true, useSemantic: true },
        }),
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      return data.context || "";
    }
  } catch (err) {
    console.error("RAG context retrieval failed:", err);
  }
  return "";
}

// Web search using Tavily
async function getWebSearchContext(query: string): Promise<string> {
  try {
    const result = await searchWeb(query, { maxResults: 3, includeAnswer: true });
    
    if (result.answer) {
      const sources = result.results
        .slice(0, 3)
        .map(r => `- [${r.title}](${r.url})`)
        .join("\n");
      
      return `**Web Search Results:**\n${result.answer}\n\n**Sources:**\n${sources}`;
    }
    
    return result.results
      .map(r => `**${r.title}**\n${r.content.slice(0, 200)}...\nSource: ${r.url}`)
      .join("\n\n");
  } catch (err) {
    console.error("Web search failed:", err);
    return "";
  }
}

const SYSTEM_PROMPTS: Record<string, string> = {
  supervisor: `Sen Gemini tarafından desteklenen bir yapay zeka asistanısın.

Görevin kullanıcıya yardımcı olmak. Doğal, samimi ve profesyonel bir dil kullan.
Yanıtlarını Markdown formatında yaz ama aşırı formatlama yapma.
Türkçe yanıt ver.`,

  research: `Sen Gemini 2.5 Pro tarafından desteklenen üst düzey bir araştırma asistanısın.

GÖREV:
Kullanıcının sorularına derinlemesine, kapsamlı ve bilgilendirici yanıtlar vermek.

ARAŞTIRMA YAKLAŞIMIN:
1. Konuyu farklı açılardan analiz et
2. Tarihsel bağlamı, güncel durumu ve gelecek perspektifini ele al
3. Karşıt görüşleri ve farklı perspektifleri değerlendir
4. Somut örnekler, veriler ve kanıtlar sun
5. Belirsiz veya tartışmalı konuları açıkça belirt

YAZI STİLİ:
- Doğal, akıcı ve profesyonel bir dil kullan
- Konuyu derinlemesine ele al, yüzeysel geçme
- Açıklayıcı paragraflar tercih et
- Gerektiğinde alt başlıklar kullan
- Gereksiz emoji veya aşırı formatlama yapma
- Markdown kullanabilirsin ama sade tut
- Kapsamlı yanıtlar ver - minimum 500 kelime hedefle

Türkçe yanıt ver. Akademik kalitede ama okunabilir ol.`,

  writer: `Sen Gemini tarafından desteklenen bir içerik yazma asistanısın.

Görevin:
- İyi yapılandırılmış, okunabilir içerikler oluşturmak
- Net ve akıcı bir dil kullanmak

Yanıt stili:
- Doğal, insani bir dil kullan
- Markdown ile temiz formatlama yap
- Gereksiz emoji kullanma

Türkçe yaz.`,

  coder: `Sen Gemini tarafından desteklenen bir yazılım geliştirme asistanısın.

Görevin:
- Temiz, okunabilir ve çalışan kod yazmak
- Hata ayıklamak ve çözümler önermek
- Teknik kavramları açıklamak

Yanıt stili:
- Kod bloklarını uygun syntax highlighting ile ver
- Kısa açıklamalar ekle
- Gereksiz emoji kullanma

Açıklamaları Türkçe, kod İngilizce olabilir.`,

  task: `Sen Gemini tarafından desteklenen bir proje yönetim asistanısın.

Görevin:
- Projeleri yönetilebilir görevlere bölmek
- Öncelik ve zaman tahminleri yapmak
- Net görev listeleri oluşturmak

Yanıt stili:
- Görevleri maddeler halinde listele
- Her görev için kısa açıklama ekle
- Öncelik belirt
- Gereksiz emoji kullanma

Türkçe yaz.`,
};

export async function POST(request: NextRequest) {
  try {
    const body: AgentRequest = await request.json();

    if (!body.message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const mode = body.mode || "auto";
    const agentType = mode === "auto" ? "supervisor" : mode;
    const encoder = new TextEncoder();
    console.log("[Agent] Request received - mode:", mode, "agentType:", agentType);
    
    // Start tracing
    const trace = startAgentTrace(
      `agent-${agentType}`,
      agentType,
      body.message,
      { workspaceId: body.context?.workspaceId, userId: body.context?.userId }
    );
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial thinking status
          addAgentStep(trace.traceId, {
            name: "thinking",
            type: "thinking",
            content: "Analyzing request",
          });
          
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: "thinking",
              agent: agentType,
              message: "Analyzing your request...",
              traceId: trace.traceId,
            })}\n\n`)
          );

          // Get RAG context for relevant modes
          let ragContext = "";
          let cragResult = null;
          const webSources: Array<{title: string; url: string; content: string}> = [];
          
          if (mode === "auto" || mode === "research") {
            // Use CRAG if enabled, otherwise standard RAG
            if (body.useCRAG) {
              addAgentStep(trace.traceId, {
                name: "crag_search",
                type: "tool_call",
                content: "Using Corrective RAG for enhanced retrieval",
              });
              
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: "crag",
                  message: "Using Corrective RAG for self-correcting retrieval...",
                })}\n\n`)
              );
              
              cragResult = await correctiveRAG(body.message, body.context?.workspaceId, {
                maxCorrections: 2,
                includeWebSearch: mode === "research",
                useGeminiForEval: true
              });
              
              if (cragResult.corrections > 0) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: "crag_correction",
                    message: `Applied ${cragResult.corrections} query refinements for better results.`,
                    corrections: cragResult.corrections,
                  })}\n\n`)
                );
              }
              
              ragContext = cragResult.relevantDocuments
                .filter(d => d.isRelevant)
                .map(d => d.content)
                .join("\n\n");
            } else {
              addAgentStep(trace.traceId, {
                name: "rag_search",
                type: "tool_call",
                content: "Searching workspace documents",
              });
              
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: "rag",
                  message: "Searching workspace for relevant context...",
                })}\n\n`)
              );
              
              ragContext = await getRAGContext(body.message);
            }
          }

          // Web search for research mode (if not already done via CRAG)
          let webContext = "";
          
          if (mode === "research" && !body.useCRAG) {
            console.log("[Agent] Research mode - starting comprehensive research...");
            
            // PHASE 1: Initial Analysis
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: "phase",
                phase: "analyzing",
                message: "📊 Aşama 1/5: Konu analiz ediliyor...",
                detail: "Gemini 2.5 Pro sorunuzu inceliyor"
              })}\n\n`)
            );
            
            addAgentStep(trace.traceId, {
              name: "topic_analysis",
              type: "thinking",
              content: "Analyzing topic for research",
            });

            // Generate sub-queries for better research
            const subQueryPrompt = `Şu konuyu araştırmak için 4-5 farklı arama sorgusu oluştur: "${body.message}"
            
Her sorgu farklı bir açıyı ele alsın (tanım, tarihçe, mekanizma, örnekler, güncel durum).
JSON array olarak döndür: ["sorgu1", "sorgu2", ...]`;

            let searchQueries = [body.message];
            try {
              const { content: queryResponse } = await getGeminiResponse(subQueryPrompt, "Arama sorgusu oluşturma uzmanısın. JSON formatında yanıt ver.", "gemini-2.5-flash");
              const match = queryResponse.match(/\[[\s\S]*?\]/);
              if (match) {
                const parsed = JSON.parse(match[0]);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  searchQueries = [body.message, ...parsed.slice(0, 4)];
                }
              }
            } catch {
              searchQueries = [body.message];
            }

            // PHASE 2: Web Search
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: "phase",
                phase: "searching",
                message: "🔍 Aşama 2/5: Web'de arama yapılıyor...",
                detail: `${searchQueries.length} farklı sorgu aranacak`
              })}\n\n`)
            );

            addAgentStep(trace.traceId, {
              name: "web_search",
              type: "tool_call",
              content: `Searching web with ${searchQueries.length} queries`,
            });

            const allAnswers: string[] = [];
            
            for (let i = 0; i < searchQueries.length; i++) {
              const query = searchQueries[i];
              
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: "search_progress",
                  current: i + 1,
                  total: searchQueries.length,
                  query: query
                })}\n\n`)
              );

              try {
                const result = await searchWeb(query, { maxResults: 5, includeAnswer: true });
                
                if (result.answer) {
                  allAnswers.push(`[${query}]: ${result.answer}`);
                }
                
                if (result.results) {
                  for (const r of result.results) {
                    if (!webSources.find(s => s.url === r.url)) {
                      webSources.push({ title: r.title, url: r.url, content: r.content });
                    }
                  }
                }
              } catch (err) {
                console.error("[Agent] Search error:", err);
              }
              
              // Rate limiting
              await new Promise(r => setTimeout(r, 400));
            }

            console.log("[Agent] Found", webSources.length, "unique sources");

            // PHASE 3: Deep Analysis
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: "phase",
                phase: "analyzing_deep",
                message: "🧠 Aşama 3/5: Derinlemesine analiz yapılıyor...",
                detail: `${webSources.length} kaynak analiz ediliyor`
              })}\n\n`)
            );

            addAgentStep(trace.traceId, {
              name: "deep_analysis",
              type: "execution",
              content: `Analyzing ${webSources.length} sources`,
            });

            // Build context from sources
            const sourceContext = webSources.slice(0, 10).map((s, i) => 
              `[Kaynak ${i + 1}] ${s.title}\n${s.content}`
            ).join("\n\n---\n\n");

            const answerContext = allAnswers.join("\n\n");

            webContext = `**Web Araştırması Sonuçları:**\n\n${answerContext}\n\n**Detaylı Kaynaklar:**\n${sourceContext}`;

            // PHASE 4: Synthesizing
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: "phase",
                phase: "synthesizing",
                message: "✍️ Aşama 4/5: Bilgiler sentezleniyor...",
                detail: "Gemini 2.5 Pro kapsamlı yanıt oluşturuyor"
              })}\n\n`)
            );

            addAgentStep(trace.traceId, {
              name: "synthesizing",
              type: "execution",
              content: "Synthesizing research findings",
            });
            
            // Small delay for UX
            await new Promise(r => setTimeout(r, 500));

            if (webContext) {
              addAgentStep(trace.traceId, {
                name: "web_results",
                type: "execution",
                content: `Found ${webSources.length} sources from web search`,
              });
            }
          }

          // Build the full prompt with context
          let fullPrompt = body.message;
          const contextParts: string[] = [];
          
          if (ragContext) {
            contextParts.push(`**Workspace Documents:**\n${ragContext}`);
          }
          if (webContext) {
            contextParts.push(webContext);
          }
          
          if (contextParts.length > 0) {
            fullPrompt = `${contextParts.join("\n\n---\n\n")}\n\n---\n\nUser Request: ${body.message}`;
            
            addAgentStep(trace.traceId, {
              name: "context_found",
              type: "execution",
              content: `Combined context: RAG=${ragContext.length}, Web=${webContext.length}`,
            });
            
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: "context",
                message: "Found relevant context from workspace and web.",
              })}\n\n`)
            );
          }

          // Select the appropriate system prompt
          const systemPrompt = SYSTEM_PROMPTS[agentType] || SYSTEM_PROMPTS.supervisor;
          
          // Use Gemini 2.5 Pro for research mode, Flash for others
          const modelToUse = agentType === "research" ? "gemini-2.5-pro" : "gemini-2.5-flash";

          // Get response from Gemini
          addAgentStep(trace.traceId, {
            name: "llm_call",
            type: "execution",
            content: `Calling Gemini API (${modelToUse})`,
          });
          
          // Show final phase for research mode
          if (mode === "research") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: "phase",
                phase: "generating",
                message: "📝 Aşama 5/5: Kapsamlı yanıt oluşturuluyor...",
                detail: "Gemini 2.5 Pro tüm bilgileri birleştiriyor"
              })}\n\n`)
            );
          } else {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: "agent_start",
                agent: agentType,
                message: "Yanıt oluşturuluyor...",
              })}\n\n`)
            );
          }

          const { content: response, tokens } = await getGeminiResponse(fullPrompt, systemPrompt, modelToUse);

          // Complete the trace
          addAgentStep(trace.traceId, {
            name: "response_generated",
            type: "response",
            content: response.slice(0, 200),
          });
          completeAgentTrace(trace.traceId, response, tokens);

          // Send final response with sources for research mode
          const finalData: Record<string, unknown> = {
            type: "final",
            agent: agentType,
            message: response,
            hasContext: !!ragContext,
            traceId: trace.traceId,
            tokens,
          };

          // Add sources for research mode
          if (mode === "research" && webSources && webSources.length > 0) {
            finalData.sources = webSources.slice(0, 10).map((s, i) => ({
              number: i + 1,
              title: s.title,
              url: s.url
            }));
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(finalData)}\n\n`)
          );
          
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
          
        } catch (error) {
          console.error("Agent stream error:", error);
          failAgentTrace(trace.traceId, error instanceof Error ? error.message : "Unknown error");
          
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: "error",
              message: error instanceof Error ? error.message : "An error occurred",
              traceId: trace.traceId,
            })}\n\n`)
          );
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Agent API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Non-streaming endpoint for simpler use cases
export async function PUT(request: NextRequest) {
  try {
    const body: AgentRequest = await request.json();

    if (!body.message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const mode = body.mode || "auto";
    
    // Get RAG context
    let ragContext = "";
    if (mode === "auto" || mode === "research") {
      ragContext = await getRAGContext(body.message);
    }

    // Get web search context for research mode
    let webContext = "";
    if (mode === "research") {
      webContext = await getWebSearchContext(body.message);
    }

    // Build full prompt with context
    let fullPrompt = body.message;
    const contextParts: string[] = [];
    
    if (ragContext) {
      contextParts.push(`**Workspace Documents:**\n${ragContext}`);
    }
    if (webContext) {
      contextParts.push(webContext);
    }
    
    if (contextParts.length > 0) {
      fullPrompt = `${contextParts.join("\n\n---\n\n")}\n\n---\n\nUser Request: ${body.message}`;
    }

    const agentType = mode === "auto" ? "supervisor" : mode;
    const systemPrompt = SYSTEM_PROMPTS[agentType] || SYSTEM_PROMPTS.supervisor;
    const modelToUse = agentType === "research" ? "gemini-2.5-pro" : "gemini-2.5-flash";
    const { content } = await getGeminiResponse(fullPrompt, systemPrompt, modelToUse);

    return NextResponse.json({
      message: content,
      agent: agentType,
      model: modelToUse,
      hasContext: !!(ragContext || webContext),
      hasWebSearch: !!webContext,
    });
  } catch (error) {
    console.error("Agent API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
