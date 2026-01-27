import { ChatGemini } from "../gemini";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentConfig, AgentResult } from "../types";

/**
 * EXPERT CODER AGENT
 * 
 * Senior software engineer gibi çalışır:
 * - Clean code principles
 * - Design patterns
 * - Security awareness
 * - Performance optimization
 * - Test-driven mindset
 */

const CODER_EXPERT_PROMPT = `# Kimlik ve Uzmanlık

Sen 15+ yıl deneyimli senior software engineer'sın. FAANG şirketlerinde çalıştın, açık kaynak projelere katkıda bulundun, birçok dil ve framework'te uzmansın.

# Temel Prensipler

## 1. Clean Code
- Okunabilirlik her şeyden önce gelir
- Self-documenting code yaz
- DRY (Don't Repeat Yourself)
- SOLID prensipleri uygula
- Küçük, tek sorumlu fonksiyonlar

## 2. Security First
- Input validation her zaman
- SQL injection, XSS önleme
- Secret'ları hardcode etme
- Principle of least privilege
- Error message'larda bilgi sızdırma

## 3. Performance Awareness
- Big O complexity düşün
- Gereksiz re-render önle
- Lazy loading kullan
- Caching stratejileri
- Database query optimization

## 4. Error Handling
- Graceful degradation
- Meaningful error messages
- Proper logging
- Recovery mechanisms

## 5. Testing Mindset
- Test edilebilir kod yaz
- Edge case'leri düşün
- Mock stratejileri
- Integration test farkındalığı

# Desteklenen Diller ve Frameworkler

**Frontend:**
- TypeScript/JavaScript (React, Next.js, Vue)
- HTML5, CSS3, Tailwind

**Backend:**
- Node.js, Python, Go, Rust
- Express, FastAPI, Gin

**Database:**
- PostgreSQL, MongoDB, Redis
- Drizzle, Prisma, SQLAlchemy

**DevOps:**
- Docker, Kubernetes
- CI/CD, GitHub Actions

# Kod Yazma Süreci

1. **Anlama**: Sorunu tam anla, varsayımları sor
2. **Tasarım**: Yaklaşımı planla, trade-off'ları değerlendir
3. **Uygulama**: Clean code ile implement et
4. **Review**: Kendi kodunu gözden geçir
5. **Açıklama**: Neden bu yaklaşımı seçtiğini açıkla

# Yanıt Formatı

## 🎯 Yaklaşım
[Seçilen yaklaşımın kısa açıklaması]

## 💻 Kod

\`\`\`[language]
// Kod burada
\`\`\`

## 📝 Açıklamalar
- Neden bu yaklaşım seçildi
- Dikkat edilmesi gerekenler
- Alternatif yaklaşımlar (varsa)

## ⚠️ Güvenlik/Performans Notları
- Varsa güvenlik considerasyonları
- Performans ipuçları

## 🧪 Test Önerileri
- Bu kod nasıl test edilmeli

# Dil
- Açıklamaları Türkçe yaz
- Kod ve değişken isimleri İngilizce
- Yorumlar İngilizce (standart pratik)`;

const CODE_REVIEW_PROMPT = `Kendi kodunu senior engineer gözüyle review et:

1. **Okunabilirlik**: Kod kendini açıklıyor mu?
2. **Güvenlik**: Açık var mı?
3. **Performans**: İyileştirme var mı?
4. **Edge Cases**: Eksik case var mı?
5. **Best Practices**: Standard'lara uygun mu?

Sorun varsa düzelt, yoksa "LGTM" (Looks Good To Me) yaz.`;

export type ProgrammingLanguage = 
  | "typescript" | "javascript" | "python" | "go" | "rust" 
  | "java" | "csharp" | "sql" | "html" | "css" | "bash";

export type CodeTask = 
  | "implement" | "refactor" | "debug" | "review" | "explain" 
  | "optimize" | "test" | "convert";

export interface CoderOptions {
  language?: ProgrammingLanguage;
  task?: CodeTask;
  framework?: string;
  existingCode?: string;
  selfReview?: boolean;
  includeTests?: boolean;
}

export function createCoderAgent(config?: Partial<AgentConfig>) {
  const model = new ChatGemini({
    modelName: config?.model || "gemini-2.5-pro",
    temperature: config?.temperature || 0.2, // Düşük = daha tutarlı kod
    maxTokens: config?.maxTokens || 16000,
  });

  const reviewModel = new ChatGemini({
    modelName: "gemini-2.5-flash",
    temperature: 0.1,
    maxTokens: 8000,
  });

  return {
    name: "coder",
    description: "Expert software engineer with clean code, security, and performance expertise",
    
    async execute(
      prompt: string, 
      options: CoderOptions = {}
    ): Promise<AgentResult> {
      const startTime = Date.now();
      
      try {
        const language = options.language || "typescript";
        const task = options.task || "implement";
        const framework = options.framework;

        // Prompt'u zenginleştir
        let enhancedPrompt = `# Kodlama Görevi

**İstek:** ${prompt}

**Parametreler:**
- Dil: ${language}
- Görev: ${task}
${framework ? `- Framework: ${framework}` : ""}
`;

        if (options.existingCode) {
          enhancedPrompt += `\n**Mevcut Kod:**\n\`\`\`${language}\n${options.existingCode}\n\`\`\`\n`;
        }

        if (options.includeTests) {
          enhancedPrompt += `\n**Not:** Test kodları da yaz.\n`;
        }

        // Ana kod üretimi
        const response = await model.invoke([
          new SystemMessage(CODER_EXPERT_PROMPT),
          new HumanMessage(enhancedPrompt),
        ]);

        let finalOutput = response.content as string;

        // Self-review
        if (options.selfReview !== false && task !== "explain") {
          const reviewResponse = await reviewModel.invoke([
            new SystemMessage("Sen titiz bir code reviewer'sın."),
            new HumanMessage(`Kod:\n\n${finalOutput}\n\n${CODE_REVIEW_PROMPT}`),
          ]);

          const reviewContent = reviewResponse.content as string;
          if (!reviewContent.includes("LGTM")) {
            // Düzeltilmiş kodu bul
            const codeBlockMatch = reviewContent.match(/```[\s\S]*?```/g);
            if (codeBlockMatch && codeBlockMatch.length > 0) {
              // Review'dan gelen düzeltilmiş kodu entegre et
              const reviewNotes = reviewContent.replace(/```[\s\S]*?```/g, '').trim();
              if (reviewNotes) {
                finalOutput += `\n\n---\n\n### 🔍 Code Review Notları\n${reviewNotes}`;
              }
            }
          }
        }

        // Kod bloklarını say
        const codeBlocks = (finalOutput.match(/```/g) || []).length / 2;

        return {
          success: true,
          output: finalOutput,
          data: { language, task, codeBlocksCount: codeBlocks },
          metadata: {
            tokensUsed: response.usage_metadata?.total_tokens,
            duration: Date.now() - startTime,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: "",
          error: error instanceof Error ? error.message : "Coding failed",
        };
      }
    },
  };
}
