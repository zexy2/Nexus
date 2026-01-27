import { ChatGemini } from "../gemini";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentConfig, AgentResult } from "../types";
import { webSearchTool, vectorSearchTool, searchTavily } from "../tools";

/**
 * EXPERT RESEARCH AGENT
 * 
 * Profesyonel araştırmacı gibi çalışır:
 * - Multi-source verification (çoklu kaynak doğrulama)
 * - Critical analysis (eleştirel analiz)
 * - Structured synthesis (yapılandırılmış sentez)
 */

const RESEARCH_EXPERT_PROMPT = `# Kimlik ve Uzmanlık

Sen dünya çapında tanınan bir araştırma uzmanısın. PhD seviyesinde analitik düşünme, kaynak değerlendirme ve bilgi sentezi yeteneklerine sahipsin.

# Temel Prensipler

1. **Çoklu Kaynak Doğrulama**: Tek kaynağa asla güvenme. En az 2-3 farklı kaynaktan teyit al.
2. **Kaynak Hiyerarşisi**: 
   - Tier 1: Akademik makaleler, resmi raporlar, birincil kaynaklar
   - Tier 2: Saygın haber kaynakları, uzman görüşleri
   - Tier 3: Blog yazıları, forumlar (dikkatli kullan)
3. **Bias Farkındalığı**: Her kaynağın potansiyel önyargısını değerlendir.
4. **Güncellik**: Bilginin ne kadar güncel olduğunu belirt.

# Araştırma Metodolojisi

## Adım 1: Soru Analizi
- Ana araştırma sorusunu parçalara ayır
- Alt sorular belirle
- Hangi tür bilgiye ihtiyaç var?

## Adım 2: Kaynak Tarama
- Önce iç dokümanları tara
- Sonra web araması yap
- Kaynakları güvenilirlik sırasına koy

## Adım 3: Bilgi Çıkarımı
- Her kaynaktan key facts çıkar
- Çelişkili bilgileri not et

## Adım 4: Sentez ve Analiz
- Bilgileri birleştir
- Patterns ve trends belirle
- Çıkarımlar yap

## Adım 5: Sunum
- Executive summary ile başla
- Detaylara in
- Belirsizlikleri belirt
- Kaynakları listele

# Yanıt Formatı

## 📋 Özet
[2-3 cümlelik executive summary]

## 🔍 Bulgular

### [Alt Konu 1]
- Bulgu 1 [Kaynak: X]
- Bulgu 2 [Kaynak: Y]

## ⚠️ Önemli Notlar
- Belirsizlikler ve veri boşlukları

## 📚 Kaynaklar
1. Kaynak adı - Güvenilirlik notu

# Dil
- Türkçe yaz, profesyonel ama anlaşılır ol`;

const SELF_CORRECTION_PROMPT = `Kendi yanıtını eleştirel değerlendir:
1. Eksik bilgi var mı?
2. Kaynaklar yeterince güvenilir mi?
3. Sonuçlar verilerle destekleniyor mu?

Düzeltme gerekiyorsa yap, yoksa "ONAYLANDI" yaz.`;

export interface ResearchOptions {
  useWebSearch?: boolean;
  useDocSearch?: boolean;
  depth?: "quick" | "standard" | "deep";
  selfCorrect?: boolean;
}

export function createResearchAgent(config?: Partial<AgentConfig>) {
  const model = new ChatGemini({
    modelName: config?.model || "gemini-2.5-pro",
    temperature: config?.temperature || 0.3,
    maxTokens: config?.maxTokens || 16000,
  });

  const fastModel = new ChatGemini({
    modelName: "gemini-2.5-flash",
    temperature: 0.2,
    maxTokens: 4000,
  });

  return {
    name: "research",
    description: "Expert researcher with multi-source verification and critical analysis",
    tools: [webSearchTool, vectorSearchTool],
    
    async execute(
      query: string, 
      options: ResearchOptions = {}
    ): Promise<AgentResult> {
      const startTime = Date.now();
      const toolResults: string[] = [];
      const toolsCalled: string[] = [];
      const sources: Array<{title: string; url?: string; credibility: string}> = [];

      try {
        const depth = options.depth || "standard";
        const maxResults = depth === "deep" ? 10 : depth === "standard" ? 5 : 3;

        // 1. Soru analizi
        const analysisPrompt = `Araştırma sorusunu analiz et: "${query}"
JSON döndür: {"searchTerms": ["terim1", "terim2"]}`;

        const analysisResponse = await fastModel.invoke([
          new SystemMessage("Araştırma planlayıcısı. Sadece JSON döndür."),
          new HumanMessage(analysisPrompt),
        ]);

        let searchTerms = [query];
        try {
          const content = analysisResponse.content as string;
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            if (analysis.searchTerms?.length > 0) {
              searchTerms = analysis.searchTerms.slice(0, 3);
            }
          }
        } catch { /* use original query */ }

        // 2. Doküman araması
        if (options.useDocSearch !== false) {
          try {
            const searchQuery = searchTerms[0] || query;
            const docResult = await vectorSearchTool.invoke({ query: searchQuery, limit: maxResults });
            if (docResult && docResult !== "No relevant documents found.") {
              toolResults.push(`**İç Dokümanlar:**\n${docResult}`);
              toolsCalled.push("search_documents");
              sources.push({ title: "Workspace Documents", credibility: "Yüksek" });
            }
          } catch (e) {
            console.warn("[Research] Document search failed:", e);
          }
        }

        // 3. Web araması
        if (options.useWebSearch !== false) {
          try {
            for (const term of searchTerms.slice(0, 2)) {
              const searchResult = await searchTavily(term, { maxResults });
              let resultText = "";
              
              if (searchResult.answer) {
                resultText += `**AI Özeti:** ${searchResult.answer}\n\n`;
              }
              
              for (const r of searchResult.results) {
                resultText += `### ${r.title}\n`;
                resultText += `**URL:** ${r.url}\n`;
                resultText += `**İçerik:** ${r.content}\n\n`;
                sources.push({
                  title: r.title,
                  url: r.url,
                  credibility: assessCredibility(r.url)
                });
              }
              
              if (resultText) {
                toolResults.push(`**Web Araması (${term}):**\n${resultText}`);
                toolsCalled.push("web_search");
              }
            }
          } catch (e) {
            console.warn("[Research] Web search failed:", e);
          }
        }

        // 4. Ana araştırma
        const contextSection = toolResults.length > 0 
          ? `\n\n---\n\n# Toplanan Veriler\n\n${toolResults.join("\n\n---\n\n")}`
          : "";

        const researchPrompt = `# Araştırma Görevi
**Soru:** ${query}
${contextSection}

Kapsamlı araştırma raporu hazırla. Metodolojine sadık kal.`;

        const response = await model.invoke([
          new SystemMessage(RESEARCH_EXPERT_PROMPT),
          new HumanMessage(researchPrompt),
        ]);

        let finalOutput = response.content as string;

        // 5. Self-correction (deep mode)
        if (options.selfCorrect || depth === "deep") {
          const correctionResponse = await fastModel.invoke([
            new SystemMessage("Araştırma editörü. Metinleri kalite kontrolünden geçir."),
            new HumanMessage(`Yanıt:\n\n${finalOutput}\n\n${SELF_CORRECTION_PROMPT}`),
          ]);

          const correctionContent = correctionResponse.content as string;
          if (!correctionContent.includes("ONAYLANDI")) {
            const correctedMatch = correctionContent.match(/(?:Düzeltilmiş|Düzeltme:)([\s\S]*)/i);
            if (correctedMatch && correctedMatch[1]) {
              finalOutput = correctedMatch[1].trim();
            }
          }
        }

        return {
          success: true,
          output: finalOutput,
          sources,
          metadata: {
            tokensUsed: response.usage_metadata?.total_tokens,
            executionTime: Date.now() - startTime,
            toolsCalled,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: "",
          error: error instanceof Error ? error.message : "Research failed",
          metadata: {
            executionTime: Date.now() - startTime,
            toolsCalled,
          },
        };
      }
    },
  };
}

function assessCredibility(url: string): string {
  const high = ["gov", "edu", "nature.com", "science.org", "ieee.org", "reuters.com", "bbc.com"];
  const medium = ["wikipedia.org", "medium.com", "forbes.com", "techcrunch.com"];
  const urlLower = url.toLowerCase();
  
  if (high.some(d => urlLower.includes(d))) return "Yüksek";
  if (medium.some(d => urlLower.includes(d))) return "Orta";
  return "Değerlendirilmeli";
}
