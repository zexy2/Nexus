import { Metadata } from 'next';
import { AgentGraph } from '@/components/agents/agent-graph';

export const metadata: Metadata = {
  title: 'Agent Graph | Nexus',
  description: 'Visualize multi-agent collaboration in real-time',
};

export default function AgentGraphPage() {
  return (
    <div className="h-[calc(100vh-4rem)] w-full">
      <AgentGraph className="h-full w-full" />
    </div>
  );
}
