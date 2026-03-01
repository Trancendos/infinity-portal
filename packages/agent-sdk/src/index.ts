/**
 * Agent SDK
 * 
 * Complete toolkit for building, managing, and optimizing AI agents
 * in the Infinity Portal ecosystem.
 * 
 * Modules:
 * - Agent Orchestrator: Task assignment, load balancing, performance tracking
 * - Agent Templates: Pre-built agent configurations (Norman, Guardian, Mercury, etc.)
 * - AI Performance: Inference tracking, A/B testing, cost optimization
 */

export {
  AgentOrchestrator,
  type AgentConfig,
  type AgentTool,
  type AgentTask,
  type AgentPerformance,
  type OrchestratorOptions,
} from './agent-orchestrator';

export {
  AgentTemplates,
  getTemplate,
  getTemplatesByCategory,
  getCategories,
  createFromTemplate,
  type AgentTemplate,
} from './agent-templates';

export {
  AIPerformanceTracker,
  type InferenceRecord,
  type ModelMetrics,
  type ABTest,
  type ABTestVariant,
  type CostOptimization,
  type CostRecommendation,
} from './ai-performance';