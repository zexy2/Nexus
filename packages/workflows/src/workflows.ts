/**
 * Temporal Workflows
 * 
 * Workflows are durable functions that orchestrate activities.
 * They automatically handle retries, timeouts, and persistence.
 */

import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "./activities";
import type {
  DocumentGenerationInput,
  DocumentGenerationOutput,
  ResearchWorkflowInput,
  ResearchOutput,
  TaskBreakdownInput,
  TaskBreakdownOutput,
  CodeGenerationInput,
  CodeGenerationOutput,
  AgentStepResult,
  PlanChangeDecision,
  PlanImpactInput,
  PlanImpactOutput,
} from "./types";

// Configure activity options with retries
const { 
  callResearchAgent,
  callWriterAgent,
  callCoderAgent,
  callTaskAgent,
  saveDocument,
  saveTasks,
  sendNotification,
  searchDocuments,
  analyzePlanImpact,
  persistPlanImpact,
  applyPlanChangeSet,
  rejectPlanChangeSet,
  expirePlanChangeSet,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

export const resolvePlanChangeSignal =
  defineSignal<[PlanChangeDecision]>("resolvePlanChange");

type ParsedTask = {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  estimatedHours: number;
  dependencies: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeTaskItem(item: unknown, index: number): ParsedTask | null {
  if (!isRecord(item)) {
    throw new Error(`Task item ${index + 1} is invalid`);
  }

  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (!title) {
    return null;
  }

  const rawPriority = typeof item.priority === "string" ? item.priority.toLowerCase() : "medium";
  const priority = ["low", "medium", "high", "urgent"].includes(rawPriority)
    ? (rawPriority as ParsedTask["priority"])
    : "medium";

  return {
    title: title.slice(0, 500),
    description: typeof item.description === "string" && item.description.trim()
      ? item.description.trim()
      : `Task: ${title}`,
    priority,
    estimatedHours: typeof item.estimatedHours === "number" && Number.isFinite(item.estimatedHours)
      ? item.estimatedHours
      : 4,
    dependencies: Array.isArray(item.dependencies)
      ? item.dependencies.filter((dep): dep is string => typeof dep === "string")
      : [],
  };
}

function coerceTaskArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (isRecord(parsed) && Array.isArray(parsed.tasks)) return parsed.tasks;
  return null;
}

function parseJsonTaskCandidates(output: string): unknown[] | null {
  const candidates = [
    output.trim(),
    ...Array.from(output.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1]?.trim() || ""),
  ];

  const arrayMatch = output.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) candidates.push(arrayMatch[0]);

  const objectMatch = output.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) candidates.push(objectMatch[0]);

  for (const candidate of candidates.filter(Boolean)) {
    try {
      const taskArray = coerceTaskArray(JSON.parse(candidate));
      if (taskArray) return taskArray;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function parseListTaskCandidates(output: string): unknown[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*]\s+\[[ xX]\]\s+/, "- "))
    .map((line) => line.match(/^(?:[-*]|\d+[.)])\s+(.+)$/)?.[1]?.trim())
    .filter((line): line is string => Boolean(line && line.length >= 3))
    .slice(0, 25)
    .map((line) => {
      const [rawTitle, ...descriptionParts] = line.split(/\s+-\s+|:\s+/);
      const title = (rawTitle || "").trim();
      const description = descriptionParts.join(": ").trim();
      return {
        title,
        description: description || `Task: ${title}`,
        priority: "medium",
        estimatedHours: 4,
        dependencies: [],
      };
    });
}

export function parseTaskBreakdown(output: string): ParsedTask[] {
  const parsedItems = parseJsonTaskCandidates(output) ?? parseListTaskCandidates(output);
  const tasks = parsedItems
    .slice(0, 25)
    .map((item, index) => normalizeTaskItem(item, index))
    .filter((item): item is ParsedTask => item !== null);

  if (tasks.length === 0) {
    throw new Error("Task agent did not return parseable tasks");
  }

  return tasks;
}

/**
 * Document Generation Workflow
 * 
 * Orchestrates multiple agents to research, outline, and write a document.
 */
export async function documentGenerationWorkflow(
  input: DocumentGenerationInput
): Promise<DocumentGenerationOutput> {
  const steps: AgentStepResult[] = [];
  
  // Step 1: Research phase
  await sendNotification(input.userId, "Starting document research...", "info");
  
  const researchResult = await callResearchAgent(input.prompt, ["documents", "web"]);
  steps.push(researchResult);
  
  // Step 2: Writing phase
  await sendNotification(input.userId, "Research complete. Writing document...", "info");
  
  const writerResult = await callWriterAgent(
    `Create a ${input.style || "formal"} document about: ${input.prompt}. 
    Use this research: ${researchResult.output}`,
    researchResult.output
  );
  steps.push(writerResult);
  
  // Step 3: Save to database
  const documentId = await saveDocument(
    input.workspaceId,
    input.title,
    writerResult.output,
    input.userId
  );
  
  // Notify completion
  await sendNotification(
    input.userId,
    `Document "${input.title}" created successfully!`,
    "success"
  );
  
  return {
    documentId,
    title: input.title,
    content: writerResult.output,
    steps,
  };
}

/**
 * Research Workflow
 * 
 * Performs deep research by searching documents and web sources.
 */
export async function researchWorkflow(
  input: ResearchWorkflowInput
): Promise<ResearchOutput> {
  const steps: AgentStepResult[] = [];
  const sources: ResearchOutput["sources"] = [];
  
  // Step 1: Search internal documents
  await sendNotification(input.userId, "Searching internal documents...", "info");
  
  const docResults = await searchDocuments(input.workspaceId, input.query, 5);
  
  for (const doc of docResults) {
    sources.push({
      title: doc.title,
      snippet: `Document match with ${(doc.similarity * 100).toFixed(0)}% relevance`,
      relevance: doc.similarity,
    });
  }
  
  // Step 2: Research agent for synthesis
  const researchResult = await callResearchAgent(
    input.query,
    input.sources || ["both"]
  );
  steps.push(researchResult);
  
  // Step 3: Deep research if requested
  if (input.depth === "deep") {
    await sleep("2 seconds");
    
    const deepResult = await callResearchAgent(
      `Expand on: ${researchResult.output}`,
      ["web"]
    );
    steps.push(deepResult);
  }
  
  await sendNotification(input.userId, "Research completed!", "success");
  
  return {
    summary: researchResult.output,
    sources,
    steps,
  };
}

/**
 * Task Breakdown Workflow
 * 
 * Analyzes a project and creates actionable tasks.
 */
export async function taskBreakdownWorkflow(
  input: TaskBreakdownInput
): Promise<TaskBreakdownOutput> {
  const steps: AgentStepResult[] = [];
  
  // Step 1: Analyze project
  await sendNotification(input.userId, "Analyzing project requirements...", "info");
  
  const taskResult = await callTaskAgent(input.projectDescription);
  steps.push(taskResult);
  
  const parsedTasks = parseTaskBreakdown(taskResult.output).map((t, index) => ({
    id: `pending-task-${index + 1}`,
    title: t.title,
    description: t.description,
    priority: t.priority,
    estimatedHours: t.estimatedHours,
    dependencies: t.dependencies,
  }));
  
  // Step 2: Save tasks
  const taskIds = await saveTasks(input.workspaceId, parsedTasks, input.userId, input.docId);
  const tasks = parsedTasks.map((task, index) => ({
    ...task,
    id: taskIds[index] || task.id,
  }));
  
  await sendNotification(
    input.userId,
    `Created ${tasks.length} tasks for your project!`,
    "success"
  );
  
  return {
    tasks,
    steps,
  };
}

export async function planImpactWorkflow(
  input: PlanImpactInput
): Promise<PlanImpactOutput> {
  const analysis = await analyzePlanImpact(input);
  const persisted = await persistPlanImpact(analysis, workflowInfo().workflowId);
  const resolution: { value: PlanChangeDecision | null } = { value: null };

  setHandler(resolvePlanChangeSignal, (decision) => {
    if (resolution.value) return;
    resolution.value = decision;
  });

  const resolved = await condition(() => resolution.value !== null, "72 hours");
  if (!resolved) {
    await expirePlanChangeSet(persisted.changeSetId, input.userId);
    return {
      changeSetId: persisted.changeSetId,
      docId: input.docId,
      versionNumber: persisted.versionNumber,
      decision: "expired",
      summary: persisted.summary,
      stats: persisted.stats,
      steps: persisted.steps,
    };
  }

  const decision = resolution.value;
  if (!decision) {
    throw new Error("Plan change resolution was not recorded");
  }

  if (decision.decision === "reject") {
    await rejectPlanChangeSet(persisted.changeSetId, decision.userId);
    return {
      changeSetId: persisted.changeSetId,
      docId: input.docId,
      versionNumber: persisted.versionNumber,
      decision: "rejected",
      summary: persisted.summary,
      stats: persisted.stats,
      steps: persisted.steps,
    };
  }

  const applied = await applyPlanChangeSet(
    persisted.changeSetId,
    decision.selectedProposalIds || [],
    decision.userId
  );

  return {
    changeSetId: persisted.changeSetId,
    docId: input.docId,
    versionNumber: persisted.versionNumber,
    decision: "applied",
    summary: persisted.summary,
    stats: persisted.stats,
    applied,
    steps: persisted.steps,
  };
}

/**
 * Code Generation Workflow
 * 
 * Generates code files based on specifications.
 */
export async function codeGenerationWorkflow(
  input: CodeGenerationInput
): Promise<CodeGenerationOutput> {
  const steps: AgentStepResult[] = [];
  const files: CodeGenerationOutput["files"] = [];
  
  // Step 1: Research best practices
  await sendNotification(input.userId, "Researching best practices...", "info");
  
  const researchResult = await callResearchAgent(
    `Best practices for ${input.language} ${input.framework || ""} development`,
    ["web"]
  );
  steps.push(researchResult);
  
  // Step 2: Generate main code
  await sendNotification(input.userId, "Generating code...", "info");
  
  const codeResult = await callCoderAgent(input.specification, input.language);
  steps.push(codeResult);
  
  files.push({
    path: `src/main.${getExtension(input.language)}`,
    content: codeResult.output,
    language: input.language,
  });
  
  // Step 3: Generate tests if requested
  if (input.includeTests) {
    await sendNotification(input.userId, "Generating tests...", "info");
    
    const testResult = await callCoderAgent(
      `Write tests for: ${codeResult.output}`,
      input.language
    );
    steps.push(testResult);
    
    files.push({
      path: `tests/main.test.${getExtension(input.language)}`,
      content: testResult.output,
      language: input.language,
    });
  }
  
  await sendNotification(
    input.userId,
    `Generated ${files.length} files!`,
    "success"
  );
  
  return {
    files,
    explanation: `Generated ${input.language} code based on specifications.`,
    steps,
  };
}

// Helper function
function getExtension(language: string): string {
  const extensions: Record<string, string> = {
    typescript: "ts",
    javascript: "js",
    python: "py",
    rust: "rs",
    go: "go",
  };
  return extensions[language.toLowerCase()] || "txt";
}
