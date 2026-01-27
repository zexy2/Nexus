import { ChatGemini } from "../gemini";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { AgentConfig, AgentResult, TaskReference } from "../types";

/**
 * EXPERT TASK/PROJECT MANAGER AGENT
 * 
 * Senior project manager gibi çalışır:
 * - Work breakdown structure (WBS)
 * - Critical path analysis
 * - Resource optimization
 * - Risk assessment
 * - Agile/Scrum expertise
 */

const TASK_EXPERT_PROMPT = `# Kimlik ve Uzmanlık

Sen PMP sertifikalı, 12+ yıl deneyimli senior project manager'sın. Google, Amazon ve startup'larda yüzlerce projeyi başarıyla yönettirdin. Agile, Scrum, Kanban ve hibrit metodolojilerde uzmansın.

# Temel Prensipler

## 1. Work Breakdown Structure (WBS)
- Büyük hedefleri küçük, yönetilebilir parçalara böl
- Her görev max 4-8 saat olmalı
- "MECE" - Mutually Exclusive, Collectively Exhaustive
- Deliverable odaklı düşün

## 2. SMART Görevler
- **S**pecific (Spesifik): Ne yapılacak net olmalı
- **M**easurable (Ölçülebilir): Tamamlanma kriteri olmalı
- **A**chievable (Ulaşılabilir): Gerçekçi olmalı
- **R**elevant (İlgili): Ana hedefe katkı sağlamalı
- **T**ime-bound (Zamanlı): Deadline olmalı

## 3. Bağımlılık Yönetimi
- Görevler arası bağımlılıkları belirle
- Critical path'i işaretle
- Paralel yapılabilecekleri grupla
- Blocker'ları öncele

## 4. Önceliklendirme (MoSCoW)
- **Must Have**: Olmazsa olmaz
- **Should Have**: Olmalı ama ertelenebilir
- **Could Have**: Olsa iyi olur
- **Won't Have**: Bu scope'da yok

## 5. Risk Değerlendirmesi
- Her major görev için riskleri düşün
- Mitigation stratejileri öner
- Buffer time ekle

# Tahmin Prensipleri

## Effort Estimation
- Fibonacci: 1, 2, 3, 5, 8, 13, 21 saat
- Uncertainty için range ver (min-max)
- Past experience'a dayan

## Hata Kaynakları
- Optimism bias'a dikkat
- %20-30 buffer ekle
- Integration time'ı unutma
- Review/test süresini dahil et

# Yanıt Formatı

\`\`\`json
{
  "projectSummary": {
    "title": "Proje başlığı",
    "objective": "Ana hedef",
    "estimatedTotalHours": 40,
    "estimatedDuration": "2 hafta",
    "teamSize": 2
  },
  "phases": [
    {
      "name": "Phase 1: Setup",
      "tasks": [...]
    }
  ],
  "tasks": [
    {
      "id": "T1",
      "title": "Görev başlığı",
      "description": "Detaylı açıklama",
      "priority": "must-have",
      "estimatedHours": 4,
      "dependencies": [],
      "skills": ["frontend", "react"],
      "acceptanceCriteria": ["Kriter 1", "Kriter 2"],
      "risks": ["Risk 1"]
    }
  ],
  "criticalPath": ["T1", "T3", "T5"],
  "risks": [
    {
      "description": "Risk açıklaması",
      "probability": "medium",
      "impact": "high",
      "mitigation": "Önlem"
    }
  ],
  "recommendations": ["Öneri 1", "Öneri 2"]
}
\`\`\`

# Ayrıca Markdown Özeti Ver

## 📋 Proje Özeti
[Kısa özet]

## 🎯 Görevler

### Must Have
- [ ] Görev 1 (X saat)
- [ ] Görev 2 (Y saat)

### Should Have
...

## ⚠️ Riskler ve Öneriler
[Riskler ve mitigation]

## 📅 Önerilen Timeline
[Hafta/gün bazında plan]

# Dil
- Türkçe yaz
- Teknik terimler için parantez içinde İngilizce`;

const TaskOutputSchema = z.object({
  projectSummary: z.object({
    title: z.string(),
    objective: z.string(),
    estimatedTotalHours: z.number(),
    estimatedDuration: z.string(),
    teamSize: z.number().optional(),
  }).optional(),
  phases: z.array(z.object({
    name: z.string(),
    tasks: z.array(z.string()),
  })).optional(),
  tasks: z.array(z.object({
    id: z.string().optional(),
    title: z.string(),
    description: z.string(),
    priority: z.enum(["must-have", "should-have", "could-have", "high", "medium", "low"]),
    estimatedHours: z.number().optional(),
    dependencies: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    acceptanceCriteria: z.array(z.string()).optional(),
    risks: z.array(z.string()).optional(),
  })),
  criticalPath: z.array(z.string()).optional(),
  risks: z.array(z.object({
    description: z.string(),
    probability: z.string().optional(),
    impact: z.string().optional(),
    mitigation: z.string().optional(),
  })).optional(),
  recommendations: z.array(z.string()).optional(),
});

export type TaskPlanningMode = "quick" | "detailed" | "agile-sprint";

export interface TaskOptions {
  mode?: TaskPlanningMode;
  teamSize?: number;
  availableSkills?: string[];
  deadline?: string;
  existingTasks?: TaskReference[];
  includeRisks?: boolean;
}

export function createTaskAgent(config?: Partial<AgentConfig>) {
  const model = new ChatGemini({
    modelName: config?.model || "gemini-2.5-pro",
    temperature: config?.temperature || 0.3,
    maxTokens: config?.maxTokens || 16000,
  });

  return {
    name: "task",
    description: "Expert project manager with WBS, critical path analysis, and agile expertise",
    
    async execute(
      prompt: string, 
      options: TaskOptions = {}
    ): Promise<AgentResult> {
      const startTime = Date.now();
      
      try {
        const mode = options.mode || "detailed";
        const teamSize = options.teamSize || 1;
        
        // Prompt'u zenginleştir
        let enhancedPrompt = `# Proje Planlama Görevi

**İstek:** ${prompt}

**Parametreler:**
- Planlama Modu: ${mode}
- Takım Büyüklüğü: ${teamSize} kişi
${options.deadline ? `- Deadline: ${options.deadline}` : ""}
${options.availableSkills ? `- Mevcut Yetenekler: ${options.availableSkills.join(", ")}` : ""}
${options.includeRisks !== false ? "- Risk analizi dahil et" : ""}

`;

        if (options.existingTasks && options.existingTasks.length > 0) {
          enhancedPrompt += `\n**Mevcut Görevler (bağlamda kullan):**\n${JSON.stringify(options.existingTasks, null, 2)}\n`;
        }

        enhancedPrompt += `\nÖnce JSON formatında structured output ver, sonra Markdown özeti ekle.`;

        const response = await model.invoke([
          new SystemMessage(TASK_EXPERT_PROMPT),
          new HumanMessage(enhancedPrompt),
        ]);

        const content = response.content as string;
        
        // JSON'u parse etmeye çalış
        let parsedData = null;
        try {
          const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch && jsonMatch[1]) {
            const parsed = JSON.parse(jsonMatch[1]);
            parsedData = TaskOutputSchema.parse(parsed);
          } else {
            // JSON block yoksa direkt parse dene
            const directMatch = content.match(/\{[\s\S]*\}/);
            if (directMatch && directMatch[0]) {
              const parsed = JSON.parse(directMatch[0]);
              parsedData = TaskOutputSchema.parse(parsed);
            }
          }
        } catch (e) {
          console.warn("[Task] JSON parsing failed:", e);
        }

        return {
          success: true,
          output: content,
          data: parsedData,
          metadata: {
            tokensUsed: response.usage_metadata?.total_tokens,
            duration: Date.now() - startTime,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: "",
          error: error instanceof Error ? error.message : "Task planning failed",
        };
      }
    },
  };
}
