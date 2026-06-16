import { NextRequest } from "next/server";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import {
  aiUnavailableResponse,
  enforceAiBudget,
  getAiProviderStatus,
  writeAuditLog,
} from "@/lib/production-guardrails";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ai/write-stream
 * Stream AI-generated content for document writing
 */
export async function POST(request: NextRequest) {
  try {
    const protection = await protectRoute(request, {
      requireAuth: true,
      rateLimit: RATE_LIMITS.chat,
    });
    if (!protection.success) {
      return protection.response;
    }
    if (!protection.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const aiBudget = await enforceAiBudget({
      userId: protection.user.id,
      email: protection.user.email,
      kind: "chat",
    });
    if (!aiBudget.ok) {
      return aiBudget.response;
    }

    const providerStatus = getAiProviderStatus();
    if (!providerStatus.geminiAvailable) {
      return aiUnavailableResponse("Gemini writing is not configured on this server.");
    }

    const body = await request.json();
    const { prompt, agentType, existingContent } = body;

    if (!prompt) {
      return new Response("prompt is required", { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return aiUnavailableResponse("Gemini writing is not configured on this server.");
    }

    await writeAuditLog({
      userId: protection.user.id,
      event: "ai.write_stream",
      metadata: { agentType: agentType || "assistant", hasExistingContent: Boolean(existingContent) },
      request,
    });

    // Build the prompt based on agent type
    let systemPrompt = "";
    switch (agentType) {
      case "writer":
        systemPrompt = `Sen profesyonel bir yazar ajansın. Kullanıcının isteğine göre kaliteli, iyi yapılandırılmış içerik üretiyorsun.

Kurallar:
- Markdown formatında yaz
- Başlıklar için # kullan
- Listeler için - veya 1. kullan
- Önemli noktaları **kalın** yap
- Paragraflar arası boş satır bırak
- Türkçe yaz (kullanıcı başka dilde isterse o dilde)`;
        break;
      case "researcher":
        systemPrompt = `Sen araştırmacı bir ajansın. Kullanıcının konusu hakkında kapsamlı ve doğru bilgi sağlıyorsun.

Kurallar:
- Bilgileri kaynaklarıyla birlikte sun
- Objektif ve tarafsız ol
- Markdown formatında yaz
- Konuyu alt başlıklarla organize et`;
        break;
      case "coder":
        systemPrompt = `Sen uzman bir yazılım geliştirici ajansın. Kod yazıyor ve teknik açıklamalar yapıyorsun.

Kurallar:
- Kod bloklarını \`\`\` ile işaretle
- Dili belirt: \`\`\`typescript, \`\`\`python vb.
- Kodu açıklayan yorumlar ekle
- Best practice'leri takip et`;
        break;
      default:
        systemPrompt = `Sen yardımcı bir AI asistansın. Kullanıcının isteğini en iyi şekilde yerine getiriyorsun.`;
    }

    // Build user message
    let userMessage = prompt;
    if (existingContent) {
      userMessage = `Mevcut içerik:\n\n${existingContent}\n\n---\n\nDevam talimatı: ${prompt}`;
    }

    // Call Gemini with streaming
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\n---\n\n${userMessage}` }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Gemini streaming error:", error);
      await writeAuditLog({
        userId: protection.user.id,
        event: "ai.write_stream",
        status: "failed",
        metadata: { status: response.status, error: error.slice(0, 500) },
        request,
      });
      return aiUnavailableResponse(`Gemini writing failed with status ${response.status}.`);
    }

    // Transform Gemini SSE to our format
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split("\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (content) {
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`)
                );
              }
            } catch {
              // Skip unparseable chunks
            }
          }
        }
      },
      flush(controller) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      },
    });

    // Pipe through transform
    const transformedStream = response.body?.pipeThrough(transformStream);

    return new Response(transformedStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error) {
    console.error("AI write stream error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
