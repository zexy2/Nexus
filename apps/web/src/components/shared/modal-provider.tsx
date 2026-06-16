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
import { FileText, ListTodo, Sparkles, Loader2 } from 'lucide-react';
import { showToast } from '@/components/shared/toast-provider';
import { useT } from '@/lib/i18n/provider';

// Create Document Modal
function CreateDocumentModal() {
  const t = useT();
  const { modals, closeModal } = useUIStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState('');

  const handleCreate = useCallback(async () => {
    if (!title.trim()) {
      showToast.warning(t('docs.toastEnterName'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: '',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create plan');
      }

      const doc = await response.json();
      showToast.success(t('docs.toastCreated'));
      closeModal('createDocument');
      setTitle('');
      router.push(`/dashboard/docs/${doc.id}`);
    } catch (error) {
      console.error('Failed to create plan:', error);
      showToast.error(t('docs.toastCreateFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [title, closeModal, router, t]);

  const handleClose = () => {
    closeModal('createDocument');
    setTitle('');
  };

  return (
    <Dialog open={modals.createDocument} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px] glass-premium border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('docs.dialogTitle')}
          </DialogTitle>
          <DialogDescription>{t('docs.dialogDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="doc-title">{t('docs.titleLabel')}</Label>
            <Input
              id="doc-title"
              placeholder={t('docs.titlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              t('docs.newDoc')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Create Task Modal
function CreateTaskModal() {
  const t = useT();
  const { modals, closeModal } = useUIStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');

  const handleCreate = useCallback(async () => {
    if (!title.trim()) {
      showToast.warning(t('tasks.toastEnterTitle'));
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
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create task');
      }

      showToast.success(t('tasks.toastCreated'));
      closeModal('createTask');
      setTitle('');
      setDescription('');
      setPriority('medium');
      router.push('/dashboard/tasks');
    } catch (error) {
      console.error('Failed to create task:', error);
      showToast.error(t('tasks.toastCreateFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [title, description, priority, closeModal, router, t]);

  const handleClose = () => {
    closeModal('createTask');
    setTitle('');
    setDescription('');
    setPriority('medium');
  };

  return (
    <Dialog open={modals.createTask} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px] glass-premium border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5" />
            {t('tasks.dialogCreateTitle')}
          </DialogTitle>
          <DialogDescription>{t('tasks.dialogCreateDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">{t('tasks.fieldTitle')}</Label>
            <Input
              id="task-title"
              placeholder={t('tasks.fieldTitlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-desc">{t('tasks.fieldDesc')}</Label>
            <Textarea
              id="task-desc"
              placeholder={t('tasks.fieldDescPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('tasks.fieldPriority')}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t('tasks.prioLow')}</SelectItem>
                <SelectItem value="medium">{t('tasks.prioMedium')}</SelectItem>
                <SelectItem value="high">{t('tasks.prioHigh')}</SelectItem>
                <SelectItem value="urgent">{t('tasks.prioUrgent')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              t('tasks.newTask')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// AI Assistant Modal
function AIAssistantModal() {
  const t = useT();
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
            {t('chat.askNexus')}
          </DialogTitle>
          <DialogDescription>{t('chat.headerSubtitle')}</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Textarea
            placeholder={t('chat.messagePlaceholder')}
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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => closeModal('aiAssistant')}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!query.trim()}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t('palette.startChat')}
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
