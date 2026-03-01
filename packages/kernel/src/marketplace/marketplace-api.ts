/**
 * Marketplace API Router
 * 
 * RESTful API endpoints for the Infinity Portal marketplace.
 * Provides a complete interface for browsing, installing,
 * configuring, and managing marketplace services.
 * 
 * Endpoints:
 * ```
 * GET    /api/marketplace/catalog          - Browse catalog
 * GET    /api/marketplace/catalog/:id      - Get service details
 * POST   /api/marketplace/catalog          - Publish service
 * DELETE /api/marketplace/catalog/:id      - Unpublish service
 * 
 * GET    /api/marketplace/installed        - List installed services
 * POST   /api/marketplace/install/:id      - Install service
 * DELETE /api/marketplace/install/:id      - Uninstall service
 * POST   /api/marketplace/upgrade/:id      - Upgrade service
 * POST   /api/marketplace/start/:id        - Start service
 * POST   /api/marketplace/stop/:id         - Stop service
 * PUT    /api/marketplace/config/:id       - Configure service
 * 
 * GET    /api/marketplace/reviews/:id      - Get reviews
 * POST   /api/marketplace/reviews/:id      - Add review
 * 
 * GET    /api/marketplace/billing/summary  - Billing summary
 * GET    /api/marketplace/billing/invoices - List invoices
 * POST   /api/marketplace/billing/subscribe - Subscribe to service
 * DELETE /api/marketplace/billing/subscribe/:id - Cancel subscription
 * POST   /api/marketplace/billing/usage    - Record usage
 * 
 * GET    /api/marketplace/stats            - Marketplace stats
 * GET    /api/marketplace/health           - Health check
 * ```
 */

import type { ServiceManifest, ServiceCategory } from './service-package';
import type {
  CatalogSearchOptions,
  CatalogSearchResult,
  InstalledService,
  MarketplaceEntry,
  ServiceReview,
} from './marketplace-registry';
import { MarketplaceRegistry } from './marketplace-registry';
import type {
  BillingAccount,
  Invoice,
  Subscription,
  Payment,
} from './billing-system';
import { BillingSystem } from './billing-system';

// ============================================================
// API TYPES
// ============================================================

export interface ApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  userId?: string;
  accountId?: string;
}

export interface ApiResponse<T = unknown> {
  status: number;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    total?: number;
    offset?: number;
    limit?: number;
    requestId: string;
    timestamp: number;
  };
}

export type RouteHandler = (req: ApiRequest) => Promise<ApiResponse>;

export interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
  auth: boolean;
  description: string;
}

// ============================================================
// MARKETPLACE API
// ============================================================

export class MarketplaceAPI {
  private registry: MarketplaceRegistry;
  private billing: BillingSystem;
  private routes: Route[] = [];

  constructor(registry?: MarketplaceRegistry, billing?: BillingSystem) {
    this.registry = registry || new MarketplaceRegistry();
    this.billing = billing || new BillingSystem();
    this.registerRoutes();
  }

  /**
   * Get the marketplace registry instance
   */
  getRegistry(): MarketplaceRegistry {
    return this.registry;
  }

  /**
   * Get the billing system instance
   */
  getBilling(): BillingSystem {
    return this.billing;
  }

  /**
   * Get all registered routes
   */
  getRoutes(): Route[] {
    return [...this.routes];
  }

  /**
   * Handle an API request
   */
  async handleRequest(req: ApiRequest): Promise<ApiResponse> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Find matching route
    const route = this.findRoute(req.method, req.path);
    if (!route) {
      return {
        status: 404,
        error: 'Not Found',
        message: `No route found for ${req.method} ${req.path}`,
        meta: { requestId, timestamp: Date.now() },
      };
    }

    // Check authentication
    if (route.auth && !req.userId) {
      return {
        status: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
        meta: { requestId, timestamp: Date.now() },
      };
    }

    try {
      // Extract path params
      req.params = this.extractParams(route.path, req.path);

      const response = await route.handler(req);
      response.meta = {
        ...response.meta,
        requestId,
        timestamp: Date.now(),
      };
      return response;
    } catch (error) {
      console.error(`[MarketplaceAPI] Error handling ${req.method} ${req.path}:`, error);
      return {
        status: 500,
        error: 'Internal Server Error',
        message: String(error),
        meta: { requestId, timestamp: Date.now() },
      };
    }
  }

  // ============================================================
  // ROUTE REGISTRATION
  // ============================================================

  private registerRoutes(): void {
    // Catalog routes
    this.addRoute('GET', '/api/marketplace/catalog', false, 'Browse marketplace catalog', this.handleCatalogSearch.bind(this));
    this.addRoute('GET', '/api/marketplace/catalog/:id', false, 'Get service details', this.handleGetService.bind(this));
    this.addRoute('POST', '/api/marketplace/catalog', true, 'Publish a service', this.handlePublishService.bind(this));
    this.addRoute('DELETE', '/api/marketplace/catalog/:id', true, 'Unpublish a service', this.handleUnpublishService.bind(this));

    // Installation routes
    this.addRoute('GET', '/api/marketplace/installed', true, 'List installed services', this.handleListInstalled.bind(this));
    this.addRoute('POST', '/api/marketplace/install/:id', true, 'Install a service', this.handleInstallService.bind(this));
    this.addRoute('DELETE', '/api/marketplace/install/:id', true, 'Uninstall a service', this.handleUninstallService.bind(this));
    this.addRoute('POST', '/api/marketplace/upgrade/:id', true, 'Upgrade a service', this.handleUpgradeService.bind(this));
    this.addRoute('POST', '/api/marketplace/start/:id', true, 'Start a service', this.handleStartService.bind(this));
    this.addRoute('POST', '/api/marketplace/stop/:id', true, 'Stop a service', this.handleStopService.bind(this));
    this.addRoute('PUT', '/api/marketplace/config/:id', true, 'Configure a service', this.handleConfigureService.bind(this));

    // Review routes
    this.addRoute('GET', '/api/marketplace/reviews/:id', false, 'Get service reviews', this.handleGetReviews.bind(this));
    this.addRoute('POST', '/api/marketplace/reviews/:id', true, 'Add a review', this.handleAddReview.bind(this));

    // Billing routes
    this.addRoute('GET', '/api/marketplace/billing/summary', true, 'Get billing summary', this.handleBillingSummary.bind(this));
    this.addRoute('GET', '/api/marketplace/billing/invoices', true, 'List invoices', this.handleListInvoices.bind(this));
    this.addRoute('POST', '/api/marketplace/billing/subscribe', true, 'Subscribe to a service', this.handleSubscribe.bind(this));
    this.addRoute('DELETE', '/api/marketplace/billing/subscribe/:id', true, 'Cancel subscription', this.handleCancelSubscription.bind(this));
    this.addRoute('POST', '/api/marketplace/billing/usage', true, 'Record usage', this.handleRecordUsage.bind(this));

    // Stats & health
    this.addRoute('GET', '/api/marketplace/stats', false, 'Get marketplace stats', this.handleGetStats.bind(this));
    this.addRoute('GET', '/api/marketplace/health', false, 'Health check', this.handleHealthCheck.bind(this));
    this.addRoute('GET', '/api/marketplace/categories', false, 'List categories', this.handleListCategories.bind(this));
  }

  private addRoute(method: string, path: string, auth: boolean, description: string, handler: RouteHandler): void {
    this.routes.push({ method, path, handler, auth, description });
  }

  // ============================================================
  // CATALOG HANDLERS
  // ============================================================

  private async handleCatalogSearch(req: ApiRequest): Promise<ApiResponse<CatalogSearchResult>> {
    const options: CatalogSearchOptions = {
      query: req.query.q || req.query.query,
      category: req.query.category as ServiceCategory,
      pricingType: req.query.pricing as any,
      maturity: req.query.maturity as any,
      tags: req.query.tags ? req.query.tags.split(',') : undefined,
      sortBy: (req.query.sortBy as any) || 'name',
      sortOrder: (req.query.sortOrder as any) || 'asc',
      offset: parseInt(req.query.offset || '0'),
      limit: Math.min(parseInt(req.query.limit || '20'), 100),
      featured: req.query.featured === 'true',
      minRating: req.query.minRating ? parseFloat(req.query.minRating) : undefined,
    };

    const result = this.registry.search(options);
    return {
      status: 200,
      data: result,
      meta: {
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        requestId: '',
        timestamp: Date.now(),
      },
    };
  }

  private async handleGetService(req: ApiRequest): Promise<ApiResponse<MarketplaceEntry>> {
    const serviceId = req.params.id;
    const manifest = this.registry.getService(serviceId);

    if (!manifest) {
      return { status: 404, error: 'Not Found', message: `Service ${serviceId} not found` };
    }

    const installed = this.registry.getInstalledService(serviceId);
    const reviews = this.registry.getReviews(serviceId, { limit: 10 });
    const reviewSummary = this.registry.getReviews(serviceId);

    return {
      status: 200,
      data: {
        manifest,
        stats: {
          totalInstalls: 0,
          activeInstalls: 0,
          weeklyInstalls: 0,
          monthlyInstalls: 0,
          lastPublished: Date.now(),
          publishCount: 1,
        },
        reviews: {
          averageRating: 0,
          totalReviews: reviewSummary.length,
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        },
        installationStatus: installed?.status || 'not_installed',
      },
    };
  }

  private async handlePublishService(req: ApiRequest): Promise<ApiResponse> {
    const manifest = req.body as unknown as ServiceManifest;
    const result = this.registry.publish(manifest);

    if (!result.success) {
      return { status: 400, error: 'Validation Error', message: result.errors?.join('; ') };
    }

    return { status: 201, data: { published: true, serviceId: manifest.id, version: manifest.version } };
  }

  private async handleUnpublishService(req: ApiRequest): Promise<ApiResponse> {
    const serviceId = req.params.id;
    const success = this.registry.unpublish(serviceId);

    if (!success) {
      return { status: 400, error: 'Cannot unpublish', message: 'Service not found or has dependents' };
    }

    return { status: 200, data: { unpublished: true, serviceId } };
  }

  // ============================================================
  // INSTALLATION HANDLERS
  // ============================================================

  private async handleListInstalled(req: ApiRequest): Promise<ApiResponse<InstalledService[]>> {
    const services = this.registry.getInstalledServices();
    return { status: 200, data: services };
  }

  private async handleInstallService(req: ApiRequest): Promise<ApiResponse> {
    const serviceId = req.params.id;
    const config = (req.body.config as Record<string, unknown>) || {};
    const metadata = (req.body.metadata as any) || {};

    if (req.userId) {
      metadata.installedBy = req.userId;
    }

    const result = await this.registry.install(serviceId, config, metadata);

    if (!result.success) {
      return { status: 400, error: 'Installation Failed', message: result.error };
    }

    return { status: 201, data: { installed: true, serviceId } };
  }

  private async handleUninstallService(req: ApiRequest): Promise<ApiResponse> {
    const serviceId = req.params.id;
    const result = await this.registry.uninstall(serviceId);

    if (!result.success) {
      return { status: 400, error: 'Uninstallation Failed', message: result.error };
    }

    return { status: 200, data: { uninstalled: true, serviceId } };
  }

  private async handleUpgradeService(req: ApiRequest): Promise<ApiResponse> {
    const serviceId = req.params.id;
    const targetVersion = req.body.version as string | undefined;
    const result = await this.registry.upgrade(serviceId, targetVersion);

    if (!result.success) {
      return { status: 400, error: 'Upgrade Failed', message: result.error };
    }

    return { status: 200, data: { upgraded: true, serviceId } };
  }

  private async handleStartService(req: ApiRequest): Promise<ApiResponse> {
    const serviceId = req.params.id;
    const result = await this.registry.startService(serviceId);

    if (!result.success) {
      return { status: 400, error: 'Start Failed', message: result.error };
    }

    return { status: 200, data: { started: true, serviceId } };
  }

  private async handleStopService(req: ApiRequest): Promise<ApiResponse> {
    const serviceId = req.params.id;
    const result = await this.registry.stopService(serviceId);

    if (!result.success) {
      return { status: 400, error: 'Stop Failed', message: result.error };
    }

    return { status: 200, data: { stopped: true, serviceId } };
  }

  private async handleConfigureService(req: ApiRequest): Promise<ApiResponse> {
    const serviceId = req.params.id;
    const config = req.body as Record<string, unknown>;
    const result = this.registry.configure(serviceId, config);

    if (!result.success) {
      return { status: 400, error: 'Configuration Failed', message: result.error };
    }

    return { status: 200, data: { configured: true, serviceId } };
  }

  // ============================================================
  // REVIEW HANDLERS
  // ============================================================

  private async handleGetReviews(req: ApiRequest): Promise<ApiResponse<ServiceReview[]>> {
    const serviceId = req.params.id;
    const sortBy = (req.query.sortBy as 'recent' | 'helpful' | 'rating') || 'recent';
    const limit = parseInt(req.query.limit || '20');

    const reviews = this.registry.getReviews(serviceId, { sortBy, limit });
    return { status: 200, data: reviews };
  }

  private async handleAddReview(req: ApiRequest): Promise<ApiResponse<ServiceReview>> {
    const serviceId = req.params.id;

    if (!req.userId) {
      return { status: 401, error: 'Unauthorized', message: 'Must be logged in to review' };
    }

    const rating = req.body.rating as number;
    if (!rating || rating < 1 || rating > 5) {
      return { status: 400, error: 'Invalid Rating', message: 'Rating must be between 1 and 5' };
    }

    const review = this.registry.addReview({
      serviceId,
      userId: req.userId,
      userName: (req.body.userName as string) || 'Anonymous',
      rating,
      title: (req.body.title as string) || '',
      body: (req.body.body as string) || '',
      verified: true,
    });

    return { status: 201, data: review };
  }

  // ============================================================
  // BILLING HANDLERS
  // ============================================================

  private async handleBillingSummary(req: ApiRequest): Promise<ApiResponse> {
    if (!req.accountId) {
      return { status: 400, error: 'No Account', message: 'Billing account required' };
    }

    const summary = this.billing.getBillingSummary(req.accountId);
    return { status: 200, data: summary };
  }

  private async handleListInvoices(req: ApiRequest): Promise<ApiResponse<Invoice[]>> {
    if (!req.accountId) {
      return { status: 400, error: 'No Account', message: 'Billing account required' };
    }

    const invoices = this.billing.invoices.getByAccount(req.accountId);
    return { status: 200, data: invoices };
  }

  private async handleSubscribe(req: ApiRequest): Promise<ApiResponse> {
    if (!req.accountId) {
      return { status: 400, error: 'No Account', message: 'Billing account required' };
    }

    const serviceId = req.body.serviceId as string;
    if (!serviceId) {
      return { status: 400, error: 'Missing Service', message: 'serviceId is required' };
    }

    const manifest = this.registry.getService(serviceId);
    if (!manifest) {
      return { status: 404, error: 'Not Found', message: `Service ${serviceId} not found` };
    }

    const subscription = this.billing.subscribe(
      req.accountId,
      serviceId,
      manifest.listing.pricing,
      req.body.tier as string,
      req.body.period as any
    );

    if (!subscription) {
      return { status: 400, error: 'Subscription Failed', message: 'Could not create subscription' };
    }

    return { status: 201, data: subscription };
  }

  private async handleCancelSubscription(req: ApiRequest): Promise<ApiResponse> {
    const subscriptionId = req.params.id;
    const immediate = req.body.immediate === true;

    const success = this.billing.subscriptions.cancel(subscriptionId, immediate);
    if (!success) {
      return { status: 400, error: 'Cancel Failed', message: 'Subscription not found' };
    }

    return { status: 200, data: { cancelled: true, subscriptionId, immediate } };
  }

  private async handleRecordUsage(req: ApiRequest): Promise<ApiResponse> {
    if (!req.accountId) {
      return { status: 400, error: 'No Account', message: 'Billing account required' };
    }

    const { serviceId, metric, quantity, unit } = req.body as {
      serviceId: string;
      metric: string;
      quantity: number;
      unit: string;
    };

    if (!serviceId || !metric || quantity === undefined || !unit) {
      return { status: 400, error: 'Missing Fields', message: 'serviceId, metric, quantity, and unit are required' };
    }

    const record = this.billing.recordUsage(req.accountId, serviceId, metric, quantity, unit);
    return { status: 201, data: record };
  }

  // ============================================================
  // STATS & HEALTH HANDLERS
  // ============================================================

  private async handleGetStats(req: ApiRequest): Promise<ApiResponse> {
    const stats = this.registry.getOverviewStats();
    return { status: 200, data: stats };
  }

  private async handleHealthCheck(req: ApiRequest): Promise<ApiResponse> {
    return {
      status: 200,
      data: {
        status: 'healthy',
        service: 'marketplace',
        version: '1.0.0',
        uptime: process.uptime ? process.uptime() : 0,
        catalogSize: this.registry.getCatalogSize(),
        installedCount: this.registry.getInstalledServices().length,
        runningCount: this.registry.getRunningServices().length,
        timestamp: Date.now(),
      },
    };
  }

  private async handleListCategories(req: ApiRequest): Promise<ApiResponse> {
    const categories: { id: ServiceCategory; name: string; description: string; icon: string }[] = [
      { id: 'ai-agents', name: 'AI Agents', description: 'Intelligent autonomous agents', icon: '🤖' },
      { id: 'analytics', name: 'Analytics', description: 'Data analytics and insights', icon: '📊' },
      { id: 'automation', name: 'Automation', description: 'Workflow and process automation', icon: '⚡' },
      { id: 'communication', name: 'Communication', description: 'Messaging and collaboration', icon: '💬' },
      { id: 'compliance', name: 'Compliance', description: 'Regulatory compliance tools', icon: '✅' },
      { id: 'crm', name: 'CRM', description: 'Customer relationship management', icon: '👥' },
      { id: 'data-processing', name: 'Data Processing', description: 'ETL and data pipelines', icon: '🔄' },
      { id: 'developer-tools', name: 'Developer Tools', description: 'Development and debugging', icon: '🛠️' },
      { id: 'finance', name: 'Finance', description: 'Financial management tools', icon: '💰' },
      { id: 'hr', name: 'HR', description: 'Human resources management', icon: '🏢' },
      { id: 'integration', name: 'Integration', description: 'Third-party integrations', icon: '🔗' },
      { id: 'marketing', name: 'Marketing', description: 'Marketing automation', icon: '📣' },
      { id: 'productivity', name: 'Productivity', description: 'Productivity enhancement', icon: '🚀' },
      { id: 'project-management', name: 'Project Management', description: 'Project tracking and planning', icon: '📋' },
      { id: 'security', name: 'Security', description: 'Security and access control', icon: '🔒' },
      { id: 'storage', name: 'Storage', description: 'File and data storage', icon: '💾' },
      { id: 'utilities', name: 'Utilities', description: 'General purpose utilities', icon: '🔧' },
    ];

    return { status: 200, data: categories };
  }

  // ============================================================
  // ROUTE MATCHING
  // ============================================================

  private findRoute(method: string, path: string): Route | undefined {
    return this.routes.find(r => {
      if (r.method !== method) return false;
      return this.matchPath(r.path, path);
    });
  }

  private matchPath(pattern: string, path: string): boolean {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) return false;

    return patternParts.every((part, i) => {
      if (part.startsWith(':')) return true;
      return part === pathParts[i];
    });
  }

  private extractParams(pattern: string, path: string): Record<string, string> {
    const params: Record<string, string> = {};
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    patternParts.forEach((part, i) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = pathParts[i];
      }
    });

    return params;
  }
}