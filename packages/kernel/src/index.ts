/**
 * @package @infinity-os/kernel
 * The Infinity OS Kernel — Service Worker based process manager
 * Handles: Process lifecycle, IPC, Storage API, Permission API, Event Bus
 * 
 * This is the evolution of the original InfinityPortalService.
 * The kernel IS the portal — the gateway to everything.
 */

import type {
  KernelProcess,
  IPCMessage,
  KernelEvent,
  KernelEventType,
  ModulePermission,
  User,
} from '@infinity-os/types';

// ============================================================
// KERNEL VERSION & CONSTANTS
// ============================================================

export const KERNEL_VERSION = '0.1.0';
export const KERNEL_NAME = 'infinity-kernel';

// ============================================================
// EVENT BUS
// ============================================================

type EventHandler = (event: KernelEvent) => void;

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on(type: KernelEventType | '*', handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => this.off(type, handler);
  }

  off(type: string, handler: EventHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  emit(event: KernelEvent): void {
    // Emit to specific handlers
    this.handlers.get(event.type)?.forEach(h => h(event));
    // Emit to wildcard handlers
    this.handlers.get('*')?.forEach(h => h(event));
  }
}

// ============================================================
// IPC MESSAGE BUS
// ============================================================

type IPCHandler<T = unknown> = (message: IPCMessage<T>) => Promise<unknown> | unknown;

class IPCBus {
  private handlers = new Map<string, Map<string, IPCHandler>>();
  private pendingReplies = new Map<string, (value: unknown) => void>();

  register(moduleId: string, messageType: string, handler: IPCHandler): void {
    if (!this.handlers.has(moduleId)) {
      this.handlers.set(moduleId, new Map());
    }
    this.handlers.get(moduleId)!.set(messageType, handler);
  }

  unregister(moduleId: string): void {
    this.handlers.delete(moduleId);
  }

  async send<T = unknown, R = unknown>(message: IPCMessage<T>): Promise<R | null> {
    if (message.to === 'broadcast') {
      this.handlers.forEach(moduleHandlers => {
        const handler = moduleHandlers.get(message.type);
        if (handler) handler(message);
      });
      return null;
    }

    const moduleHandlers = this.handlers.get(message.to);
    if (!moduleHandlers) {
      console.warn(`[IPC] No handlers registered for module: ${message.to}`);
      return null;
    }

    const handler = moduleHandlers.get(message.type);
    if (!handler) {
      console.warn(`[IPC] No handler for message type: ${message.type} in module: ${message.to}`);
      return null;
    }

    return (await handler(message)) as R;
  }
}

// ============================================================
// PROCESS MANAGER
// ============================================================

class ProcessManager {
  private processes = new Map<string, KernelProcess>();
  private pidCounter = 0;

  spawn(moduleId: string): KernelProcess {
    const pid = `pid_${++this.pidCounter}_${Date.now()}`;
    const process: KernelProcess = {
      pid,
      moduleId,
      status: 'initialising',
      startedAt: Date.now(),
    };
    this.processes.set(pid, process);
    console.log(`[Kernel] Process spawned: ${pid} for module: ${moduleId}`);
    return process;
  }

  setStatus(pid: string, status: KernelProcess['status']): void {
    const process = this.processes.get(pid);
    if (process) {
      process.status = status;
    }
  }

  terminate(pid: string): void {
    const process = this.processes.get(pid);
    if (process) {
      process.status = 'terminated';
      this.processes.delete(pid);
      console.log(`[Kernel] Process terminated: ${pid}`);
    }
  }

  getProcess(pid: string): KernelProcess | undefined {
    return this.processes.get(pid);
  }

  getProcessByModule(moduleId: string): KernelProcess | undefined {
    return Array.from(this.processes.values()).find(p => p.moduleId === moduleId);
  }

  listProcesses(): KernelProcess[] {
    return Array.from(this.processes.values());
  }
}

// ============================================================
// PERMISSION MANAGER
// ============================================================

class PermissionManager {
  private grants = new Map<string, Set<ModulePermission>>();

  grant(moduleId: string, permissions: ModulePermission[]): void {
    if (!this.grants.has(moduleId)) {
      this.grants.set(moduleId, new Set());
    }
    permissions.forEach(p => this.grants.get(moduleId)!.add(p));
    console.log(`[Kernel] Permissions granted to ${moduleId}:`, permissions);
  }

  revoke(moduleId: string, permissions?: ModulePermission[]): void {
    if (!permissions) {
      this.grants.delete(moduleId);
      return;
    }
    permissions.forEach(p => this.grants.get(moduleId)?.delete(p));
  }

  check(moduleId: string, permission: ModulePermission): boolean {
    return this.grants.get(moduleId)?.has(permission) ?? false;
  }

  checkAll(moduleId: string, permissions: ModulePermission[]): boolean {
    return permissions.every(p => this.check(moduleId, p));
  }

  getGranted(moduleId: string): ModulePermission[] {
    return Array.from(this.grants.get(moduleId) ?? []);
  }
}

// ============================================================
// STORAGE API
// ============================================================

class StorageAPI {
  private localStore = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | null> {
    // In browser: uses IndexedDB via idb-keyval
    // In Service Worker: uses Cache API
    // Falls back to in-memory for SSR/testing
    const value = this.localStore.get(key);
    return (value as T) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.localStore.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.localStore.delete(key);
  }

  async clear(prefix?: string): Promise<void> {
    if (prefix) {
      Array.from(this.localStore.keys())
        .filter(k => k.startsWith(prefix))
        .forEach(k => this.localStore.delete(k));
    } else {
      this.localStore.clear();
    }
  }
}

// ============================================================
// INFINITY KERNEL — MAIN CLASS
// ============================================================

export class InfinityKernel {
  readonly version = KERNEL_VERSION;
  readonly name = KERNEL_NAME;

  readonly events: EventBus;
  readonly ipc: IPCBus;
  readonly processes: ProcessManager;
  readonly permissions: PermissionManager;
  readonly storage: StorageAPI;

  private currentUser: User | null = null;
  private startTime: number | null = null;
  private _status: 'stopped' | 'starting' | 'running' | 'error' = 'stopped';

  constructor() {
    this.events = new EventBus();
    this.ipc = new IPCBus();
    this.processes = new ProcessManager();
    this.permissions = new PermissionManager();
    this.storage = new StorageAPI();
  }

  async start(): Promise<void> {
    if (this._status === 'running') {
      console.warn(`[${this.name}] Already running`);
      return;
    }

    this._status = 'starting';
    this.startTime = Date.now();
    console.log(`[${this.name}] Starting Infinity OS Kernel v${this.version}...`);

    try {
      // Restore session from storage
      const savedSession = await this.storage.get<User>('kernel:current_user');
      if (savedSession) {
        this.currentUser = savedSession;
        console.log(`[${this.name}] Session restored for user: ${savedSession.email}`);
      }

      this._status = 'running';
      console.log(`[${this.name}] ✓ Kernel running. Uptime: 0ms`);

      this.events.emit({
        type: 'system:alert',
        payload: { message: 'Kernel started', level: 'info' },
        timestamp: Date.now(),
        source: this.name,
      });
    } catch (error) {
      this._status = 'error';
      console.error(`[${this.name}] Failed to start:`, error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log(`[${this.name}] Stopping...`);

    // Terminate all processes
    this.processes.listProcesses().forEach(p => {
      this.processes.terminate(p.pid);
    });

    // Persist session
    if (this.currentUser) {
      await this.storage.set('kernel:current_user', this.currentUser);
    }

    this._status = 'stopped';
    console.log(`[${this.name}] Stopped. Total uptime: ${this.uptime}ms`);
  }

  setUser(user: User | null): void {
    this.currentUser = user;
    if (user) {
      this.events.emit({
        type: 'user:login',
        payload: { userId: user.id, email: user.email },
        timestamp: Date.now(),
        source: this.name,
      });
    } else {
      this.events.emit({
        type: 'user:logout',
        payload: {},
        timestamp: Date.now(),
        source: this.name,
      });
    }
  }

  getUser(): User | null {
    return this.currentUser;
  }

  getStatus() {
    return {
      name: this.name,
      version: this.version,
      status: this._status,
      uptime: this.uptime,
      processCount: this.processes.listProcesses().length,
      currentUser: this.currentUser?.email ?? null,
    };
  }

  get uptime(): number {
    return this.startTime ? Date.now() - this.startTime : 0;
  }
}

// ============================================================
// SINGLETON KERNEL INSTANCE
// ============================================================

let kernelInstance: InfinityKernel | null = null;

export function getKernel(): InfinityKernel {
  if (!kernelInstance) {
    kernelInstance = new InfinityKernel();
  }
  return kernelInstance;
}

export function resetKernel(): void {
  kernelInstance = null;
}

// ============================================================
// LEGACY COMPATIBILITY — preserves original InfinityPortalService API
// The kernel IS the portal. The portal has become the OS.
// ============================================================

/** @deprecated Use InfinityKernel instead */
export class InfinityPortalService {
  private kernel: InfinityKernel;

  constructor() {
    this.kernel = getKernel();
    console.warn(
      '[InfinityPortalService] This class is deprecated. Use InfinityKernel from @infinity-os/kernel instead.'
    );
  }

  async start(): Promise<void> {
    return this.kernel.start();
  }

  async stop(): Promise<void> {
    return this.kernel.stop();
  }

  getStatus() {
    return this.kernel.getStatus();
  }
}

export default InfinityKernel;

// Entry point for direct execution
if (typeof require !== 'undefined' && require.main === module) {
  const kernel = getKernel();
  kernel.start().then(() => {
    console.log('[Infinity OS] Kernel status:', kernel.getStatus());
  });
}