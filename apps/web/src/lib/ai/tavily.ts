/**
 * Tavily Search Integration
 * 
 * Provides web search capabilities for the Research Agent.
 * https://tavily.com - AI-optimized search API
 */

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
  followUpQuestions?: string[];
}

/**
 * Search the web using Tavily API
 */
export async function searchWeb(
  query: string,
  options?: {
    maxResults?: number;
    searchDepth?: "basic" | "advanced";
    includeAnswer?: boolean;
    includeDomains?: string[];
    excludeDomains?: string[];
  }
): Promise<TavilySearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  console.log("[Tavily] Search started for query:", query);
  if (!apiKey) {
    throw new Error("TAVILY_NOT_CONFIGURED");
  }

  try {
    console.log("[Tavily] Calling Tavily API...");
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: options?.maxResults || 5,
        search_depth: options?.searchDepth || "basic",
        include_answer: options?.includeAnswer ?? true,
        include_domains: options?.includeDomains,
        exclude_domains: options?.excludeDomains,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = await response.json();
    console.log("[Tavily] Got response with", data.results?.length, "results");
    console.log("[Tavily] Answer:", data.answer?.slice(0, 100));

    return {
      query: data.query,
      results: data.results.map((r: Record<string, unknown>) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score || 0,
        publishedDate: r.published_date,
      })),
      answer: data.answer,
      followUpQuestions: data.follow_up_questions,
    };
  } catch (error) {
    console.error("Tavily search failed:", error);
    throw error;
  }
}

