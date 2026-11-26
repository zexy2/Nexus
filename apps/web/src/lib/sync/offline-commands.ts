"use client";

/**
 * Offline Command Queue
 * 
 * Implements the offline-first command pattern:
 * 1. User writes a natural language command (even offline)
 * 2. Command is stored in IndexedDB with "pending" status
 * 3. When online, commands are synced and processed by Nexus
 * 4. Results are synced back through the server sync layer
 */

// ==========================================
// TYPES
// ==========================================

export type CommandStatus = 
  | "pending"           // Waiting for sync (offline)
  | "syncing"           // Being uploaded to server
  | "processing"        // Nexus is processing it
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
  processedAt?: number;               // When processing finished
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
        const db = request.result;
        this.db = db;
        // Let another tab's sign-out delete the DB instead of blocking it.
        db.onversionchange = () => {
          db.close();
          if (this.db === db) {
            this.db = null;
            this.dbPromise = null;
          }
        };
        resolve(db);
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

  /** Close and delete the whole command DB (sign-out). */
  async destroy(): Promise<void> {
    const pending = this.dbPromise;
    this.db?.close();
    this.db = null;
    this.dbPromise = null;
    if (pending) {
      try {
        (await pending).close();
      } catch {
        // never opened
      }
    }
    if (typeof indexedDB === "undefined") return;
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
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
  private onlineHandler: (() => void) | null = null;
  private watchers = 0;
  private resumed = false;
  /** Poll timers, so stop/reset can cancel them. */
  private pollTimers = new Set<ReturnType<typeof setTimeout>>();
  /** Commands currently being polled, so a resume never double-polls. */
  private polling = new Set<string>();

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
      await this.resumeInterrupted();
      const pending = await commandStore.getPending();
      
      for (const cmd of pending) {
        await this.processCommand(cmd);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * A reload while a command was "syncing" (upload may not have reached the
   * server) or "processing" (server has it) used to leave it spinning forever.
   * Re-queue the former (the server keys it by commandId) and resume polling
   * the latter. Runs once per page load.
   */
  private async resumeInterrupted(): Promise<void> {
    if (this.resumed) return;
    this.resumed = true;
    for (const cmd of await commandStore.getByStatus("syncing")) {
      await commandStore.update(cmd.id, { status: "pending" });
    }
    for (const cmd of await commandStore.getByStatus("processing")) {
      void this.pollForCompletion(cmd.id);
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
  private schedulePoll(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.pollTimers.delete(timer);
      fn();
    }, ms);
    this.pollTimers.add(timer);
  }

  private async pollForCompletion(commandId: string): Promise<void> {
    if (this.polling.has(commandId)) return;
    this.polling.add(commandId);
    const maxAttempts = 60; // 5 minutes max (5s intervals)
    let attempts = 0;
    const done = () => this.polling.delete(commandId);

    const poll = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        done();
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
          done();
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
          done();
          const cmd = await commandStore.get(commandId);
          if (cmd) this.notifyStatusChange(cmd);
          this.notifyListeners();
          return;
        }

        // Still processing, poll again
        this.schedulePoll(poll, 5000);
      } catch {
        // Network error, retry
        this.schedulePoll(poll, 5000);
      }
    };

    this.schedulePoll(poll, 2000); // Start polling after 2 seconds
  }

  /**
   * Start listening for online/offline events
   */
  /**
   * Reference-counted: every startSyncWatch() needs a matching stopSyncWatch().
   * Only one online listener and one interval exist however many callers.
   */
  startSyncWatch(): void {
    if (typeof window === "undefined") return;
    this.watchers++;
    if (this.onlineHandler) return;

    this.onlineHandler = () => {
      void this.processPendingCommands();
    };
    window.addEventListener("online", this.onlineHandler);
    this.syncCheckInterval = setInterval(() => {
      if (navigator.onLine) void this.processPendingCommands();
    }, 30000);
  }

  stopSyncWatch(): void {
    this.watchers = Math.max(0, this.watchers - 1);
    if (this.watchers > 0) return;
    this.teardownWatch();
  }

  /** True while an online listener / interval is installed (for tests). */
  get isWatching(): boolean {
    return this.onlineHandler !== null;
  }

  private teardownWatch(): void {
    if (this.syncCheckInterval) {
      clearInterval(this.syncCheckInterval);
      this.syncCheckInterval = null;
    }
    if (this.onlineHandler && typeof window !== "undefined") {
      window.removeEventListener("online", this.onlineHandler);
    }
    this.onlineHandler = null;
  }

  /** Sign-out: stop all timers and listeners and delete the command DB. */
  async reset(): Promise<void> {
    this.watchers = 0;
    this.teardownWatch();
    this.pollTimers.forEach((timer) => clearTimeout(timer));
    this.pollTimers.clear();
    this.polling.clear();
    this.resumed = false;
    await commandStore.destroy();
    this.listeners.forEach((listener) => listener([]));
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

/**
 * Commands the server has not taken over yet: still queued, interrupted
 * mid-upload, or failed (kept for a manual retry). Sign-out deletes the whole
 * command DB, so these are lost with it. 0 when IndexedDB is unavailable.
 */
export async function countQueuedOfflineCommands(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  try {
    const all = await commandStore.getAll();
    return all.filter((cmd) => cmd.status === "pending" || cmd.status === "syncing" || cmd.status === "failed")
      .length;
  } catch {
    return 0;
  }
}

/** Sign-out helper: stop the queue and delete the command DB. */
export function clearOfflineCommands(): Promise<void> {
  return commandQueue.reset();
}

// The sync watch is started by components that need it, each with a matching
// stop on unmount; there is no module-level listener that could never be
// removed. (The floating command box that used it was removed; any commands
// still queued are counted and cleared on sign-out.)
