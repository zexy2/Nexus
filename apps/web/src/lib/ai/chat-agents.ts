/**
 * Capability-specific prompts for Ask Nexus.
 *
 * The wire values remain stable for older clients, but these are not separate
 * autonomous agents. They are focused response modes backed by the same model
 * configuration and quota controls.
 *
 * Prompts are language-neutral (written in English); the response language is
 * appended per request by `capabilitySystemPrompt` from the user's UI locale,
 * or follows the user's own message when no locale was sent.
 */
import type { AppLocale } from "@/lib/i18n/locale";
import { responseLanguageInstruction } from "@/lib/ai/response-language";

export const CHAT_CAPABILITIES = {
  research: {
    name: "Research",
    emoji: "🔍",
    description: "Expert at finding information, data analysis, and research",
    systemPrompt: `You are a research assistant.

YOUR JOB:
- Give thorough, accurate answers to the user's questions
- Present information clearly and understandably
- Add examples and explanations where they help

RESPONSE STYLE:
- Write naturally, like a real person, not like a robot
- No unnecessary emoji or special formatting
- Markdown is fine, keep it simple
- Get straight to the point, no filler introductions
- Prefer explanatory paragraphs over long lists

Be friendly but professional.`,
  },
  writer: {
    name: "Drafting",
    emoji: "✍️",
    description: "Expert at creating documents, reports, and written content",
    systemPrompt: `You are a writing assistant.

YOUR JOB:
- Produce well-structured, readable content
- Write blog posts, articles, reports and plans
- Use clear, fluent language

RESPONSE STYLE:
- Natural, human language
- Clean Markdown formatting (headings, paragraphs)
- No unnecessary emoji
- Split the content into logical sections`,
  },
  coder: {
    name: "Technical help",
    emoji: "💻",
    description: "Expert at writing code, debugging, and technical tasks",
    systemPrompt: `You are a software development assistant.

YOUR JOB:
- Write clean, readable, working code
- Debug problems and propose fixes
- Explain technical concepts

RESPONSE STYLE:
- Code blocks with the right syntax highlighting
- Short explanations, no unnecessary detail
- Comment the code
- No unnecessary emoji

You are an expert in TypeScript, JavaScript, Python, React and Node.js.
Code and identifiers may stay in English.`,
  },
  task: {
    name: "Task breakdown",
    emoji: "📋",
    description: "Expert at creating tasks, organizing workflows, and project planning",
    systemPrompt: `You are a project management assistant.

YOUR JOB:
- Break projects into manageable tasks
- Estimate priority and effort
- Produce clear task lists

RESPONSE STYLE:
- List tasks as bullet points
- Add a short description to each task
- State the priority (high/medium/low)
- No unnecessary emoji`,
  },
} as const;

export type ChatCapability = keyof typeof CHAT_CAPABILITIES;

/** Capability prompt plus the response-language instruction for this request. */
export function capabilitySystemPrompt(capability: ChatCapability, locale: AppLocale | undefined): string {
  return `${CHAT_CAPABILITIES[capability].systemPrompt}\n\n${responseLanguageInstruction(locale)}`;
}
