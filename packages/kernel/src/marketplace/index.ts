/**
 * Marketplace Module
 * 
 * Complete marketplace platform for the Infinity Portal ecosystem.
 * Enables service packaging, distribution, installation, billing,
 * and lifecycle management.
 * 
 * Architecture:
 * ```
 * MarketplaceAPI (REST endpoints)
 *   ├── MarketplaceRegistry (catalog, install, reviews)
 *   │     ├── ServicePackager (validation, templates)
 *   │     ├── DependencyResolver (dependency management)
 *   │     └── VersionManager (semver operations)
 *   └── BillingSystem (financial operations)
 *         ├── UsageTracker (metered usage)
 *         ├── SubscriptionManager (plan management)
 *         ├── InvoiceGenerator (billing cycles)
 *         └── PaymentProcessor (payment gateway)
 * ```
 * 
 * Usage:
 * ```typescript
 * import { MarketplaceAPI, MarketplaceRegistry, BillingSystem } from './marketplace';
 * 
 * const registry = new MarketplaceRegistry();
 * const billing = new BillingSystem();
 * const api = new MarketplaceAPI(registry, billing);
 * 
 * // Publish a service
 * registry.publish(manifest);
 * 
 * // Install a service
 * await registry.install('com.example.service', { apiKey: '...' });
 * 
 * // Handle API request
 * const response = await api.handleRequest({
 *   method: 'GET',
 *   path: '/api/marketplace/catalog',
 *   params: {},
 *   query: { q: 'ai agent' },
 *   body: {},
 *   headers: {},
 * });
 * ```
 */

// Service Package System
export {
  ServicePackager,
  VersionManager,
  DependencyResolver,
  type ServiceManifest,
  type ServiceAuthor,
  type ServiceCategory,
  type ServicePermission,
  type ServiceDependency,
  type ConfigurationSchema,
  type ConfigField,
  type ConfigGroup,
  type FieldValidation,
  type ResourceRequirements,
  type ServiceEndpoint,
  type EventDefinition,
  type MarketplaceListing,
  type PricingModel,
  type PricingTier,
  type UsagePricing,
  type HealthCheckConfig,
  type LifecycleHooks,
  type PackageValidationResult,
  type PackageValidationError,
  type PackageValidationWarning,
  type VersionInfo,
  type DependencyResolution,
  type DependencyConflict,
} from './service-package';

// Marketplace Registry
export {
  MarketplaceRegistry,
  type InstallationStatus,
  type InstalledService,
  type InstallationMetadata,
  type ServiceUsageStats,
  type ServiceReview,
  type CatalogSearchOptions,
  type CatalogSearchResult,
  type MarketplaceEntry,
  type MarketplaceStats,
  type ReviewSummary,
  type SearchFacets,
  type MarketplaceEventType,
  type MarketplaceEvent,
} from './marketplace-registry';

// Billing System
export {
  BillingSystem,
  UsageTracker,
  SubscriptionManager,
  InvoiceGenerator,
  PaymentProcessor,
  type BillingPeriod,
  type PaymentStatus,
  type SubscriptionStatus,
  type InvoiceStatus,
  type BillingAccount,
  type PaymentMethod,
  type TaxInfo,
  type Subscription,
  type UsageRecord,
  type Invoice,
  type InvoiceLineItem,
  type Payment,
  type BillingEvent,
} from './billing-system';

// Marketplace API
export {
  MarketplaceAPI,
  type ApiRequest,
  type ApiResponse,
  type RouteHandler,
  type Route,
} from './marketplace-api';