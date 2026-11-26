import { describe, it, expect } from "vitest";
import { detectTextLocale, responseLanguageInstruction, serverCopyLocale } from "@/lib/ai/response-language";
import { CHAT_CAPABILITIES, capabilitySystemPrompt } from "@/lib/ai/chat-agents";
import { supervisorSystemPrompt } from "@/lib/ai/agent";
import { buildDocActionPrompt } from "@/lib/ai/doc-action-prompts";
import { buildPlanPrompt, buildReportPrompt } from "@/lib/ai/research-prompts";
import { authEmailCopy } from "@/lib/auth-email-copy";

describe("AI response language", () => {
  it("follows the UI locale when given, else mirrors the user", () => {
    expect(responseLanguageInstruction("en")).toMatch(/Respond in English/);
    expect(responseLanguageInstruction("tr")).toMatch(/Respond in Turkish/);
    expect(responseLanguageInstruction(undefined)).toMatch(/same language as the user's latest message/);
  });

  it("no capability or supervisor prompt hardcodes Turkish answers", () => {
    for (const capability of Object.values(CHAT_CAPABILITIES)) {
      expect(capability.systemPrompt).not.toMatch(/Türkçe|Turkish/);
    }
    expect(capabilitySystemPrompt("research", "en")).toMatch(/Respond in English/);
    expect(capabilitySystemPrompt("task", "tr")).toMatch(/Respond in Turkish/);
    expect(supervisorSystemPrompt("en")).toMatch(/Respond in English/);
    expect(supervisorSystemPrompt(undefined)).not.toMatch(/Türkçe|Turkish/);
  });

  it("doc actions and deep research ask for the UI language", () => {
    expect(buildDocActionPrompt("summarize", "hello", "en")).toMatch(/Write the result in English/);
    expect(buildDocActionPrompt("improve", "merhaba", "tr")).toMatch(/Write the result in Turkish/);
    expect(buildPlanPrompt("q", "en")).toMatch(/search queries in English/);
    expect(buildPlanPrompt("q", undefined)).toMatch(/same language as the topic/);
    expect(buildReportPrompt({ query: "q", answerSummaries: "", sourceSummaries: "", locale: "en" })).toMatch(/Respond in English/);
    expect(buildReportPrompt({ query: "q", answerSummaries: "", sourceSummaries: "", locale: undefined })).not.toMatch(/Türkçe/);
  });

  it("server copy falls back to the input language", () => {
    expect(detectTextLocale("Bu plan için görev oluştur")).toBe("tr");
    expect(detectTextLocale("Create tasks for this plan")).toBe("en");
    expect(serverCopyLocale(undefined, "Bunu kaydet lütfen")).toBe("tr");
    expect(serverCopyLocale("en", "Bunu kaydet lütfen")).toBe("en");
  });
});

describe("auth email copy", () => {
  it("uses the request locale, or is bilingual when unknown", () => {
    expect(authEmailCopy("resetPassword", "en", "https://x").subject).toBe("Nexus — Reset your password");
    expect(authEmailCopy("resetPassword", "tr", "https://x").subject).toBe("Nexus — Şifre sıfırlama");
    const both = authEmailCopy("verifyEmail", undefined, "https://x");
    expect(both.body).toContain("Verify your email address");
    expect(both.body).toContain("doğrula");
  });
});
