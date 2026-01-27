import { ChatGemini } from "../gemini";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentConfig, AgentResult } from "../types";

/**
 * EXPERT WRITER AGENT
 * 
 * Profesyonel yazar/editör gibi çalışır:
 * - Style adaptation (üslup adaptasyonu)
 * - Structure optimization (yapı optimizasyonu)
 * - Audience awareness (hedef kitle farkındalığı)
 * - Self-editing (kendi düzeltme)
 */

const WRITER_EXPERT_PROMPT = `# Kimlik ve Uzmanlık

Sen ödüllü bir yazar ve editörsün. New York Times bestseller listesinde kitapların oldu, Harvard Business Review'da makalelerin yayınlandı, TED konuşmaları yaptın. Her türde ve formatta yazabilirsin.

# Yazarlık Prensiplerin

## 1. Clarity (Netlik)
- Her cümlenin bir amacı olsun
- Gereksiz kelimelerden kaçın
- Aktif cümleler kur
- "Show, don't tell" - göster, anlatma

## 2. Structure (Yapı)
- Güçlü açılış - okuyucuyu yakala
- Mantıksal akış - her paragraf bir öncekine bağlansın
- Güçlü kapanış - akılda kalsın
- Başlıklar ve alt başlıklar - taranabilirlik

## 3. Voice (Ses)
- Tutarlı üslup
- Hedef kitleye uygun ton
- Özgün ifadeler
- Klişelerden kaçın

## 4. Engagement (Etkileşim)
- Sorular sor
- Hikayeler anlat
- Somut örnekler ver
- Duygusal bağ kur

# Yazı Türleri ve Yaklaşımlar

## Teknik Dokümantasyon
- Açık ve net olun
- Adım adım talimatlar
- Kod örnekleri ile destekle
- Jargonu açıkla

## Blog Yazısı
- Hook ile başla
- Kişisel deneyim ekle
- Pratik tavsiyeler ver
- Call-to-action ile bitir

## Rapor
- Executive summary ile başla
- Verilerle destekle
- Görselleştirme öner
- Sonuç ve öneriler

## E-posta
- Kısa ve öz
- Net konu satırı
- Tek bir aksiyon
- Profesyonel ton

## Sosyal Medya
- Dikkat çekici açılış
- Kısa ve vurucu
- Hashtag stratejisi
- Görsel öneri

# Düzenleme Süreci

Her yazı için 3 geçiş yap:

1. **İlk Taslak**: Fikirleri aktar, mükemmellik arama
2. **Yapısal Düzenleme**: Organizasyon, akış, eksikler
3. **Son Düzenleme**: Dil, gramer, ton, son rötuşlar

# Yanıt Formatı

\`\`\`
## 📝 [Yazı Başlığı]

[İçerik]

---

### ✏️ Yazarlık Notları
- Hedef kitle: [Kim için yazıldı]
- Ton: [Profesyonel/Samimi/Akademik vb.]
- Okuma süresi: [X dakika]
- Önerilen görseller: [Varsa]
\`\`\`

# Dil
- Türkçe yaz (aksi belirtilmedikçe)
- Akıcı ve doğal ol
- Hedef kitleye uygun terminoloji kullan`;

const SELF_EDIT_PROMPT = `Yazını editör gözüyle oku:

1. Hook güçlü mü? İlk cümle okuyucuyu yakalıyor mu?
2. Akış var mı? Paragraflar birbirine bağlı mı?
3. Gereksiz kelimeler var mı? %20 kısaltabilir misin?
4. Kapanış güçlü mü? Akılda kalıyor mu?
5. Hedef kitleye uygun mu?

Düzeltilmiş versiyonu yaz veya "ONAYLANDI" de.`;

export type WritingStyle = "professional" | "casual" | "academic" | "creative" | "technical";
export type ContentType = "article" | "report" | "email" | "documentation" | "social" | "story";

export interface WriterOptions {
  style?: WritingStyle;
  contentType?: ContentType;
  targetAudience?: string;
  wordCount?: number;
  selfEdit?: boolean;
  includeMetadata?: boolean;
}

export function createWriterAgent(config?: Partial<AgentConfig>) {
  const model = new ChatGemini({
    modelName: config?.model || "gemini-2.5-pro",
    temperature: config?.temperature || 0.7,
    maxTokens: config?.maxTokens || 16000,
  });

  const editModel = new ChatGemini({
    modelName: "gemini-2.5-flash",
    temperature: 0.3,
    maxTokens: 8000,
  });

  return {
    name: "writer",
    description: "Expert writer with style adaptation, structure optimization, and self-editing capabilities",
    
    async execute(
      prompt: string, 
      options: WriterOptions = {},
      existingContent?: string
    ): Promise<AgentResult> {
      const startTime = Date.now();
      
      try {
        // Yazı parametrelerini belirle
        const style = options.style || "professional";
        const contentType = options.contentType || "article";
        const targetAudience = options.targetAudience || "genel okuyucu";
        const wordCount = options.wordCount;

        // Prompt'u zenginleştir
        let enhancedPrompt = `# Yazı Görevi

**İstek:** ${prompt}

**Parametreler:**
- Üslup: ${style}
- Tür: ${contentType}
- Hedef Kitle: ${targetAudience}
${wordCount ? `- Hedef Kelime Sayısı: ~${wordCount}` : ""}

`;

        if (existingContent) {
          enhancedPrompt += `\n**Mevcut İçerik (düzenle/geliştir):**\n${existingContent}\n`;
        }

        // İlk taslak
        const response = await model.invoke([
          new SystemMessage(WRITER_EXPERT_PROMPT),
          new HumanMessage(enhancedPrompt),
        ]);

        let finalOutput = response.content as string;

        // Self-editing (varsayılan açık)
        if (options.selfEdit !== false) {
          const editResponse = await editModel.invoke([
            new SystemMessage("Sen titiz bir editörsün. Metinleri geliştirirsin."),
            new HumanMessage(`Metin:\n\n${finalOutput}\n\n${SELF_EDIT_PROMPT}`),
          ]);

          const editContent = editResponse.content as string;
          if (!editContent.includes("ONAYLANDI")) {
            // Düzeltilmiş versiyonu bul
            const lines = editContent.split('\n');
            const startIndex = lines.findIndex(l => 
              l.startsWith('#') || l.startsWith('##') || l.length > 100
            );
            if (startIndex >= 0) {
              finalOutput = lines.slice(startIndex).join('\n');
            }
          }
        }

        // Metadata ekle
        if (options.includeMetadata !== false) {
          const wordCountActual = finalOutput.split(/\s+/).length;
          const readingTime = Math.ceil(wordCountActual / 200);
          
          if (!finalOutput.includes("Yazarlık Notları")) {
            finalOutput += `\n\n---\n\n### ✏️ Yazarlık Notları
- Hedef kitle: ${targetAudience}
- Ton: ${style}
- Okuma süresi: ~${readingTime} dakika
- Kelime sayısı: ${wordCountActual}`;
          }
        }

        return {
          success: true,
          output: finalOutput,
          metadata: {
            tokensUsed: response.usage_metadata?.total_tokens,
            duration: Date.now() - startTime,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: "",
          error: error instanceof Error ? error.message : "Writing failed",
        };
      }
    },
  };
}
