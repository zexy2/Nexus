"use client";

/**
 * Offline Command Queue
 * 
 * Implements the offline-first command pattern:
 * 1. User writes a natural language command (even offline)
 * 2. Command is stored in IndexedDB with "pending" status
 * 3. When online, commands are synced and processed by Supervisor Agent
 * 4. Results are synced back via Zero Sync
 */

// ==========================================
// TYPES
// ==========================================

export type CommandStatus = 
  | "pending"           // Waiting for sync (offline)
  | "syncing"           // Being uploaded to server
  | "processing"        // Supervisor is working on it
  | "completed"         // Successfully processed
  | "failed";           // Error occurred

export type CommandPriority = "low" | "normal" | "high" | "urgent";

export interface OfflineCommand {
  id: string;
  workspaceId: string;
  userId: string;
  command: string;                    // Natural language command
  status: CommandStatus;
  priority: CommandPriority;
  createdAt: number;                  // Timestamp when created
  syncedAt?: number;                  // When synced to server
  processedAt?: number;               // When Supervisor finished
  result?: CommandResult;
  error?: string;
  retryCount: number;
  metadata?: Record<string, unknown>;
}

export interface CommandResult {
  agentsUsed: string[];
  documentsCreated: string[];
  tasksCreated: string[];
  output: string;
  duration: number;
}

// ==========================================
// INDEXEDDB STORE
// ==========================================

const DB_NAME = "nexus-commands";
const DB_VERSION = 1;
const STORE_NAME = "commands";

class CommandStore {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB not available"));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("workspaceId", "workspaceId", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("userId", "userId", { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  async add(command: OfflineCommand): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(command);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async update(id: string, updates: Partial<OfflineCommand>): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          reject(new Error("Command not found"));
          return;
        }
        const updated = { ...existing, ...updates };
        const putRequest = store.put(updated);
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve();
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async get(id: string): Promise<OfflineCommand | undefined> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getByStatus(status: CommandStatus): Promise<OfflineCommand[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("status");
      const request = index.getAll(status);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async getPending(): Promise<OfflineCommand[]> {
    return this.getByStatus("pending");
  }

  async getAll(workspaceId?: string): Promise<OfflineCommand[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      
      if (workspaceId) {
        const index = store.index("workspaceId");
        const request = index.getAll(workspaceId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      } else {
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      }
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearCompleted(): Promise<void> {
    const completed = await this.getByStatus("completed");
    for (const cmd of completed) {
      await this.delete(cmd.id);
    }
  }
}

export const commandStore = new CommandStore();

// ==========================================
// COMMAND QUEUE MANAGER
// ==========================================

type CommandListener = (commands: OfflineCommand[]) => void;
type StatusChangeListener = (command: OfflineCommand) => void;

class CommandQueue {
  private listeners: Set<CommandListener> = new Set();
  private statusListeners: Set<StatusChangeListener> = new Set();
  private isProcessing = false;
  private syncCheckInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Create a new command (works offline)
   */
  async createCommand(
    command: string,
    workspaceId: string,
    userId: string,
    options?: {
      priority?: CommandPriority;
      metadata?: Record<string, unknown>;
    }
  ): Promise<OfflineCommand> {
    const newCommand: OfflineCommand = {
      id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      workspaceId,
      userId,
      command,
      status: "pending",
      priority: options?.priority || "normal",
      createdAt: Date.now(),
      retryCount: 0,
      metadata: options?.metadata,
    };

    await commandStore.add(newCommand);
    this.notifyListeners();
    
    // Try to sync immediately if online
    if (navigator.onLine) {
      this.processPendingCommands();
    }

    return newCommand;
  }

  /**
   * Process all pending commands when online
   */
  async processPendingCommands(): Promise<void> {
    if (this.isProcessing || !navigator.onLine) return;
    
    this.isProcessing = true;
    
    try {
      const pending = await commandStore.getPending();
      
      for (const cmd of pending) {
        await this.processCommand(cmd);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single command
   */
  private async processCommand(command: OfflineCommand): Promise<void> {
    try {
      // Update status to syncing
      await commandStore.update(command.id, { status: "syncing" });
      this.notifyStatusChange({ ...command, status: "syncing" });

      // Send to server
      const response = await fetch("/api/commands/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandId: command.id,
          command: command.command,
          workspaceId: command.workspaceId,
          userId: command.userId,
          priority: command.priority,
          metadata: command.metadata,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      // Update to processing (server is now handling it)
      await commandStore.update(command.id, { 
        status: "processing",
        syncedAt: Date.now(),
      });
      this.notifyStatusChange({ ...command, status: "processing", syncedAt: Date.now() });
      this.notifyListeners();

      // The actual result will come via webhook/polling
      // For now, we'll poll for completion
      this.pollForCompletion(command.id);

    } catch (error) {
      console.error("Failed to process command:", error);
      
      const retryCount = command.retryCount + 1;
      if (retryCount < 3) {
        // Retry later
        await commandStore.update(command.id, { 
          status: "pending",
          retryCount,
          error: String(error),
        });
      } else {
        // Mark as failed
        await commandStore.update(command.id, { 
          status: "failed",
          retryCount,
          error: String(error),
        });
        this.notifyStatusChange({ ...command, status: "failed", error: String(error) });
      }
      this.notifyListeners();
    }
  }

  /**
   * Poll server for command completion
   */
  private async pollForCompletion(commandId: string): Promise<void> {
    const maxAttempts = 60; // 5 minutes max (5s intervals)
    let attempts = 0;

    const poll = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        await commandStore.update(commandId, { 
          status: "failed",
          error: "Timeout waiting for completion",
        });
        const cmd = await commandStore.get(commandId);
        if (cmd) this.notifyStatusChange(cmd);
        this.notifyListeners();
        return;
      }

      try {
        const response = await fetch(`/api/commands/status?id=${commandId}`);
        if (!response.ok) throw new Error("Failed to get status");
        
        const data = await response.json();
        
        if (data.status === "completed") {
          await commandStore.update(commandId, {
            status: "completed",
            processedAt: Date.now(),
            result: data.result,
          });
          const cmd = await commandStore.get(commandId);
          if (cmd) this.notifyStatusChange(cmd);
          this.notifyListeners();
          return;
        }
        
        if (data.status === "failed") {
          await commandStore.update(commandId, {
            status: "failed",
            error: data.error,
          });
          const cmd = await commandStore.get(commandId);
          if (cmd) this.notifyStatusChange(cmd);
          this.notifyListeners();
          return;
        }

        // Still processing, poll again
        setTimeout(poll, 5000);
      } catch {
        // Network error, retry
        setTimeout(poll, 5000);
      }
    };

    setTimeout(poll, 2000); // Start polling after 2 seconds
  }

  /**
   * Start listening for online/offline events
   */
  startSyncWatch(): void {
    if (typeof window === "undefined") return;

    // Listen for online event
    window.addEventListener("online", () => {
      console.log("🌐 Back online - processing pending commands...");
      this.processPendingCommands();
    });

    // Also check periodically
    this.syncCheckInterval = setInterval(() => {
      if (navigator.onLine) {
        this.processPendingCommands();
      }
    }, 30000); // Every 30 seconds
  }

  stopSyncWatch(): void {
    if (this.syncCheckInterval) {
      clearInterval(this.syncCheckInterval);
      this.syncCheckInterval = null;
    }
  }

  /**
   * Subscribe to command list changes
   */
  subscribe(listener: CommandListener): () => void {
    this.listeners.add(listener);
    // Send initial state
    commandStore.getAll().then(commands => listener(commands));
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(listener: StatusChangeListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private async notifyListeners(): Promise<void> {
    const commands = await commandStore.getAll();
    this.listeners.forEach(listener => listener(commands));
  }

  private notifyStatusChange(command: OfflineCommand): void {
    this.statusListeners.forEach(listener => listener(command));
  }

  /**
   * Get all commands
   */
  async getCommands(workspaceId?: string): Promise<OfflineCommand[]> {
    return commandStore.getAll(workspaceId);
  }

  /**
   * Get pending count
   */
  async getPendingCount(): Promise<number> {
    const pending = await commandStore.getPending();
    return pending.length;
  }

  /**
   * Retry a failed command
   */
  async retryCommand(commandId: string): Promise<void> {
    const command = await commandStore.get(commandId);
    if (!command) return;

    await commandStore.update(commandId, {
      status: "pending",
      retryCount: 0,
      error: undefined,
    });
    this.notifyListeners();

    if (navigator.onLine) {
      this.processPendingCommands();
    }
  }

  /**
   * Cancel a pending command
   */
  async cancelCommand(commandId: string): Promise<void> {
    await commandStore.delete(commandId);
    this.notifyListeners();
  }
}

export const commandQueue = new CommandQueue();

// Auto-start sync watch in browser
if (typeof window !== "undefined") {
  commandQueue.startSyncWatch();
}
