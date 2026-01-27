/**
 * Temporal Workflows
 * 
 * Workflows are durable functions that orchestrate activities.
 * They automatically handle retries, timeouts, and persistence.
 */

import { proxyActivities, sleep } from "@temporalio/workflow";
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
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

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
  
  // Parse tasks from agent output
  const parsedTasks = JSON.parse(taskResult.output);
  
  const tasks = parsedTasks.map((t: any, index: number) => ({
    id: `task-${index + 1}`,
    title: t.title,
    description: t.description || `Task: ${t.title}`,
    priority: t.priority || "medium",
    estimatedHours: t.estimatedHours || 4,
    dependencies: t.dependencies || [],
  }));
  
  // Step 2: Save tasks
  await saveTasks(input.workspaceId, tasks, input.userId);
  
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
