/**
 * Agent Orchestrator
 * 
 * Manages AI agent lifecycle, task assignment, collaboration,
 * and performance optimization across the Infinity Portal.
 */

export interface AgentConfig {
  id: string;
  name: string;
  type: 'assistant' | 'worker' | 'specialist' | 'supervisor';
  model: string;
  capabilities: string[];
  maxConcurrentTasks: number;
  priority: number;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  tools: AgentTool[];
  metadata: Record<string, any>;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: string;
}

export interface AgentTask {
  id: string;
  type: string;
  description: string;
  input: any;
  assignedAgent?: string;
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: any;
  error?: string;
  metadata: Record<string, any>;
}

export interface AgentPerformance {
  agentId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgResponseTime: number;
  avgTokensUsed: number;
  successRate: number;
  lastActive: number;
}

export interface OrchestratorOptions {
  maxQueueSize: number;
  taskTimeout: number;
  enableLoadBalancing: boolean;
  enableAutoScaling: boolean;
  performanceWindow: number;
  onTaskComplete?: (task: AgentTask) => void;
  onTaskFailed?: (task: AgentTask, error: Error) => void;
}

export class AgentOrchestrator {
  private agents: Map<string, AgentConfig> = new Map();
  private tasks: Map<string, AgentTask> = new Map();
  private taskQueue: AgentTask[] = [];
  private performance: Map<string, AgentPerformance> = new Map();
  private activeTasks: Map<string, Set<string>> = new Map();

  constructor(private readonly options: OrchestratorOptions) {}

  /**
   * Register an agent
   */
  registerAgent(config: AgentConfig): void {
    this.agents.set(config.id, config);
    this.activeTasks.set(config.id, new Set());
    this.performance.set(config.id, {
      agentId: config.id,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      avgResponseTime: 0,
      avgTokensUsed: 0,
      successRate: 1.0,
      lastActive: Date.now(),
    });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): boolean {
    this.agents.delete(agentId);
    this.activeTasks.delete(agentId);
    return true;
  }

  /**
   * Submit a task for execution
   */
  async submitTask(task: Omit<AgentTask, 'id' | 'status' | 'createdAt'>): Promise<AgentTask> {
    const fullTask: AgentTask = {
      ...task,
      id: this.generateId(),
      status: 'pending',
      createdAt: Date.now(),
    };

    this.tasks.set(fullTask.id, fullTask);

    // Try to assign immediately
    const agent = this.selectAgent(fullTask);
    if (agent) {
      await this.assignTask(fullTask, agent);
    } else {
      // Queue the task
      if (this.taskQueue.length >= this.options.maxQueueSize) {
        fullTask.status = 'failed';
        fullTask.error = 'Task queue is full';
        return fullTask;
      }
      this.taskQueue.push(fullTask);
      this.taskQueue.sort((a, b) => b.priority - a.priority);
    }

    return fullTask;
  }

  /**
   * Select the best agent for a task
   */
  private selectAgent(task: AgentTask): AgentConfig | null {
    const candidates = Array.from(this.agents.values())
      .filter(agent => {
        // Check capability match
        if (task.type && !agent.capabilities.includes(task.type)) return false;
        // Check capacity
        const active = this.activeTasks.get(agent.id)?.size || 0;
        if (active >= agent.maxConcurrentTasks) return false;
        return true;
      });

    if (candidates.length === 0) return null;

    if (this.options.enableLoadBalancing) {
      // Score-based selection: performance + availability + priority
      return candidates.reduce((best, agent) => {
        const perf = this.performance.get(agent.id);
        const active = this.activeTasks.get(agent.id)?.size || 0;
        const capacity = 1 - (active / agent.maxConcurrentTasks);
        const score = (perf?.successRate || 0.5) * capacity * agent.priority;

        const bestPerf = this.performance.get(best.id);
        const bestActive = this.activeTasks.get(best.id)?.size || 0;
        const bestCapacity = 1 - (bestActive / best.maxConcurrentTasks);
        const bestScore = (bestPerf?.successRate || 0.5) * bestCapacity * best.priority;

        return score > bestScore ? agent : best;
      });
    }

    // Simple priority-based selection
    return candidates.sort((a, b) => b.priority - a.priority)[0];
  }

  /**
   * Assign a task to an agent
   */
  private async assignTask(task: AgentTask, agent: AgentConfig): Promise<void> {
    task.assignedAgent = agent.id;
    task.status = 'assigned';
    task.startedAt = Date.now();
    this.activeTasks.get(agent.id)?.add(task.id);
  }

  /**
   * Complete a task
   */
  async completeTask(taskId: string, result: any): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.status = 'completed';
    task.result = result;
    task.completedAt = Date.now();

    // Update performance
    if (task.assignedAgent) {
      this.activeTasks.get(task.assignedAgent)?.delete(taskId);
      this.updatePerformance(task.assignedAgent, task);
    }

    this.options.onTaskComplete?.(task);

    // Process queue
    this.processQueue();
  }

  /**
   * Fail a task
   */
  async failTask(taskId: string, error: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.status = 'failed';
    task.error = error;
    task.completedAt = Date.now();

    if (task.assignedAgent) {
      this.activeTasks.get(task.assignedAgent)?.delete(taskId);
      this.updatePerformance(task.assignedAgent, task);
    }

    this.options.onTaskFailed?.(task, new Error(error));
    this.processQueue();
  }

  /**
   * Process queued tasks
   */
  private processQueue(): void {
    const toRemove: number[] = [];

    for (let i = 0; i < this.taskQueue.length; i++) {
      const task = this.taskQueue[i];
      const agent = this.selectAgent(task);
      if (agent) {
        this.assignTask(task, agent);
        toRemove.push(i);
      }
    }

    // Remove assigned tasks from queue (reverse order)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.taskQueue.splice(toRemove[i], 1);
    }
  }

  /**
   * Update agent performance metrics
   */
  private updatePerformance(agentId: string, task: AgentTask): void {
    const perf = this.performance.get(agentId);
    if (!perf) return;

    perf.totalTasks++;
    if (task.status === 'completed') {
      perf.completedTasks++;
    } else {
      perf.failedTasks++;
    }

    const responseTime = (task.completedAt || Date.now()) - (task.startedAt || task.createdAt);
    perf.avgResponseTime = (perf.avgResponseTime * (perf.totalTasks - 1) + responseTime) / perf.totalTasks;
    perf.successRate = perf.completedTasks / perf.totalTasks;
    perf.lastActive = Date.now();
  }

  /**
   * Get agent performance
   */
  getPerformance(agentId?: string): AgentPerformance | AgentPerformance[] {
    if (agentId) {
      return this.performance.get(agentId) || {
        agentId,
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        avgResponseTime: 0,
        avgTokensUsed: 0,
        successRate: 0,
        lastActive: 0,
      };
    }
    return Array.from(this.performance.values());
  }

  /**
   * Get task status
   */
  getTask(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { size: number; pending: number; running: number } {
    let running = 0;
    for (const tasks of this.activeTasks.values()) {
      running += tasks.size;
    }
    return {
      size: this.taskQueue.length,
      pending: this.taskQueue.length,
      running,
    };
  }

  /**
   * Get all registered agents
   */
  getAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
  }
}