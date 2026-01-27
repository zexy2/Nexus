import { NextRequest, NextResponse } from "next/server";

/**
 * Deep Research API
 * 
 * Performs comprehensive web research similar to Tavily's Deep Research:
 * 1. Planning - Break down the research question
 * 2. Searching - Multiple search queries across sources
 * 3. Analyzing - Extract and synthesize information
 * 4. Reporting - Generate comprehensive report with sources
 */

interface ResearchStep {
  phase: string;
  status: "pending" | "running" | "completed";
  details?: string;
  duration?: number;
  data?: unknown;
}

interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

async function searchTavily(query: string, depth: "basic" | "advanced" = "advanced"): Promise<{
  results: SearchResult[];
  answer?: string;
}> {
  if (!TAVILY_API_KEY) {
    console.log("[DeepResearch] No Tavily API key, skipping search");
    return { results: [] };
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        max_results: 10,
        search_depth: depth,
        include_answer: true,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily error: ${response.status}`);
    }

    const data = await response.json();
    return {
      results: data.results || [],
      answer: data.answer,
    };
  } catch (error) {
    console.error("[DeepResearch] Tavily search failed:", error);
    return { results: [] };
  }
}

// Direct Groq API call for report generation - bypasses multi-agent system
async function generateWithAI(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    console.log("[DeepResearch] No Groq API key, falling back to basic response");
    return "";
  }
  
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Sen kısa ve öz yanıtlar veren bir araştırma asistanısın. Türkçe cevap ver." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        stream: false,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices[0]?.message?.content || "";
    }
    return "";
  } catch (error) {
    console.error("[DeepResearch] Groq API error:", error);
    return "";
  }
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`));
      };

      try {
        const { query, topic } = await request.json();
        const startTime = Date.now();
        
        // ===== PHASE 1: PLANNING =====
        sendEvent("phase", { phase: "planning", status: "running", message: "Initializing research plan..." });
        
        // Generate sub-queries for comprehensive research
        const planPrompt = `You are a research planning assistant. Break down this research topic into 4-6 specific search queries that will help gather comprehensive information.

Topic: "${query}"

Return ONLY a JSON array of search queries in Turkish. Example: ["query 1", "query 2", "query 3"]`;

        const planResponse = await generateWithAI(planPrompt);
        let searchQueries: string[] = [query]; // Default to original query
        
        try {
          const match = planResponse.match(/\[[\s\S]*?\]/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            if (Array.isArray(parsed) && parsed.length > 0) {
              searchQueries = parsed.slice(0, 6);
            }
          }
        } catch {
          searchQueries = [query];
        }

        sendEvent("phase", { 
          phase: "planning", 
          status: "completed", 
          message: `Created ${searchQueries.length} research queries`,
          queries: searchQueries,
          duration: Date.now() - startTime
        });

        // ===== PHASE 2: SEARCHING =====
        sendEvent("phase", { phase: "searching", status: "running", message: "Searching across sources..." });
        
        const allResults: SearchResult[] = [];
        const allAnswers: string[] = [];
        let totalSources = 0;
        
        for (let i = 0; i < searchQueries.length; i++) {
          const searchQuery = searchQueries[i];
          sendEvent("search_progress", { 
            current: i + 1, 
            total: searchQueries.length,
            query: searchQuery 
          });

          const searchResult = await searchTavily(searchQuery, "advanced");
          
          if (searchResult.results.length > 0) {
            allResults.push(...searchResult.results);
            totalSources += searchResult.results.length;
          }
          
          if (searchResult.answer) {
            allAnswers.push(`[${searchQuery}]: ${searchResult.answer}`);
          }

          // Small delay between searches
          await new Promise(r => setTimeout(r, 500));
        }

        // Deduplicate results by URL
        const uniqueResults = allResults.reduce((acc, curr) => {
          if (!acc.find(r => r.url === curr.url)) {
            acc.push(curr);
          }
          return acc;
        }, [] as SearchResult[]);

        sendEvent("phase", { 
          phase: "searching", 
          status: "completed", 
          message: `Found ${uniqueResults.length} unique sources`,
          searches: searchQueries.length,
          sources: uniqueResults.length,
          duration: Date.now() - startTime
        });

        // ===== PHASE 3: ANALYZING =====
        sendEvent("phase", { phase: "analyzing", status: "running", message: "Analyzing and synthesizing information..." });

        // Prepare source summaries for the report
        const sourceSummaries = uniqueResults.slice(0, 15).map((r, i) => 
          `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 500)}...`
        ).join("\n\n");

        const answerSummaries = allAnswers.join("\n\n");

        sendEvent("phase", { 
          phase: "analyzing", 
          status: "completed",
          message: "Information synthesized",
          duration: Date.now() - startTime
        });

        // ===== PHASE 4: GENERATING REPORT =====
        sendEvent("phase", { phase: "generating", status: "running", message: "Generating comprehensive report..." });

        // Build report directly from Tavily data - cleaner and more direct
        const reportPrompt = `Sen bir araştırma analistisin. Aşağıdaki web araştırma sonuçlarını kullanarak kısa ve öz bir rapor oluştur.

**ARAŞTIRMA KONUSU:** "${query}"

**TAVILY ARAŞTIRMA CEVAPLARI:**
${answerSummaries}

**KAYNAK ÖZETLERİ:**
${uniqueResults.slice(0, 10).map((r, i) => `[${i + 1}] ${r.title}: ${r.content.slice(0, 300)}`).join("\n\n")}

**TALİMATLAR:**
- Türkçe yaz
- KISA ve ÖZEL ol - maksimum 400 kelime
- Doğrudan bilgi ver, gereksiz giriş yapma
- Markdown formatı kullan (## başlıklar, - maddeler)
- Kaynak numaralarını [1], [2] şeklinde belirt
- "Bu rapor..." veya "Araştırmamız..." gibi kalıplar KULLANMA
- Direkt bulguları yaz

**FORMAT:**
## 🎯 Özet
(2-3 cümle ana bulgular)

## 📊 Temel Bulgular
- Bulgu 1 [kaynak]
- Bulgu 2 [kaynak]
- Bulgu 3 [kaynak]

## 💡 Sonuç
(1-2 cümle çıkarım)`;

        const report = await generateWithAI(reportPrompt);

        sendEvent("phase", { 
          phase: "generating", 
          status: "completed",
          message: "Report generated",
          duration: Date.now() - startTime
        });

        // ===== FINAL RESULT =====
        const totalDuration = Date.now() - startTime;
        
        sendEvent("complete", {
          report,
          sources: uniqueResults.slice(0, 15).map((r, i) => ({
            number: i + 1,
            title: r.title,
            url: r.url,
            snippet: r.content.slice(0, 200),
          })),
          stats: {
            totalDuration,
            searchQueries: searchQueries.length,
            sourcesFound: uniqueResults.length,
            sourcesUsed: Math.min(uniqueResults.length, 15),
          },
          queries: searchQueries,
        });

        controller.close();
      } catch (error) {
        console.error("[DeepResearch] Error:", error);
        sendEvent("error", { message: String(error) });
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
