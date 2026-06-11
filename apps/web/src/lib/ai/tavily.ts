/**
 * Tavily Search Integration
 * 
 * Provides web search capabilities for the Research Agent.
 * https://tavily.com - AI-optimized search API
 */

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

export interface TavilySearchResponse {
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
  console.log("[Tavily] API Key present:", !!apiKey);

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

/**
 * Get AI-optimized answer for a question
 */
export async function getAnswer(
  question: string
): Promise<{ answer: string; sources: TavilySearchResult[] }> {
  const searchResult = await searchWeb(question, {
    searchDepth: "advanced",
    includeAnswer: true,
    maxResults: 5,
  });

  return {
    answer: searchResult.answer || formatResultsAsAnswer(searchResult.results),
    sources: searchResult.results,
  };
}

/**
 * Format search results as a readable answer
 */
function formatResultsAsAnswer(results: TavilySearchResult[]): string {
  if (results.length === 0) {
    return "No relevant information found.";
  }

  const sections = results.slice(0, 3).map((r, i) => {
    return `**${i + 1}. ${r.title}**\n${r.content.slice(0, 300)}...\n_Source: ${r.url}_`;
  });

  return sections.join("\n\n");
}

/**
 * Search for recent news on a topic
 */
export async function searchNews(
  topic: string,
  maxResults = 5
): Promise<TavilySearchResult[]> {
  const result = await searchWeb(`${topic} latest news`, {
    maxResults,
    searchDepth: "basic",
    includeDomains: [
      "reuters.com",
      "bbc.com",
      "cnn.com",
      "nytimes.com",
      "theguardian.com",
      "techcrunch.com",
      "wired.com",
    ],
  });

  return result.results;
}

/**
 * Search for technical documentation
 */
export async function searchDocs(
  query: string,
  technology?: string
): Promise<TavilySearchResult[]> {
  const searchQuery = technology ? `${technology} ${query}` : query;

  const result = await searchWeb(searchQuery, {
    maxResults: 5,
    searchDepth: "advanced",
    includeDomains: [
      "docs.github.com",
      "developer.mozilla.org",
      "stackoverflow.com",
      "medium.com",
      "dev.to",
      "npmjs.com",
      "pypi.org",
    ],
  });

  return result.results;
}
