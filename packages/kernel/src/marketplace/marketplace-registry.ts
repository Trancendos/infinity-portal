/**
 * Marketplace Registry
 * 
 * Central registry for all marketplace services. Handles service
 * registration, discovery, installation, configuration, and lifecycle
 * management. Integrates with the Service Registry for runtime
 * service discovery and the Event Bus for async notifications.
 * 
 * Architecture:
 * ```
 * MarketplaceRegistry
 *   ├── ServiceCatalog (search, filter, browse)
 *   ├── InstallationManager (install, uninstall, upgrade)
 *   ├── ConfigurationManager (configure, validate)
 *   └── ReviewSystem (rate, review, report)
 * ```
 */

import type {
  ServiceManifest,
  ServiceCategory,
  PricingModel,
  ServiceDependency,
} from './service-package';
import { ServicePackager, DependencyResolver, VersionManager } from './service-package';

// ============================================================
// MARKETPLACE TYPES
// ============================================================

export type InstallationStatus =
  | 'not_installed'
  | 'installing'
  | 'installed'
  | 'configuring'
  | 'running'
  | 'stopped'
  | 'error'
  | 'upgrading'
  | 'uninstalling';

export interface InstalledService {
  /** Service manifest */
  manifest: ServiceManifest;
  /** Installation status */
  status: InstallationStatus;
  /** Installation timestamp */
  installedAt: number;
  /** Last updated timestamp */
  updatedAt: number;
  /** Current configuration */
  config: Record<string, unknown>;
  /** Installation metadata */
  metadata: InstallationMetadata;
  /** Usage statistics */
  usage: ServiceUsageStats;
}

export interface InstallationMetadata {
  /** Who installed the service */
  installedBy: string;
  /** Installation source */
  source: 'marketplace' | 'manual' | 'system';
  /** Auto-update enabled */
  autoUpdate: boolean;
  /** Pinned version (prevents auto-update) */
  pinnedVersion?: string;
  /** Installation notes */
  notes?: string;
}

export interface ServiceUsageStats {
  /** Total API calls */
  totalCalls: number;
  /** Calls in current billing period */
  periodCalls: number;
  /** Average response time (ms) */
  avgResponseTime: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Last active timestamp */
  lastActive: number;
  /** Data processed (bytes) */
  dataProcessed: number;
}

export interface ServiceReview {
  id: string;
  serviceId: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  helpful: number;
  verified: boolean;
}

export interface CatalogSearchOptions {
  /** Search query */
  query?: string;
  /** Filter by category */
  category?: ServiceCategory;
  /** Filter by pricing type */
  pricingType?: PricingModel['type'];
  /** Filter by maturity */
  maturity?: ServiceManifest['listing']['maturity'];
  /** Filter by tags */
  tags?: string[];
  /** Sort field */
  sortBy?: 'name' | 'rating' | 'installs' | 'updated' | 'price';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Pagination offset */
  offset?: number;
  /** Page size */
  limit?: number;
  /** Only show featured */
  featured?: boolean;
  /** Minimum rating */
  minRating?: number;
}

export interface CatalogSearchResult {
  services: MarketplaceEntry[];
  total: number;
  offset: number;
  limit: number;
  facets: SearchFacets;
}

export interface MarketplaceEntry {
  manifest: ServiceManifest;
  stats: MarketplaceStats;
  reviews: ReviewSummary;
  installationStatus: InstallationStatus;
}

export interface MarketplaceStats {
  totalInstalls: number;
  activeInstalls: number;
  weeklyInstalls: number;
  monthlyInstalls: number;
  lastPublished: number;
  publishCount: number;
}

export interface ReviewSummary {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: Record<number, number>;
}

export interface SearchFacets {
  categories: { category: ServiceCategory; count: number }[];
  pricingTypes: { type: PricingModel['type']; count: number }[];
  tags: { tag: string; count: number }[];
}

// ============================================================
// MARKETPLACE EVENTS
// ============================================================

export type MarketplaceEventType =
  | 'marketplace:service.published'
  | 'marketplace:service.unpublished'
  | 'marketplace:service.updated'
  | 'marketplace:service.installed'
  | 'marketplace:service.uninstalled'
  | 'marketplace:service.upgraded'
  | 'marketplace:service.started'
  | 'marketplace:service.stopped'
  | 'marketplace:service.error'
  | 'marketplace:service.configured'
  | 'marketplace:review.created'
  | 'marketplace:review.updated'
  | 'marketplace:billing.invoice'
  | 'marketplace:billing.payment';

export interface MarketplaceEvent {
  type: MarketplaceEventType;
  serviceId: string;
  payload: Record<string, unknown>;
  timestamp: number;
  userId?: string;
}

// ============================================================
// MARKETPLACE REGISTRY
// ============================================================

export class MarketplaceRegistry {
  /** All published services */
  private catalog: Map<string, ServiceManifest> = new Map();
  /** Marketplace statistics */
  private stats: Map<string, MarketplaceStats> = new Map();
  /** Installed services */
  private installed: Map<string, InstalledService> = new Map();
  /** Service reviews */
  private reviews: Map<string, ServiceReview[]> = new Map();
  /** Event listeners */
  private listeners: Map<MarketplaceEventType | '*', Set<(event: MarketplaceEvent) => void>> = new Map();
  /** Dependency resolver */
  private dependencyResolver: DependencyResolver = new DependencyResolver();

  constructor() {
    console.log('[Marketplace] Registry initialized');
  }

  // ============================================================
  // CATALOG MANAGEMENT
  // ============================================================

  /**
   * Publish a service to the marketplace
   */
  publish(manifest: ServiceManifest): { success: boolean; errors?: string[] } {
    const validation = ServicePackager.validate(manifest);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors.map(e => `${e.field}: ${e.message}`),
      };
    }

    // Check for existing service
    const existing = this.catalog.get(manifest.id);
    if (existing) {
      // Ensure version is newer
      if (VersionManager.compare(manifest.version, existing.version) <= 0) {
        return {
          success: false,
          errors: [`Version ${manifest.version} must be greater than current version ${existing.version}`],
        };
      }
    }

    this.catalog.set(manifest.id, manifest);

    // Update stats
    const currentStats = this.stats.get(manifest.id) || {
      totalInstalls: 0,
      activeInstalls: 0,
      weeklyInstalls: 0,
      monthlyInstalls: 0,
      lastPublished: 0,
      publishCount: 0,
    };
    currentStats.lastPublished = Date.now();
    currentStats.publishCount++;
    this.stats.set(manifest.id, currentStats);

    // Register available version for dependency resolution
    this.dependencyResolver.registerAvailable(manifest.id, [manifest.version]);

    this.emit({
      type: existing ? 'marketplace:service.updated' : 'marketplace:service.published',
      serviceId: manifest.id,
      payload: { version: manifest.version },
      timestamp: Date.now(),
    });

    console.log(`[Marketplace] Service published: ${manifest.id}@${manifest.version}`);
    return { success: true };
  }

  /**
   * Unpublish a service from the marketplace
   */
  unpublish(serviceId: string): boolean {
    if (!this.catalog.has(serviceId)) return false;

    // Check if any installed services depend on this
    const dependents = this.findDependents(serviceId);
    if (dependents.length > 0) {
      console.warn(`[Marketplace] Cannot unpublish ${serviceId}: ${dependents.length} services depend on it`);
      return false;
    }

    this.catalog.delete(serviceId);
    this.stats.delete(serviceId);

    this.emit({
      type: 'marketplace:service.unpublished',
      serviceId,
      payload: {},
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Get a service manifest by ID
   */
  getService(serviceId: string): ServiceManifest | undefined {
    return this.catalog.get(serviceId);
  }

  /**
   * Search the marketplace catalog
   */
  search(options: CatalogSearchOptions = {}): CatalogSearchResult {
    let results = Array.from(this.catalog.values());

    // Apply filters
    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.tags.some(t => t.toLowerCase().includes(query)) ||
        s.listing.tagline.toLowerCase().includes(query)
      );
    }

    if (options.category) {
      results = results.filter(s => s.category === options.category);
    }

    if (options.pricingType) {
      results = results.filter(s => s.listing.pricing.type === options.pricingType);
    }

    if (options.maturity) {
      results = results.filter(s => s.listing.maturity === options.maturity);
    }

    if (options.tags && options.tags.length > 0) {
      results = results.filter(s =>
        options.tags!.some(t => s.tags.includes(t))
      );
    }

    if (options.featured) {
      results = results.filter(s => s.listing.featured);
    }

    if (options.minRating) {
      const minRating = options.minRating;
      results = results.filter(s => {
        const reviewSummary = this.getReviewSummary(s.id);
        return reviewSummary.averageRating >= minRating;
      });
    }

    // Build facets before pagination
    const facets = this.buildFacets(results);

    // Sort
    const sortBy = options.sortBy || 'name';
    const sortOrder = options.sortOrder || 'asc';
    results.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'rating':
          comparison = this.getReviewSummary(a.id).averageRating - this.getReviewSummary(b.id).averageRating;
          break;
        case 'installs':
          comparison = (this.stats.get(a.id)?.totalInstalls || 0) - (this.stats.get(b.id)?.totalInstalls || 0);
          break;
        case 'updated':
          comparison = (this.stats.get(a.id)?.lastPublished || 0) - (this.stats.get(b.id)?.lastPublished || 0);
          break;
        case 'price':
          comparison = (a.listing.pricing.basePrice || 0) - (b.listing.pricing.basePrice || 0);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    const total = results.length;
    const offset = options.offset || 0;
    const limit = options.limit || 20;
    const paged = results.slice(offset, offset + limit);

    return {
      services: paged.map(manifest => ({
        manifest,
        stats: this.stats.get(manifest.id) || {
          totalInstalls: 0,
          activeInstalls: 0,
          weeklyInstalls: 0,
          monthlyInstalls: 0,
          lastPublished: 0,
          publishCount: 0,
        },
        reviews: this.getReviewSummary(manifest.id),
        installationStatus: this.installed.get(manifest.id)?.status || 'not_installed',
      })),
      total,
      offset,
      limit,
      facets,
    };
  }

  // ============================================================
  // INSTALLATION MANAGEMENT
  // ============================================================

  /**
   * Install a service from the marketplace
   */
  async install(
    serviceId: string,
    config: Record<string, unknown> = {},
    metadata: Partial<InstallationMetadata> = {}
  ): Promise<{ success: boolean; error?: string }> {
    const manifest = this.catalog.get(serviceId);
    if (!manifest) {
      return { success: false, error: `Service ${serviceId} not found in marketplace` };
    }

    // Check if already installed
    if (this.installed.has(serviceId)) {
      return { success: false, error: `Service ${serviceId} is already installed` };
    }

    // Check dependencies
    const depCheck = this.dependencyResolver.canInstall(manifest);
    if (!depCheck.installable) {
      return { success: false, error: `Missing dependencies: ${depCheck.missing.join(', ')}` };
    }

    // Validate configuration
    const configValidation = this.validateConfig(manifest, config);
    if (!configValidation.valid) {
      return { success: false, error: `Invalid configuration: ${configValidation.errors.join(', ')}` };
    }

    // Create installation record
    const installation: InstalledService = {
      manifest,
      status: 'installing',
      installedAt: Date.now(),
      updatedAt: Date.now(),
      config,
      metadata: {
        installedBy: metadata.installedBy || 'system',
        source: metadata.source || 'marketplace',
        autoUpdate: metadata.autoUpdate ?? true,
        pinnedVersion: metadata.pinnedVersion,
        notes: metadata.notes,
      },
      usage: {
        totalCalls: 0,
        periodCalls: 0,
        avgResponseTime: 0,
        errorRate: 0,
        lastActive: 0,
        dataProcessed: 0,
      },
    };

    this.installed.set(serviceId, installation);

    try {
      // Execute lifecycle hooks
      console.log(`[Marketplace] Installing ${serviceId}@${manifest.version}...`);

      // Simulate installation process
      installation.status = 'configuring';
      this.installed.set(serviceId, installation);

      installation.status = 'installed';
      installation.updatedAt = Date.now();
      this.installed.set(serviceId, installation);

      // Update stats
      const stats = this.stats.get(serviceId);
      if (stats) {
        stats.totalInstalls++;
        stats.activeInstalls++;
        stats.weeklyInstalls++;
        stats.monthlyInstalls++;
      }

      this.emit({
        type: 'marketplace:service.installed',
        serviceId,
        payload: { version: manifest.version, config },
        timestamp: Date.now(),
      });

      console.log(`[Marketplace] ✓ Service installed: ${serviceId}@${manifest.version}`);
      return { success: true };
    } catch (error) {
      installation.status = 'error';
      this.installed.set(serviceId, installation);
      return { success: false, error: `Installation failed: ${error}` };
    }
  }

  /**
   * Uninstall a service
   */
  async uninstall(serviceId: string): Promise<{ success: boolean; error?: string }> {
    const installation = this.installed.get(serviceId);
    if (!installation) {
      return { success: false, error: `Service ${serviceId} is not installed` };
    }

    // Check if other installed services depend on this
    const dependents = this.findInstalledDependents(serviceId);
    if (dependents.length > 0) {
      return {
        success: false,
        error: `Cannot uninstall: ${dependents.map(d => d.manifest.id).join(', ')} depend on this service`,
      };
    }

    try {
      installation.status = 'uninstalling';
      this.installed.set(serviceId, installation);

      console.log(`[Marketplace] Uninstalling ${serviceId}...`);

      this.installed.delete(serviceId);

      // Update stats
      const stats = this.stats.get(serviceId);
      if (stats) {
        stats.activeInstalls = Math.max(0, stats.activeInstalls - 1);
      }

      this.emit({
        type: 'marketplace:service.uninstalled',
        serviceId,
        payload: { version: installation.manifest.version },
        timestamp: Date.now(),
      });

      console.log(`[Marketplace] ✓ Service uninstalled: ${serviceId}`);
      return { success: true };
    } catch (error) {
      installation.status = 'error';
      this.installed.set(serviceId, installation);
      return { success: false, error: `Uninstallation failed: ${error}` };
    }
  }

  /**
   * Upgrade an installed service to a new version
   */
  async upgrade(serviceId: string, targetVersion?: string): Promise<{ success: boolean; error?: string }> {
    const installation = this.installed.get(serviceId);
    if (!installation) {
      return { success: false, error: `Service ${serviceId} is not installed` };
    }

    const latestManifest = this.catalog.get(serviceId);
    if (!latestManifest) {
      return { success: false, error: `Service ${serviceId} not found in marketplace` };
    }

    const newVersion = targetVersion || latestManifest.version;
    if (VersionManager.compare(newVersion, installation.manifest.version) <= 0) {
      return { success: false, error: `Already at version ${installation.manifest.version}` };
    }

    // Check if pinned
    if (installation.metadata.pinnedVersion) {
      return { success: false, error: `Service is pinned to version ${installation.metadata.pinnedVersion}` };
    }

    try {
      installation.status = 'upgrading';
      this.installed.set(serviceId, installation);

      console.log(`[Marketplace] Upgrading ${serviceId}: ${installation.manifest.version} → ${newVersion}...`);

      installation.manifest = latestManifest;
      installation.status = 'installed';
      installation.updatedAt = Date.now();
      this.installed.set(serviceId, installation);

      this.emit({
        type: 'marketplace:service.upgraded',
        serviceId,
        payload: { fromVersion: installation.manifest.version, toVersion: newVersion },
        timestamp: Date.now(),
      });

      console.log(`[Marketplace] ✓ Service upgraded: ${serviceId}@${newVersion}`);
      return { success: true };
    } catch (error) {
      installation.status = 'error';
      this.installed.set(serviceId, installation);
      return { success: false, error: `Upgrade failed: ${error}` };
    }
  }

  /**
   * Start an installed service
   */
  async startService(serviceId: string): Promise<{ success: boolean; error?: string }> {
    const installation = this.installed.get(serviceId);
    if (!installation) {
      return { success: false, error: `Service ${serviceId} is not installed` };
    }

    if (installation.status === 'running') {
      return { success: false, error: `Service ${serviceId} is already running` };
    }

    installation.status = 'running';
    installation.updatedAt = Date.now();
    this.installed.set(serviceId, installation);

    this.emit({
      type: 'marketplace:service.started',
      serviceId,
      payload: {},
      timestamp: Date.now(),
    });

    console.log(`[Marketplace] ✓ Service started: ${serviceId}`);
    return { success: true };
  }

  /**
   * Stop an installed service
   */
  async stopService(serviceId: string): Promise<{ success: boolean; error?: string }> {
    const installation = this.installed.get(serviceId);
    if (!installation) {
      return { success: false, error: `Service ${serviceId} is not installed` };
    }

    if (installation.status !== 'running') {
      return { success: false, error: `Service ${serviceId} is not running` };
    }

    installation.status = 'stopped';
    installation.updatedAt = Date.now();
    this.installed.set(serviceId, installation);

    this.emit({
      type: 'marketplace:service.stopped',
      serviceId,
      payload: {},
      timestamp: Date.now(),
    });

    console.log(`[Marketplace] ✓ Service stopped: ${serviceId}`);
    return { success: true };
  }

  /**
   * Update service configuration
   */
  configure(
    serviceId: string,
    config: Record<string, unknown>
  ): { success: boolean; error?: string } {
    const installation = this.installed.get(serviceId);
    if (!installation) {
      return { success: false, error: `Service ${serviceId} is not installed` };
    }

    const validation = this.validateConfig(installation.manifest, config);
    if (!validation.valid) {
      return { success: false, error: `Invalid configuration: ${validation.errors.join(', ')}` };
    }

    installation.config = { ...installation.config, ...config };
    installation.updatedAt = Date.now();
    this.installed.set(serviceId, installation);

    this.emit({
      type: 'marketplace:service.configured',
      serviceId,
      payload: { config },
      timestamp: Date.now(),
    });

    return { success: true };
  }

  // ============================================================
  // REVIEW SYSTEM
  // ============================================================

  /**
   * Add a review for a service
   */
  addReview(review: Omit<ServiceReview, 'id' | 'createdAt' | 'updatedAt' | 'helpful'>): ServiceReview {
    const fullReview: ServiceReview = {
      ...review,
      id: `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      helpful: 0,
    };

    const serviceReviews = this.reviews.get(review.serviceId) || [];
    serviceReviews.push(fullReview);
    this.reviews.set(review.serviceId, serviceReviews);

    this.emit({
      type: 'marketplace:review.created',
      serviceId: review.serviceId,
      payload: { reviewId: fullReview.id, rating: review.rating },
      timestamp: Date.now(),
      userId: review.userId,
    });

    return fullReview;
  }

  /**
   * Get reviews for a service
   */
  getReviews(serviceId: string, options?: { sortBy?: 'recent' | 'helpful' | 'rating'; limit?: number }): ServiceReview[] {
    let reviews = this.reviews.get(serviceId) || [];

    if (options?.sortBy === 'helpful') {
      reviews = [...reviews].sort((a, b) => b.helpful - a.helpful);
    } else if (options?.sortBy === 'rating') {
      reviews = [...reviews].sort((a, b) => b.rating - a.rating);
    } else {
      reviews = [...reviews].sort((a, b) => b.createdAt - a.createdAt);
    }

    if (options?.limit) {
      reviews = reviews.slice(0, options.limit);
    }

    return reviews;
  }

  /**
   * Get review summary for a service
   */
  getReviewSummary(serviceId: string): ReviewSummary {
    const reviews = this.reviews.get(serviceId) || [];
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (const review of reviews) {
      const rounded = Math.round(review.rating);
      if (rounded >= 1 && rounded <= 5) {
        distribution[rounded]++;
      }
    }

    const total = reviews.length;
    const average = total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;

    return {
      averageRating: Math.round(average * 10) / 10,
      totalReviews: total,
      ratingDistribution: distribution,
    };
  }

  // ============================================================
  // QUERY METHODS
  // ============================================================

  /**
   * Get all installed services
   */
  getInstalledServices(): InstalledService[] {
    return Array.from(this.installed.values());
  }

  /**
   * Get installed service by ID
   */
  getInstalledService(serviceId: string): InstalledService | undefined {
    return this.installed.get(serviceId);
  }

  /**
   * Get all running services
   */
  getRunningServices(): InstalledService[] {
    return this.getInstalledServices().filter(s => s.status === 'running');
  }

  /**
   * Get catalog size
   */
  getCatalogSize(): number {
    return this.catalog.size;
  }

  /**
   * Get marketplace overview stats
   */
  getOverviewStats(): {
    totalServices: number;
    totalInstalled: number;
    totalRunning: number;
    categoryCounts: Record<string, number>;
    topServices: { id: string; name: string; installs: number }[];
  } {
    const categoryCounts: Record<string, number> = {};
    for (const manifest of this.catalog.values()) {
      categoryCounts[manifest.category] = (categoryCounts[manifest.category] || 0) + 1;
    }

    const topServices = Array.from(this.catalog.values())
      .map(m => ({
        id: m.id,
        name: m.name,
        installs: this.stats.get(m.id)?.totalInstalls || 0,
      }))
      .sort((a, b) => b.installs - a.installs)
      .slice(0, 10);

    return {
      totalServices: this.catalog.size,
      totalInstalled: this.installed.size,
      totalRunning: this.getRunningServices().length,
      categoryCounts,
      topServices,
    };
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private validateConfig(
    manifest: ServiceManifest,
    config: Record<string, unknown>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const field of manifest.configSchema.fields) {
      const value = config[field.key];

      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field.key} is required`);
        continue;
      }

      if (value !== undefined && value !== null) {
        // Type validation
        switch (field.type) {
          case 'number':
            if (typeof value !== 'number') {
              errors.push(`${field.key} must be a number`);
            } else {
              if (field.validation?.min !== undefined && value < field.validation.min) {
                errors.push(`${field.key} must be >= ${field.validation.min}`);
              }
              if (field.validation?.max !== undefined && value > field.validation.max) {
                errors.push(`${field.key} must be <= ${field.validation.max}`);
              }
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              errors.push(`${field.key} must be a boolean`);
            }
            break;
          case 'string':
          case 'secret':
          case 'url':
          case 'email':
            if (typeof value !== 'string') {
              errors.push(`${field.key} must be a string`);
            } else {
              if (field.validation?.minLength && value.length < field.validation.minLength) {
                errors.push(`${field.key} must be at least ${field.validation.minLength} characters`);
              }
              if (field.validation?.maxLength && value.length > field.validation.maxLength) {
                errors.push(`${field.key} must be at most ${field.validation.maxLength} characters`);
              }
              if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(value)) {
                errors.push(field.validation.patternMessage || `${field.key} does not match required pattern`);
              }
              if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                errors.push(`${field.key} must be a valid email address`);
              }
              if (field.type === 'url' && !/^https?:\/\/.+/.test(value)) {
                errors.push(`${field.key} must be a valid URL`);
              }
            }
            break;
          case 'select':
            if (field.options && !field.options.some(o => o.value === value)) {
              errors.push(`${field.key} must be one of: ${field.options.map(o => o.value).join(', ')}`);
            }
            break;
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private findDependents(serviceId: string): ServiceManifest[] {
    return Array.from(this.catalog.values()).filter(m =>
      m.dependencies.some(d => d.serviceId === serviceId)
    );
  }

  private findInstalledDependents(serviceId: string): InstalledService[] {
    return Array.from(this.installed.values()).filter(s =>
      s.manifest.dependencies.some(d => d.serviceId === serviceId)
    );
  }

  private buildFacets(services: ServiceManifest[]): SearchFacets {
    const categoryMap = new Map<ServiceCategory, number>();
    const pricingMap = new Map<PricingModel['type'], number>();
    const tagMap = new Map<string, number>();

    for (const service of services) {
      categoryMap.set(service.category, (categoryMap.get(service.category) || 0) + 1);
      pricingMap.set(service.listing.pricing.type, (pricingMap.get(service.listing.pricing.type) || 0) + 1);
      for (const tag of service.tags) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      }
    }

    return {
      categories: Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      pricingTypes: Array.from(pricingMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      tags: Array.from(tagMap.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
    };
  }

  // ============================================================
  // EVENT SYSTEM
  // ============================================================

  on(type: MarketplaceEventType | '*', handler: (event: MarketplaceEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }

  private emit(event: MarketplaceEvent): void {
    this.listeners.get(event.type)?.forEach(h => h(event));
    this.listeners.get('*')?.forEach(h => h(event));
  }
}