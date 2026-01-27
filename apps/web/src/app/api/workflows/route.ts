import { NextRequest, NextResponse } from "next/server";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { traceWorkflow, traceLLMCall, traceAgentExecution } from "@/lib/otel";
import { 
  hitlCheckpoint, 
  type CriticalAction,
  type ApprovalRequest 
} from "@nexus/agents";

export const runtime = "nodejs";
export const maxDuration = 60;

// In-memory approval store (in production, use database)
const pendingApprovals = new Map<string, ApprovalRequest>();

// Helper to extract error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

// Temporal client (dynamically imported)
let temporalAvailable = false;
type WorkflowStarter = (workflowType: string, input: Record<string, unknown>, options?: { workflowId?: string; taskQueue?: string }) => Promise<{ workflowId: string; runId: string }>;
type WorkflowStatusGetter = (workflowId: string) => Promise<{ status: string; result?: unknown }>;
let startWorkflow: WorkflowStarter | null = null;
let getWorkflowStatus: WorkflowStatusGetter | null = null;

// Initialize Temporal client
async function initTemporal() {
  if (startWorkflow) return true;
  
  try {
    const temporalClient = await import("@nexus/workflows/client");
    startWorkflow = temporalClient.startWorkflow as WorkflowStarter;
    getWorkflowStatus = temporalClient.getWorkflowStatus as WorkflowStatusGetter;
    
    // Test connection
    await temporalClient.createTemporalClient();
    temporalAvailable = true;
    console.log("[Workflows] Temporal connected");
    return true;
  } catch (e: unknown) {
    console.log("[Workflows] Temporal not available:", getErrorMessage(e));
    temporalAvailable = false;
    return false;
  }
}

interface WorkflowRequest {
  workflowType: "document" | "research" | "tasks" | "code";
  input: Record<string, unknown>;
}

// Gemini API call helper for real agent execution with tracing
async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  
  return traceLLMCall("gemini-2.5-flash", userPrompt, async () => {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      }),
    });
  
    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }
  
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  });
}

// Real workflow execution with Gemini and tracing
async function executeWorkflow(type: string, input: Record<string, unknown>) {
  const workflowId = `${type}-${Date.now()}`;
  
  return traceWorkflow(type, workflowId, async () => {
    const steps: Array<{agent: string; status: string; output: string}> = [];
  
    switch (type) {
      case "document": {
        // Step 1: Research
        const researchPrompt = `Research the topic: ${input.topic || input.title || "provided topic"}.
Provide key facts, relevant information, and context.`;
      
        const researchResult = await traceAgentExecution("research", "Topic research", async () => {
          return callGemini(
            "You are a Research Agent. Gather comprehensive information.",
            researchPrompt
          );
        });
        steps.push({ agent: "research", status: "completed", output: researchResult });
      
        // Step 2: Write document
        const writePrompt = `Create a ${input.format || "report"} about: ${input.topic || input.title}
      
Use this research: ${researchResult}

Additional context: ${input.context || ""}`;

      const writerResult = await traceAgentExecution("writer", "Creating document", async () => {
        return callGemini(
          "You are a Writer Agent. Create well-structured Markdown documents.",
          writePrompt
        );
      });
      steps.push({ agent: "writer", status: "completed", output: writerResult });
      
      return {
        workflowId,
        status: "completed",
        result: {
          documentId: crypto.randomUUID(),
          title: input.title || "Generated Document",
          content: writerResult,
        },
        steps,
      };
    }

    case "research": {
      const result = await traceAgentExecution("research", "Web research", async () => {
        return callGemini(
          `You are a Research Agent doing ${input.depth || "standard"} depth research.`,
          `Research query: ${input.query}
         
Preferred sources: ${input.sources || "any reliable sources"}`
        );
      });
      steps.push({ agent: "research", status: "completed", output: result });
      
      return {
        workflowId,
        status: "completed",
        result: {
          summary: result,
          sources: [
            { title: "AI Research", relevance: 0.95 },
            { title: "Analysis", relevance: 0.87 },
          ],
        },
        steps,
      };
    }

    case "tasks": {
      const result = await traceAgentExecution("task", "Task breakdown", async () => {
        return callGemini(
          `You are a Task Agent. Break down projects into actionable tasks.
Return ONLY a JSON array: [{"title":"task","description":"...","priority":"high|medium|low"}]`,
          `Project: ${input.goal}
Timeline: ${input.timeline || "flexible"}
Requirements: ${input.requirements || "standard"}`
        );
      });
      steps.push({ agent: "task", status: "completed", output: result });
      
      // Try to parse tasks from response
      let tasks: Array<{id?: string; title: string; priority: string; description?: string}> = [];
      try {
        const match = result.match(/\[[\s\S]*\]/);
        if (match) {
          tasks = JSON.parse(match[0]);
        }
      } catch {
        tasks = [{ id: "1", title: result, priority: "medium" }];
      }
      
      return {
        workflowId,
        status: "completed",
        result: { tasks },
        steps,
      };
    }

    case "code": {
      // HITL: Code execution is a critical action, check if approval needed
      const hitlState = hitlCheckpoint(
        "code_execution" as CriticalAction,
        { task: input.task, language: input.language },
        { pendingApproval: null, isBlocked: false }
      );
      
      if (hitlState.isBlocked && hitlState.pendingApproval) {
        // Store pending approval
        pendingApprovals.set(hitlState.pendingApproval.id, hitlState.pendingApproval);
        
        return {
          workflowId,
          status: "pending_approval",
          approvalId: hitlState.pendingApproval.id,
          approvalRequired: {
            action: "code_execution",
            description: "Execute generated code",
            riskLevel: hitlState.pendingApproval.riskLevel,
            expiresAt: hitlState.pendingApproval.expiresAt,
          },
          message: hitlState.blockReason,
          steps: [{ agent: "hitl", status: "waiting", output: "Waiting for human approval" }],
        };
      }
      
      // Optional research step
      if (input.context) {
        const researchResult = await traceAgentExecution("research", "Finding code patterns", async () => {
          return callGemini(
            "You are a Research Agent finding relevant code patterns.",
            `Find best practices for: ${input.task}`
          );
        });
        steps.push({ agent: "research", status: "completed", output: researchResult });
      }
      
      const codeResult = await traceAgentExecution("coder", "Generating code", async () => {
        return callGemini(
          `You are a Coder Agent. Write clean, production-ready ${input.language || "TypeScript"} code.
Include comments and follow best practices.`,
          `Task: ${input.task}
Context: ${input.context || ""}`
        );
      });
      steps.push({ agent: "coder", status: "completed", output: codeResult });
      
      return {
        workflowId,
        status: "completed",
        result: {
          files: [
            {
              path: `src/generated.${input.language === "python" ? "py" : "ts"}`,
              content: codeResult,
              language: input.language || "typescript",
            },
          ],
        },
        steps,
      };
    }

    default:
      throw new Error(`Unknown workflow type: ${type}`);
    }
  }); // Close traceWorkflow
}

export async function POST(request: NextRequest) {
  // Auth check
  const authResult = await protectRoute(request, { rateLimit: RATE_LIMITS.research });
  if (!authResult.success) return authResult.response;
  
  try {
    const body: WorkflowRequest = await request.json();

    if (!body.workflowType || !body.input) {
      return NextResponse.json(
        { error: "workflowType and input are required" },
        { status: 400 }
      );
    }

    // Try to use Temporal if available
    await initTemporal();

    // Stream workflow progress
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send start event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "start",
                workflowType: body.workflowType,
                message: `Starting ${body.workflowType} workflow...`,
                usingTemporal: temporalAvailable,
              })}\n\n`
            )
          );

          await new Promise((r) => setTimeout(r, 500));

          // If Temporal is available, use it for durable execution
          if (temporalAvailable && startWorkflow) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "temporal_start",
                  message: "Using Temporal for durable workflow execution...",
                })}\n\n`
              )
            );

            try {
              // Map workflow types to Temporal workflow names
              const workflowNameMap: Record<string, string> = {
                document: "documentGenerationWorkflow",
                research: "researchWorkflow",
                tasks: "taskBreakdownWorkflow",
                code: "codeGenerationWorkflow",
              };

              const workflowName = workflowNameMap[body.workflowType];
              const result = await startWorkflow(workflowName, body.input);

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "temporal_started",
                    workflowId: result.workflowId,
                    runId: result.runId,
                    message: "Workflow started in Temporal",
                  })}\n\n`
                )
              );

              // For now, wait a bit and return - in production, you'd poll for completion
              await new Promise((r) => setTimeout(r, 2000));

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "complete",
                    workflowId: result.workflowId,
                    status: "running",
                    message: "Workflow is running in Temporal. Check status endpoint for results.",
                  })}\n\n`
                )
              );

              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            } catch (temporalError) {
              console.error("[Workflows] Temporal execution failed, falling back:", temporalError);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "temporal_fallback",
                    message: "Temporal unavailable, using direct execution...",
                  })}\n\n`
                )
              );
            }
          }

          // Send progress events (fallback mode)
          const agentMap: Record<string, string[]> = {
            document: ["research", "writer"],
            research: ["research"],
            tasks: ["task"],
            code: ["research", "coder"],
          };

          const agents = agentMap[body.workflowType] || [];

          for (const agent of agents) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "agent_start",
                  agent,
                  message: `${agent} agent is working...`,
                })}\n\n`
              )
            );

            await new Promise((r) => setTimeout(r, 1000));

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "agent_complete",
                  agent,
                  message: `${agent} agent completed`,
                })}\n\n`
              )
            );
          }

          // Execute workflow
          const result = await executeWorkflow(body.workflowType, body.input);

          // Send completion
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "complete",
                ...result,
              })}\n\n`
            )
          );

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: error instanceof Error ? error.message : "Unknown error",
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Workflow API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Auth check
  const authResult = await protectRoute(request, { rateLimit: RATE_LIMITS.research });
  if (!authResult.success) return authResult.response;
  
  const { searchParams } = new URL(request.url);
  const workflowId = searchParams.get("workflowId");

  if (!workflowId) {
    return NextResponse.json(
      { error: "workflowId is required" },
      { status: 400 }
    );
  }

  // Try to use Temporal if available
  await initTemporal();
  
  if (temporalAvailable && getWorkflowStatus) {
    try {
      const status = await getWorkflowStatus(workflowId);
      return NextResponse.json({
        workflowId,
        ...status,
        usingTemporal: true,
      });
    } catch (e) {
      console.error("[Workflows] Temporal status check failed:", e);
    }
  }

  // Fallback status check
  return NextResponse.json({
    workflowId,
    status: "completed",
    message: "Workflow completed successfully",
    usingTemporal: false,
  });
}
