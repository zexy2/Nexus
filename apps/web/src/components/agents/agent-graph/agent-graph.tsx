'use client';

import { useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion } from 'framer-motion';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Eye, 
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SupervisorNode, WorkerNode } from './nodes';
import { AnimatedEdge } from './edges';
import { InspectorPanel, type AgentLog } from './inspector-panel';

// Custom node types
const nodeTypes = {
  supervisor: SupervisorNode,
  worker: WorkerNode,
};

// Custom edge types
const edgeTypes = {
  animated: AnimatedEdge,
};

// Initial nodes configuration
const initialNodes: Node[] = [
  {
    id: 'supervisor',
    type: 'supervisor',
    position: { x: 400, y: 100 },
    data: {
      label: 'Supervisor Agent',
      status: 'idle',
      currentTask: null,
      agentsCoordinated: 3,
    },
  },
  {
    id: 'researcher',
    type: 'worker',
    position: { x: 100, y: 350 },
    data: {
      label: 'Researcher',
      type: 'researcher',
      status: 'idle',
      currentTask: null,
    },
  },
  {
    id: 'writer',
    type: 'worker',
    position: { x: 400, y: 350 },
    data: {
      label: 'Writer',
      type: 'writer',
      status: 'idle',
      currentTask: null,
    },
  },
  {
    id: 'coder',
    type: 'worker',
    position: { x: 700, y: 350 },
    data: {
      label: 'Coder',
      type: 'coder',
      status: 'idle',
      currentTask: null,
    },
  },
];

// Initial edges configuration
const initialEdges: Edge[] = [
  {
    id: 'supervisor-researcher',
    source: 'supervisor',
    target: 'researcher',
    type: 'animated',
    data: { status: 'idle', label: 'Research' },
  },
  {
    id: 'supervisor-writer',
    source: 'supervisor',
    target: 'writer',
    type: 'animated',
    data: { status: 'idle', label: 'Write' },
  },
  {
    id: 'supervisor-coder',
    source: 'supervisor',
    target: 'coder',
    type: 'animated',
    data: { status: 'idle', label: 'Code' },
  },
];

// Static workflow visualizer preview. Real workflow history is shown in the Agents page.
const workflowSteps = [
  {
    nodes: { supervisor: { status: 'working', currentTask: 'Analyzing request...' } },
    edges: {},
    log: {
      agentId: 'supervisor',
      agentName: 'Supervisor Agent',
      agentType: 'supervisor' as const,
      type: 'thought' as const,
      message: 'User request received: "Create a blog post about Next.js 15 features"',
    },
  },
  {
    nodes: { supervisor: { status: 'working', currentTask: 'Planning delegation...' } },
    edges: {},
    log: {
      agentId: 'supervisor',
      agentName: 'Supervisor Agent',
      agentType: 'supervisor' as const,
      type: 'thought' as const,
      message: 'Breaking down task:\n1. Research Next.js 15 features\n2. Write blog content\n3. Generate code examples',
    },
  },
  {
    nodes: { researcher: { status: 'working', currentTask: 'Searching documentation...', progress: 20 } },
    edges: { 'supervisor-researcher': { status: 'active' } },
    log: {
      agentId: 'supervisor',
      agentName: 'Supervisor Agent',
      agentType: 'supervisor' as const,
      type: 'delegation' as const,
      message: 'Delegating research task to Researcher Agent',
    },
  },
  {
    nodes: { researcher: { status: 'working', currentTask: 'Analyzing Next.js docs...', progress: 60 } },
    edges: {},
    log: {
      agentId: 'researcher',
      agentName: 'Researcher',
      agentType: 'researcher' as const,
      type: 'action' as const,
      message: 'Search query: "Next.js 15 new features server components"',
    },
  },
  {
    nodes: { researcher: { status: 'success', currentTask: null, progress: 100 } },
    edges: { 'supervisor-researcher': { status: 'success' } },
    log: {
      agentId: 'researcher',
      agentName: 'Researcher',
      agentType: 'researcher' as const,
      type: 'result' as const,
      message: 'Found 5 key features:\n• Partial Prerendering\n• Server Actions improvements\n• Enhanced caching\n• Turbopack stable\n• React 19 support',
    },
  },
  {
    nodes: { 
      writer: { status: 'working', currentTask: 'Drafting introduction...', progress: 30 },
      researcher: { status: 'idle', currentTask: null },
    },
    edges: { 
      'supervisor-researcher': { status: 'idle' },
      'supervisor-writer': { status: 'active' },
    },
    log: {
      agentId: 'supervisor',
      agentName: 'Supervisor Agent',
      agentType: 'supervisor' as const,
      type: 'delegation' as const,
      message: 'Passing research to Writer Agent for content creation',
    },
  },
  {
    nodes: { writer: { status: 'working', currentTask: 'Writing main content...', progress: 70 } },
    edges: {},
    log: {
      agentId: 'writer',
      agentName: 'Writer',
      agentType: 'writer' as const,
      type: 'action' as const,
      message: 'Generating blog post structure with engaging intro...',
    },
  },
  {
    nodes: { 
      writer: { status: 'success', currentTask: null, progress: 100 },
      coder: { status: 'working', currentTask: 'Creating code snippets...', progress: 40 },
    },
    edges: { 
      'supervisor-writer': { status: 'success' },
      'supervisor-coder': { status: 'active' },
    },
    log: {
      agentId: 'writer',
      agentName: 'Writer',
      agentType: 'writer' as const,
      type: 'result' as const,
      message: 'Blog post draft complete (1,200 words)',
    },
  },
  {
    nodes: { coder: { status: 'working', currentTask: 'Adding examples...', progress: 80 } },
    edges: {},
    log: {
      agentId: 'coder',
      agentName: 'Coder',
      agentType: 'coder' as const,
      type: 'action' as const,
      message: 'Generating TypeScript code examples for Server Actions',
    },
  },
  {
    nodes: { 
      coder: { status: 'success', currentTask: null, progress: 100 },
      supervisor: { status: 'success', currentTask: 'Task complete!' },
    },
    edges: { 'supervisor-coder': { status: 'success' } },
    log: {
      agentId: 'supervisor',
      agentName: 'Supervisor Agent',
      agentType: 'supervisor' as const,
      type: 'result' as const,
      message: 'All tasks completed successfully!\nBlog post ready for review.',
    },
  },
];

interface AgentGraphProps {
  className?: string;
}

export function AgentGraph({ className }: AgentGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  // Reset workflow
  const resetWorkflow = useCallback(() => {
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentStep(0);
    setNodes(initialNodes);
    setEdges(initialEdges);
    setLogs([]);
  }, [setNodes, setEdges]);

  // Apply workflow step
  const applyStep = useCallback((stepIndex: number) => {
    const step = workflowSteps[stepIndex];
    if (!step) return;

    // Update nodes
    setNodes((nds) =>
      nds.map((node) => {
        const update = step.nodes[node.id as keyof typeof step.nodes];
        if (update) {
          return {
            ...node,
            data: { ...node.data, ...update },
          };
        }
        return node;
      })
    );

    // Update edges
    setEdges((eds) =>
      eds.map((edge) => {
        const update = step.edges[edge.id as keyof typeof step.edges];
        if (update) {
          return {
            ...edge,
            data: { ...edge.data, ...update },
          };
        }
        return edge;
      })
    );

    // Add log
    if (step.log) {
      setLogs((prev) => [
        ...prev,
        {
          ...step.log,
          id: `log-${Date.now()}-${stepIndex}`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [setNodes, setEdges]);

  // Auto-play workflow
  useEffect(() => {
    if (!isPlaying || isPaused) return;

    if (currentStep >= workflowSteps.length) {
      const stopTimer = setTimeout(() => setIsPlaying(false), 0);
      return () => clearTimeout(stopTimer);
    }

    const timer = setTimeout(() => {
      applyStep(currentStep);
      setCurrentStep((prev) => prev + 1);
    }, 1500);

    return () => clearTimeout(timer);
  }, [isPlaying, isPaused, currentStep, applyStep]);

  // Handle node click
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedAgent(node.id);
    setInspectorOpen(true);
  }, []);

  return (
    <div className={cn('relative w-full h-full', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        className="bg-zinc-950"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255, 255, 255, 0.1)"
        />
        <Controls 
          className="!bg-zinc-900 !border-zinc-700 !rounded-lg overflow-hidden [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-700"
        />

        <Panel position="top-left" className="mt-4 ml-4">
          <div className="rounded-full border border-zinc-700 bg-zinc-900/90 px-3 py-1 text-xs text-zinc-300 shadow-xl backdrop-blur-xl">
            Workflow visualizer preview
          </div>
        </Panel>

        {/* Control Panel */}
        <Panel position="bottom-center" className="mb-4">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 backdrop-blur-xl border border-zinc-700 rounded-full shadow-xl"
          >
            {/* Play/Pause */}
            <button
              onClick={() => {
                if (!isPlaying) {
                  setIsPlaying(true);
                  setIsPaused(false);
                } else {
                  setIsPaused(!isPaused);
                }
              }}
              className={cn(
                'p-2 rounded-full transition-colors',
                isPlaying && !isPaused
                  ? 'bg-violet-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              )}
            >
              {isPlaying && !isPaused ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>

            {/* Reset */}
            <button
              onClick={resetWorkflow}
              className="p-2 rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-zinc-700" />

            {/* Progress */}
            <div className="flex items-center gap-2 px-2">
              <Zap className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-xs text-zinc-400 font-mono">
                {currentStep}/{workflowSteps.length}
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-zinc-700" />

            {/* Inspector toggle */}
            <button
              onClick={() => setInspectorOpen(!inspectorOpen)}
              className={cn(
                'p-2 rounded-full transition-colors',
                inspectorOpen
                  ? 'bg-violet-500/20 text-violet-400'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              )}
            >
              <Eye className="w-4 h-4" />
            </button>
          </motion.div>
        </Panel>

        {/* Title Panel */}
        <Panel position="top-left" className="ml-4 mt-4">
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="flex items-center gap-3 px-4 py-2 bg-zinc-900/90 backdrop-blur-xl border border-zinc-700 rounded-xl"
          >
            <div className="p-2 rounded-lg bg-violet-500/20">
              <Zap className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Agent Workflow</h2>
              <p className="text-xs text-zinc-500">Multi-agent collaboration view</p>
            </div>
          </motion.div>
        </Panel>
      </ReactFlow>

      {/* Inspector Panel */}
      <InspectorPanel
        isOpen={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        selectedAgentId={selectedAgent}
        logs={logs}
      />
    </div>
  );
}
