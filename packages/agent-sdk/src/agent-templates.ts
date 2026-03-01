/**
 * Agent Template System
 * 
 * Provides pre-built agent templates for common use cases.
 * Templates define agent configuration, capabilities, and behavior.
 */

import { AgentConfig, AgentTool } from './agent-orchestrator';

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  config: Omit<AgentConfig, 'id'>;
  requiredIntegrations: string[];
  estimatedCost: string;
}

/**
 * Pre-built agent templates for Infinity Portal
 */
export const AgentTemplates: AgentTemplate[] = [
  // Norman - Code Review Agent
  {
    id: 'norman-code-review',
    name: 'Norman',
    description: 'AI-powered code review agent that analyzes pull requests, identifies bugs, security vulnerabilities, and suggests improvements.',
    category: 'development',
    icon: '🔍',
    config: {
      name: 'Norman',
      type: 'specialist',
      model: 'gpt-4',
      capabilities: ['code-review', 'security-analysis', 'bug-detection', 'code-quality'],
      maxConcurrentTasks: 5,
      priority: 8,
      temperature: 0.3,
      maxTokens: 4096,
      systemPrompt: `You are Norman, an expert code review agent. Your responsibilities:
1. Analyze code changes for bugs, security vulnerabilities, and performance issues
2. Suggest improvements following best practices and design patterns
3. Ensure code quality standards are met
4. Provide constructive, actionable feedback
5. Flag critical issues that must be addressed before merging`,
      tools: [
        { name: 'analyze_diff', description: 'Analyze code diff', parameters: { diff: 'string' }, handler: 'code-analysis' },
        { name: 'check_security', description: 'Run security checks', parameters: { code: 'string' }, handler: 'security-scanner' },
        { name: 'suggest_fix', description: 'Suggest code fix', parameters: { issue: 'string', code: 'string' }, handler: 'code-fixer' },
      ],
      metadata: { version: '2.0', author: 'Trancendos' },
    },
    requiredIntegrations: ['github'],
    estimatedCost: 'low',
  },

  // Guardian - Security Agent
  {
    id: 'guardian-security',
    name: 'Guardian',
    description: 'Security monitoring agent that continuously scans for threats, vulnerabilities, and compliance violations.',
    category: 'security',
    icon: '🛡️',
    config: {
      name: 'Guardian',
      type: 'supervisor',
      model: 'gpt-4',
      capabilities: ['security-monitoring', 'threat-detection', 'compliance-check', 'incident-response'],
      maxConcurrentTasks: 10,
      priority: 10,
      temperature: 0.1,
      maxTokens: 4096,
      systemPrompt: `You are Guardian, a security monitoring agent. Your responsibilities:
1. Continuously monitor for security threats and anomalies
2. Detect and alert on potential vulnerabilities
3. Ensure compliance with security policies (ISO 27001, SOC 2, GDPR)
4. Coordinate incident response when threats are detected
5. Generate security reports and recommendations`,
      tools: [
        { name: 'scan_vulnerabilities', description: 'Scan for vulnerabilities', parameters: { target: 'string' }, handler: 'vuln-scanner' },
        { name: 'check_compliance', description: 'Check compliance status', parameters: { framework: 'string' }, handler: 'compliance-checker' },
        { name: 'alert', description: 'Send security alert', parameters: { severity: 'string', message: 'string' }, handler: 'alerter' },
      ],
      metadata: { version: '2.0', author: 'Trancendos' },
    },
    requiredIntegrations: ['slack', 'pagerduty'],
    estimatedCost: 'medium',
  },

  // Mercury - Communication Agent
  {
    id: 'mercury-communication',
    name: 'Mercury',
    description: 'Communication agent that manages notifications, emails, and inter-team messaging with intelligent routing.',
    category: 'communication',
    icon: '📨',
    config: {
      name: 'Mercury',
      type: 'worker',
      model: 'gpt-4o-mini',
      capabilities: ['email-drafting', 'notification-routing', 'message-summarization', 'translation'],
      maxConcurrentTasks: 20,
      priority: 6,
      temperature: 0.5,
      maxTokens: 2048,
      systemPrompt: `You are Mercury, a communication agent. Your responsibilities:
1. Draft and send professional emails and notifications
2. Route messages to appropriate recipients
3. Summarize long threads and conversations
4. Translate messages across languages
5. Manage communication preferences and schedules`,
      tools: [
        { name: 'send_email', description: 'Send email', parameters: { to: 'string', subject: 'string', body: 'string' }, handler: 'email-sender' },
        { name: 'send_notification', description: 'Send notification', parameters: { channel: 'string', message: 'string' }, handler: 'notifier' },
        { name: 'summarize', description: 'Summarize text', parameters: { text: 'string' }, handler: 'summarizer' },
      ],
      metadata: { version: '2.0', author: 'Trancendos' },
    },
    requiredIntegrations: ['email', 'slack'],
    estimatedCost: 'low',
  },

  // Prometheus - Analytics Agent
  {
    id: 'prometheus-analytics',
    name: 'Prometheus',
    description: 'Data analytics agent that processes metrics, generates insights, and creates predictive models.',
    category: 'analytics',
    icon: '📊',
    config: {
      name: 'Prometheus',
      type: 'specialist',
      model: 'gpt-4',
      capabilities: ['data-analysis', 'report-generation', 'trend-detection', 'forecasting'],
      maxConcurrentTasks: 3,
      priority: 7,
      temperature: 0.2,
      maxTokens: 8192,
      systemPrompt: `You are Prometheus, a data analytics agent. Your responsibilities:
1. Analyze business metrics and KPIs
2. Generate comprehensive reports with visualizations
3. Detect trends and anomalies in data
4. Create predictive models and forecasts
5. Provide actionable insights and recommendations`,
      tools: [
        { name: 'query_data', description: 'Query analytics data', parameters: { query: 'string' }, handler: 'data-query' },
        { name: 'generate_report', description: 'Generate report', parameters: { type: 'string', period: 'string' }, handler: 'report-generator' },
        { name: 'forecast', description: 'Generate forecast', parameters: { metric: 'string', horizon: 'number' }, handler: 'forecaster' },
      ],
      metadata: { version: '2.0', author: 'Trancendos' },
    },
    requiredIntegrations: ['database', 'grafana'],
    estimatedCost: 'medium',
  },

  // Serenity - Customer Support Agent
  {
    id: 'serenity-support',
    name: 'Serenity',
    description: 'Customer support agent that handles inquiries, resolves issues, and escalates complex problems.',
    category: 'support',
    icon: '💬',
    config: {
      name: 'Serenity',
      type: 'assistant',
      model: 'gpt-4o-mini',
      capabilities: ['customer-support', 'issue-resolution', 'faq-answering', 'ticket-management'],
      maxConcurrentTasks: 15,
      priority: 9,
      temperature: 0.6,
      maxTokens: 2048,
      systemPrompt: `You are Serenity, a customer support agent. Your responsibilities:
1. Handle customer inquiries with empathy and professionalism
2. Resolve common issues using the knowledge base
3. Escalate complex problems to human agents
4. Track and manage support tickets
5. Collect feedback and improve support quality`,
      tools: [
        { name: 'search_kb', description: 'Search knowledge base', parameters: { query: 'string' }, handler: 'kb-search' },
        { name: 'create_ticket', description: 'Create support ticket', parameters: { title: 'string', description: 'string' }, handler: 'ticket-creator' },
        { name: 'escalate', description: 'Escalate to human', parameters: { reason: 'string' }, handler: 'escalator' },
      ],
      metadata: { version: '2.0', author: 'Trancendos' },
    },
    requiredIntegrations: ['zendesk', 'slack'],
    estimatedCost: 'low',
  },

  // Oracle - Decision Support Agent
  {
    id: 'oracle-decision',
    name: 'Oracle',
    description: 'Strategic decision support agent that analyzes options, evaluates risks, and provides recommendations.',
    category: 'strategy',
    icon: '🔮',
    config: {
      name: 'Oracle',
      type: 'specialist',
      model: 'gpt-4',
      capabilities: ['decision-analysis', 'risk-assessment', 'scenario-planning', 'recommendation'],
      maxConcurrentTasks: 2,
      priority: 8,
      temperature: 0.4,
      maxTokens: 8192,
      systemPrompt: `You are Oracle, a strategic decision support agent. Your responsibilities:
1. Analyze complex decisions with multiple variables
2. Evaluate risks and potential outcomes
3. Create scenario plans and contingencies
4. Provide data-driven recommendations
5. Track decision outcomes for continuous improvement`,
      tools: [
        { name: 'analyze_options', description: 'Analyze decision options', parameters: { options: 'array' }, handler: 'option-analyzer' },
        { name: 'assess_risk', description: 'Assess risk', parameters: { scenario: 'string' }, handler: 'risk-assessor' },
        { name: 'recommend', description: 'Generate recommendation', parameters: { context: 'string' }, handler: 'recommender' },
      ],
      metadata: { version: '2.0', author: 'Trancendos' },
    },
    requiredIntegrations: ['database'],
    estimatedCost: 'high',
  },

  // Sentinel - Infrastructure Agent
  {
    id: 'sentinel-infrastructure',
    name: 'Sentinel',
    description: 'Infrastructure monitoring agent that watches system health, optimizes resources, and prevents outages.',
    category: 'infrastructure',
    icon: '🏗️',
    config: {
      name: 'Sentinel',
      type: 'supervisor',
      model: 'gpt-4o-mini',
      capabilities: ['infrastructure-monitoring', 'resource-optimization', 'incident-prevention', 'auto-remediation'],
      maxConcurrentTasks: 10,
      priority: 10,
      temperature: 0.1,
      maxTokens: 4096,
      systemPrompt: `You are Sentinel, an infrastructure monitoring agent. Your responsibilities:
1. Monitor system health metrics (CPU, memory, disk, network)
2. Detect and prevent potential outages
3. Optimize resource allocation and scaling
4. Execute auto-remediation for known issues
5. Generate infrastructure reports and recommendations`,
      tools: [
        { name: 'check_health', description: 'Check system health', parameters: { service: 'string' }, handler: 'health-checker' },
        { name: 'scale_service', description: 'Scale a service', parameters: { service: 'string', replicas: 'number' }, handler: 'scaler' },
        { name: 'remediate', description: 'Auto-remediate issue', parameters: { issue: 'string' }, handler: 'remediator' },
      ],
      metadata: { version: '2.0', author: 'Trancendos' },
    },
    requiredIntegrations: ['prometheus', 'grafana', 'pagerduty'],
    estimatedCost: 'low',
  },
];

/**
 * Get template by ID
 */
export function getTemplate(id: string): AgentTemplate | undefined {
  return AgentTemplates.find(t => t.id === id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): AgentTemplate[] {
  return AgentTemplates.filter(t => t.category === category);
}

/**
 * Get all template categories
 */
export function getCategories(): string[] {
  return [...new Set(AgentTemplates.map(t => t.category))];
}

/**
 * Create agent config from template
 */
export function createFromTemplate(templateId: string, overrides?: Partial<AgentConfig>): AgentConfig {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`Template '${templateId}' not found`);

  return {
    ...template.config,
    id: `${template.id}-${Date.now().toString(36)}`,
    ...overrides,
  };
}