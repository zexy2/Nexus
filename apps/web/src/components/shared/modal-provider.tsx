'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/lib/store';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FileText, ListTodo, Sparkles, Loader2 } from 'lucide-react';
import { showToast } from '@/components/shared/toast-provider';

// Create Document Modal
function CreateDocumentModal() {
  const { modals, closeModal } = useUIStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [useAI, setUseAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  const handleCreate = useCallback(async () => {
    if (!title.trim() && !useAI) {
      showToast.warning('Please enter a document title');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Untitled Document',
          content: '',
          useAI,
          aiPrompt: useAI ? aiPrompt : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create document');
      }

      const doc = await response.json();
      showToast.success('Document created!');
      closeModal('createDocument');
      setTitle('');
      setAiPrompt('');
      setUseAI(false);
      router.push(`/dashboard/docs/${doc.id}`);
    } catch (error) {
      console.error('Failed to create document:', error);
      showToast.error('Failed to create document');
    } finally {
      setIsLoading(false);
    }
  }, [title, useAI, aiPrompt, closeModal, router]);

  const handleClose = () => {
    closeModal('createDocument');
    setTitle('');
    setAiPrompt('');
    setUseAI(false);
  };

  return (
    <Dialog open={modals.createDocument} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px] glass-premium border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Create New Document
          </DialogTitle>
          <DialogDescription>
            Start with a blank document or let AI help you get started.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="doc-title">Document Title</Label>
            <Input
              id="doc-title"
              placeholder="Enter document title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/20">
                <Sparkles className="h-4 w-4 text-violet-400" />
              </div>
              <div>
                <p className="font-medium text-sm">AI Writing Assistant</p>
                <p className="text-xs text-muted-foreground">Let AI help you draft content</p>
              </div>
            </div>
            <Switch checked={useAI} onCheckedChange={setUseAI} />
          </div>

          {useAI && (
            <div className="space-y-2">
              <Label htmlFor="ai-prompt">What would you like to write about?</Label>
              <Textarea
                id="ai-prompt"
                placeholder="E.g., A blog post about productivity tips..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Document'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Create Task Modal
function CreateTaskModal() {
  const { modals, closeModal } = useUIStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [assignToAI, setAssignToAI] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) {
      showToast.warning('Please enter a task title');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description,
          priority,
          status: 'todo',
          assigneeAgentType: assignToAI ? 'assistant' : null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create task');
      }

      showToast.success('Task created!');
      closeModal('createTask');
      setTitle('');
      setDescription('');
      setPriority('medium');
      setAssignToAI(false);
      router.push('/dashboard/tasks');
    } catch (error) {
      console.error('Failed to create task:', error);
      showToast.error('Failed to create task');
    } finally {
      setIsLoading(false);
    }
  }, [title, description, priority, assignToAI, closeModal, router]);

  const handleClose = () => {
    closeModal('createTask');
    setTitle('');
    setDescription('');
    setPriority('medium');
    setAssignToAI(false);
  };

  return (
    <Dialog open={modals.createTask} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px] glass-premium border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5" />
            Create New Task
          </DialogTitle>
          <DialogDescription>
            Add a new task to your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Task Title</Label>
            <Input
              id="task-title"
              placeholder="Enter task title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-desc">Description (optional)</Label>
            <Textarea
              id="task-desc"
              placeholder="Add more details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/20">
                <Sparkles className="h-4 w-4 text-violet-400" />
              </div>
              <div>
                <p className="font-medium text-sm">Assign to AI Agent</p>
                <p className="text-xs text-muted-foreground">Let AI handle this task</p>
              </div>
            </div>
            <Switch checked={assignToAI} onCheckedChange={setAssignToAI} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Task'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// AI Assistant Modal
function AIAssistantModal() {
  const { modals, closeModal } = useUIStore();
  const router = useRouter();
  const [query, setQuery] = useState('');

  const handleSubmit = useCallback(() => {
    if (!query.trim()) return;
    
    // Navigate to chat with pre-filled message
    closeModal('aiAssistant');
    router.push(`/dashboard/chat?q=${encodeURIComponent(query)}`);
    setQuery('');
  }, [query, closeModal, router]);

  return (
    <Dialog open={modals.aiAssistant} onOpenChange={(open) => !open && closeModal('aiAssistant')}>
      <DialogContent className="sm:max-w-[600px] glass-premium border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            AI Assistant
          </DialogTitle>
          <DialogDescription>
            Ask anything - I can help with research, writing, coding, and more.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Textarea
            placeholder="What would you like help with?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={4}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Press ⌘+Enter to start chatting
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => closeModal('aiAssistant')}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!query.trim()}>
            <Sparkles className="mr-2 h-4 w-4" />
            Start Chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Main Modal Provider
export function ModalProvider() {
  return (
    <>
      <CreateDocumentModal />
      <CreateTaskModal />
      <AIAssistantModal />
    </>
  );
}
