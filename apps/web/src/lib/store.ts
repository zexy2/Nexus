'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// UI State Store
interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;

  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // View preferences
  documentsView: 'grid' | 'list';
  setDocumentsView: (view: 'grid' | 'list') => void;
  tasksView: 'kanban' | 'list' | 'calendar';
  setTasksView: (view: 'kanban' | 'list' | 'calendar') => void;

  // Modals
  modals: {
    createDocument: boolean;
    createTask: boolean;
    settings: boolean;
    onboarding: boolean;
    aiAssistant: boolean;
  };
  openModal: (modal: keyof UIState['modals']) => void;
  closeModal: (modal: keyof UIState['modals']) => void;
  toggleModal: (modal: keyof UIState['modals']) => void;

  // Search
  globalSearch: string;
  setGlobalSearch: (query: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Sidebar
      sidebarOpen: true,
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      // Command palette
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

      // Theme
      theme: 'system',
      setTheme: (theme) => set({ theme }),

      // View preferences
      documentsView: 'grid',
      setDocumentsView: (view) => set({ documentsView: view }),
      tasksView: 'kanban',
      setTasksView: (view) => set({ tasksView: view }),

      // Modals
      modals: {
        createDocument: false,
        createTask: false,
        settings: false,
        onboarding: false,
        aiAssistant: false,
      },
      openModal: (modal) =>
        set((state) => ({
          modals: { ...state.modals, [modal]: true },
        })),
      closeModal: (modal) =>
        set((state) => ({
          modals: { ...state.modals, [modal]: false },
        })),
      toggleModal: (modal) =>
        set((state) => ({
          modals: { ...state.modals, [modal]: !state.modals[modal] },
        })),

      // Search
      globalSearch: '',
      setGlobalSearch: (query) => set({ globalSearch: query }),
    }),
    {
      name: 'nexus-ui-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        documentsView: state.documentsView,
        tasksView: state.tasksView,
      }),
    }
  )
);

// User preferences store
interface UserPreferences {
  // Onboarding
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (completed: boolean) => void;

  // AI preferences
  preferredAgent: string;
  setPreferredAgent: (agent: string) => void;

  // Notification preferences
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;

  // Editor preferences
  editorFontSize: number;
  setEditorFontSize: (size: number) => void;
  showLineNumbers: boolean;
  setShowLineNumbers: (show: boolean) => void;
  autoSave: boolean;
  setAutoSave: (enabled: boolean) => void;
  autoSaveDelay: number;
  setAutoSaveDelay: (delay: number) => void;
}

export const useUserPreferences = create<UserPreferences>()(
  persist(
    (set) => ({
      // Onboarding - default to true to skip onboarding for testing
      // New users will have localStorage cleared which resets to this
      hasCompletedOnboarding: true,
      setHasCompletedOnboarding: (completed) => set({ hasCompletedOnboarding: completed }),

      // AI preferences
      preferredAgent: 'researcher',
      setPreferredAgent: (agent) => set({ preferredAgent: agent }),

      // Notification preferences
      notificationsEnabled: true,
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      soundEnabled: false,
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),

      // Editor preferences
      editorFontSize: 14,
      setEditorFontSize: (size) => set({ editorFontSize: size }),
      showLineNumbers: true,
      setShowLineNumbers: (show) => set({ showLineNumbers: show }),
      autoSave: true,
      setAutoSave: (enabled) => set({ autoSave: enabled }),
      autoSaveDelay: 2000,
      setAutoSaveDelay: (delay) => set({ autoSaveDelay: delay }),
    }),
    {
      name: 'nexus-user-preferences',
    }
  )
);

// Real-time sync status store
interface SyncState {
  status: 'synced' | 'syncing' | 'offline' | 'error';
  lastSyncedAt: Date | null;
  pendingChanges: number;
  setStatus: (status: SyncState['status']) => void;
  setLastSyncedAt: (date: Date | null) => void;
  setPendingChanges: (count: number) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'synced',
  lastSyncedAt: null,
  pendingChanges: 0,
  setStatus: (status) => set({ status }),
  setLastSyncedAt: (date) => set({ lastSyncedAt: date }),
  setPendingChanges: (count) => set({ pendingChanges: count }),
}));

// Active agents store
interface Agent {
  id: string;
  name: string;
  status: 'idle' | 'thinking' | 'working' | 'error';
  currentTask?: string;
  progress?: number;
}

interface AgentsState {
  agents: Agent[];
  activeAgentId: string | null;
  setAgents: (agents: Agent[]) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  setActiveAgent: (id: string | null) => void;
}

export const useAgentsStore = create<AgentsState>((set) => ({
  agents: [],
  activeAgentId: null,
  setAgents: (agents) => set({ agents }),
  updateAgent: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === id ? { ...agent, ...updates } : agent
      ),
    })),
  setActiveAgent: (id) => set({ activeAgentId: id }),
}));
