/**
 * API Gateway Configuration
 * 
 * Central entry point for all microservice requests.
 * Handles routing, authentication, rate limiting,
 * request transformation, and response aggregation.
 */

export interface RouteConfig {
  /** Route path pattern */
  path: string;
  /** HTTP methods */
  methods: ('GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS')[];
  /** Target service name */
  service: string;
  /** Target path (defaults to same as route path) */
  targetPath?: string;
  /** Whether authentication is required */
  auth: boolean;
  /** Required roles */
  roles?: string[];
  /** Rate limit override */
  rateLimit?: { maxRequests: number; windowMs: number };
  /** Request timeout in ms */
  timeout: number;
  /** Whether to use circuit breaker */
  circuitBreaker: boolean;
  /** Whether to cache responses */
  cache?: { ttl: number; varyBy?: string[] };
  /** Request transformation */
  transform?: {
    headers?: Record<string, string>;
    stripPrefix?: string;
    addPrefix?: string;
  };
  /** Middleware to apply */
  middleware?: string[];
  /** CORS configuration */
  cors?: CorsConfig;
}

export interface CorsConfig {
  origins: string[];
  methods: string[];
  headers: string[];
  credentials: boolean;
  maxAge: number;
}

export interface GatewayConfig {
  /** Gateway port */
  port: number;
  /** Global rate limit */
  globalRateLimit: { maxRequests: number; windowMs: number };
  /** Global timeout */
  globalTimeout: number;
  /** Default CORS configuration */
  defaultCors: CorsConfig;
  /** Routes */
  routes: RouteConfig[];
  /** Health check path */
  healthCheckPath: string;
  /** Metrics path */
  metricsPath: string;
}

/**
 * Default API Gateway configuration for Infinity Portal
 */
export const defaultGatewayConfig: GatewayConfig = {
  port: 8080,
  globalRateLimit: { maxRequests: 1000, windowMs: 60000 },
  globalTimeout: 30000,
  defaultCors: {
    origins: ['*'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
    credentials: true,
    maxAge: 86400,
  },
  healthCheckPath: '/health',
  metricsPath: '/metrics',
  routes: [
    // Authentication Service
    {
      path: '/api/v1/auth/*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      service: 'auth-service',
      auth: false,
      timeout: 10000,
      circuitBreaker: true,
      rateLimit: { maxRequests: 50, windowMs: 60000 },
    },
    // User Service
    {
      path: '/api/v1/users/*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      service: 'user-service',
      auth: true,
      timeout: 15000,
      circuitBreaker: true,
    },
    // AI Service
    {
      path: '/api/v1/ai/*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      service: 'ai-service',
      auth: true,
      roles: ['user', 'admin'],
      timeout: 60000,
      circuitBreaker: true,
      rateLimit: { maxRequests: 100, windowMs: 60000 },
    },
    // Agent Service
    {
      path: '/api/v1/agents/*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      service: 'agent-service',
      auth: true,
      timeout: 30000,
      circuitBreaker: true,
    },
    // Document Service
    {
      path: '/api/v1/documents/*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      service: 'document-service',
      auth: true,
      timeout: 15000,
      circuitBreaker: true,
      cache: { ttl: 300, varyBy: ['Authorization'] },
    },
    // File Service
    {
      path: '/api/v1/files/*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      service: 'file-service',
      auth: true,
      timeout: 30000,
      circuitBreaker: true,
    },
    // Workflow Service
    {
      path: '/api/v1/workflows/*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      service: 'workflow-service',
      auth: true,
      timeout: 30000,
      circuitBreaker: true,
    },
    // Notification Service
    {
      path: '/api/v1/notifications/*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      service: 'notification-service',
      auth: true,
      timeout: 10000,
      circuitBreaker: true,
    },
    // Billing Service
    {
      path: '/api/v1/billing/*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      service: 'billing-service',
      auth: true,
      roles: ['user', 'admin'],
      timeout: 15000,
      circuitBreaker: true,
    },
    // App Store Service
    {
      path: '/api/v1/marketplace/*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      service: 'marketplace-service',
      auth: true,
      timeout: 15000,
      circuitBreaker: true,
      cache: { ttl: 600, varyBy: ['Authorization'] },
    },
    // Compliance Service
    {
      path: '/api/v1/compliance/*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      service: 'compliance-service',
      auth: true,
      roles: ['admin'],
      timeout: 15000,
      circuitBreaker: true,
    },
    // Analytics Service
    {
      path: '/api/v1/analytics/*',
      methods: ['GET', 'POST'],
      service: 'analytics-service',
      auth: true,
      timeout: 30000,
      circuitBreaker: true,
      cache: { ttl: 60, varyBy: ['Authorization'] },
    },
    // Knowledge Base Service
    {
      path: '/api/v1/knowledge/*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      service: 'knowledge-service',
      auth: true,
      timeout: 15000,
      circuitBreaker: true,
      cache: { ttl: 300, varyBy: ['Authorization'] },
    },
    // Integration Service
    {
      path: '/api/v1/integrations/*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      service: 'integration-service',
      auth: true,
      timeout: 30000,
      circuitBreaker: true,
    },
    // Audit Service
    {
      path: '/api/v1/audit/*',
      methods: ['GET', 'POST'],
      service: 'audit-service',
      auth: true,
      roles: ['admin'],
      timeout: 15000,
      circuitBreaker: true,
    },
  ],
};

/**
 * Service extraction manifest - defines how to extract services from monolith
 */
export interface ServiceManifest {
  name: string;
  description: string;
  version: string;
  port: number;
  dependencies: string[];
  sourceRouters: string[];
  database: {
    schema: string;
    tables: string[];
    migrations: string[];
  };
  environment: Record<string, string>;
  healthCheck: string;
  readinessCheck: string;
}

export const serviceManifests: ServiceManifest[] = [
  {
    name: 'ai-service',
    description: 'AI inference, model management, and agent orchestration',
    version: '1.0.0',
    port: 8001,
    dependencies: ['auth-service', 'file-service', 'knowledge-service'],
    sourceRouters: ['ai', 'agents', 'ml_inference', 'ml_compliance'],
    database: {
      schema: 'ai',
      tables: ['models', 'agents', 'conversations', 'prompts', 'inference_logs'],
      migrations: ['001_create_ai_schema.sql'],
    },
    environment: {
      AI_MODEL_PATH: '/models',
      AI_MAX_TOKENS: '4096',
      AI_TEMPERATURE: '0.7',
    },
    healthCheck: '/health',
    readinessCheck: '/health/ready',
  },
  {
    name: 'billing-service',
    description: 'Billing, payments, subscriptions, and usage tracking',
    version: '1.0.0',
    port: 8002,
    dependencies: ['auth-service', 'notification-service'],
    sourceRouters: ['billing', 'subscriptions', 'payments'],
    database: {
      schema: 'billing',
      tables: ['invoices', 'payments', 'subscriptions', 'usage', 'plans'],
      migrations: ['001_create_billing_schema.sql'],
    },
    environment: {
      STRIPE_API_KEY: '',
      BILLING_WEBHOOK_SECRET: '',
    },
    healthCheck: '/health',
    readinessCheck: '/health/ready',
  },
  {
    name: 'document-service',
    description: 'Document management, versioning, and collaboration',
    version: '1.0.0',
    port: 8003,
    dependencies: ['auth-service', 'file-service'],
    sourceRouters: ['documents', 'templates'],
    database: {
      schema: 'documents',
      tables: ['documents', 'versions', 'collaborators', 'templates'],
      migrations: ['001_create_documents_schema.sql'],
    },
    environment: {
      MAX_DOCUMENT_SIZE: '50MB',
    },
    healthCheck: '/health',
    readinessCheck: '/health/ready',
  },
  {
    name: 'workflow-service',
    description: 'Workflow automation, task management, and scheduling',
    version: '1.0.0',
    port: 8004,
    dependencies: ['auth-service', 'notification-service', 'ai-service'],
    sourceRouters: ['workflows', 'tasks', 'schedules'],
    database: {
      schema: 'workflows',
      tables: ['workflows', 'tasks', 'executions', 'schedules', 'triggers'],
      migrations: ['001_create_workflows_schema.sql'],
    },
    environment: {
      WORKFLOW_MAX_STEPS: '100',
      WORKFLOW_TIMEOUT: '3600',
    },
    healthCheck: '/health',
    readinessCheck: '/health/ready',
  },
  {
    name: 'notification-service',
    description: 'Email, push, SMS, and in-app notifications',
    version: '1.0.0',
    port: 8005,
    dependencies: ['auth-service'],
    sourceRouters: ['notifications', 'email', 'push'],
    database: {
      schema: 'notifications',
      tables: ['notifications', 'templates', 'preferences', 'delivery_logs'],
      migrations: ['001_create_notifications_schema.sql'],
    },
    environment: {
      SMTP_HOST: '',
      SMTP_PORT: '587',
      PUSH_PROVIDER: 'firebase',
    },
    healthCheck: '/health',
    readinessCheck: '/health/ready',
  },
  {
    name: 'marketplace-service',
    description: 'App store, service marketplace, and plugin management',
    version: '1.0.0',
    port: 8006,
    dependencies: ['auth-service', 'billing-service'],
    sourceRouters: ['app_store', 'plugins', 'marketplace'],
    database: {
      schema: 'marketplace',
      tables: ['apps', 'plugins', 'reviews', 'installations', 'categories'],
      migrations: ['001_create_marketplace_schema.sql'],
    },
    environment: {
      MARKETPLACE_CDN_URL: '',
    },
    healthCheck: '/health',
    readinessCheck: '/health/ready',
  },
  {
    name: 'knowledge-service',
    description: 'Knowledge base, RAG, and semantic search',
    version: '1.0.0',
    port: 8007,
    dependencies: ['auth-service', 'ai-service', 'file-service'],
    sourceRouters: ['knowledge_base', 'search', 'embeddings'],
    database: {
      schema: 'knowledge',
      tables: ['articles', 'embeddings', 'collections', 'search_index'],
      migrations: ['001_create_knowledge_schema.sql'],
    },
    environment: {
      EMBEDDING_MODEL: 'text-embedding-3-small',
      VECTOR_DB_URL: '',
    },
    healthCheck: '/health',
    readinessCheck: '/health/ready',
  },
  {
    name: 'compliance-service',
    description: 'Compliance monitoring, audit trails, and policy enforcement',
    version: '1.0.0',
    port: 8008,
    dependencies: ['auth-service', 'audit-service'],
    sourceRouters: ['compliance', 'policies', 'controls'],
    database: {
      schema: 'compliance',
      tables: ['controls', 'policies', 'assessments', 'findings', 'evidence'],
      migrations: ['001_create_compliance_schema.sql'],
    },
    environment: {
      COMPLIANCE_FRAMEWORKS: 'ISO27001,SOC2,GDPR',
    },
    healthCheck: '/health',
    readinessCheck: '/health/ready',
  },
];