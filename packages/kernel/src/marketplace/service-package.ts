/**
 * Service Package System
 * 
 * Defines the standard format for packaging, distributing, and installing
 * services in the Infinity Portal marketplace. Every service must conform
 * to the ServiceManifest schema to be listed and installable.
 * 
 * Architecture:
 * ```
 * ServicePackage
 *   ├── manifest.json (ServiceManifest)
 *   ├── config-schema.json (ConfigurationSchema)
 *   ├── assets/ (icons, screenshots)
 *   └── dist/ (compiled service code)
 * ```
 */

// ============================================================
// SERVICE MANIFEST SCHEMA
// ============================================================

export interface ServiceManifest {
  /** Unique service identifier (e.g., "com.trancendos.ai-assistant") */
  id: string;
  /** Human-readable service name */
  name: string;
  /** Service description */
  description: string;
  /** Semantic version (e.g., "1.2.3") */
  version: string;
  /** Service author/publisher */
  author: ServiceAuthor;
  /** Service category */
  category: ServiceCategory;
  /** Tags for search/discovery */
  tags: string[];
  /** License type */
  license: 'MIT' | 'Apache-2.0' | 'GPL-3.0' | 'AGPL-3.0' | 'BSL-1.1' | 'Proprietary' | 'Custom';
  /** Minimum Infinity OS kernel version required */
  minKernelVersion: string;
  /** Service entry point */
  entryPoint: string;
  /** Required permissions */
  permissions: ServicePermission[];
  /** Service dependencies */
  dependencies: ServiceDependency[];
  /** Configuration schema */
  configSchema: ConfigurationSchema;
  /** Resource requirements */
  resources: ResourceRequirements;
  /** API endpoints exposed */
  endpoints: ServiceEndpoint[];
  /** Events published */
  eventsPublished: EventDefinition[];
  /** Events consumed */
  eventsConsumed: EventDefinition[];
  /** Marketplace listing metadata */
  listing: MarketplaceListing;
  /** Health check configuration */
  healthCheck: HealthCheckConfig;
  /** Lifecycle hooks */
  lifecycle: LifecycleHooks;
}

export interface ServiceAuthor {
  name: string;
  email: string;
  organization?: string;
  website?: string;
  verified: boolean;
}

export type ServiceCategory =
  | 'ai-agents'
  | 'analytics'
  | 'automation'
  | 'communication'
  | 'compliance'
  | 'crm'
  | 'data-processing'
  | 'developer-tools'
  | 'finance'
  | 'hr'
  | 'integration'
  | 'marketing'
  | 'productivity'
  | 'project-management'
  | 'security'
  | 'storage'
  | 'utilities';

export interface ServicePermission {
  /** Permission identifier */
  id: string;
  /** Permission description */
  description: string;
  /** Whether this permission is required or optional */
  required: boolean;
  /** Permission scope */
  scope: 'read' | 'write' | 'admin' | 'execute';
  /** Resource this permission applies to */
  resource: string;
}

export interface ServiceDependency {
  /** Service ID of the dependency */
  serviceId: string;
  /** Version range (semver) */
  versionRange: string;
  /** Whether this dependency is required */
  required: boolean;
  /** Fallback behavior if dependency is unavailable */
  fallback?: 'degrade' | 'disable' | 'error';
}

export interface ConfigurationSchema {
  /** Schema version */
  version: string;
  /** Configuration fields */
  fields: ConfigField[];
  /** Configuration groups for UI organization */
  groups: ConfigGroup[];
}

export interface ConfigField {
  /** Field key */
  key: string;
  /** Display label */
  label: string;
  /** Field description */
  description: string;
  /** Field type */
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect' | 'secret' | 'json' | 'url' | 'email';
  /** Default value */
  defaultValue?: unknown;
  /** Whether field is required */
  required: boolean;
  /** Validation rules */
  validation?: FieldValidation;
  /** Options for select/multiselect */
  options?: { label: string; value: string }[];
  /** Group this field belongs to */
  group?: string;
  /** Whether this field is sensitive (masked in UI) */
  sensitive?: boolean;
}

export interface ConfigGroup {
  id: string;
  label: string;
  description?: string;
  order: number;
}

export interface FieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
  custom?: string;
}

export interface ResourceRequirements {
  /** Minimum CPU (millicores) */
  cpuMin: number;
  /** Maximum CPU (millicores) */
  cpuMax: number;
  /** Minimum memory (MB) */
  memoryMin: number;
  /** Maximum memory (MB) */
  memoryMax: number;
  /** Storage required (MB) */
  storage: number;
  /** Network bandwidth (Mbps) */
  networkBandwidth?: number;
  /** GPU required */
  gpu?: boolean;
  /** Database required */
  database?: 'postgresql' | 'redis' | 'mongodb' | 'none';
}

export interface ServiceEndpoint {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path pattern */
  path: string;
  /** Endpoint description */
  description: string;
  /** Whether authentication is required */
  auth: boolean;
  /** Rate limit for this endpoint */
  rateLimit?: { maxRequests: number; windowMs: number };
  /** Request body schema (JSON Schema) */
  requestSchema?: Record<string, unknown>;
  /** Response schema (JSON Schema) */
  responseSchema?: Record<string, unknown>;
}

export interface EventDefinition {
  /** Event type identifier */
  type: string;
  /** Event description */
  description: string;
  /** Event payload schema */
  schema?: Record<string, unknown>;
}

export interface MarketplaceListing {
  /** Short tagline */
  tagline: string;
  /** Detailed description (markdown) */
  detailedDescription: string;
  /** Icon URL */
  iconUrl: string;
  /** Screenshot URLs */
  screenshots: string[];
  /** Demo URL */
  demoUrl?: string;
  /** Documentation URL */
  documentationUrl?: string;
  /** Support URL */
  supportUrl?: string;
  /** Pricing model */
  pricing: PricingModel;
  /** Featured flag */
  featured: boolean;
  /** Maturity level */
  maturity: 'alpha' | 'beta' | 'stable' | 'deprecated';
}

export interface PricingModel {
  /** Pricing type */
  type: 'free' | 'freemium' | 'subscription' | 'usage-based' | 'one-time';
  /** Base price (monthly, in cents) */
  basePrice?: number;
  /** Currency */
  currency?: string;
  /** Pricing tiers */
  tiers?: PricingTier[];
  /** Free trial days */
  trialDays?: number;
  /** Usage-based pricing details */
  usagePricing?: UsagePricing[];
}

export interface PricingTier {
  name: string;
  price: number;
  features: string[];
  limits: Record<string, number>;
}

export interface UsagePricing {
  metric: string;
  unit: string;
  pricePerUnit: number;
  freeQuota: number;
}

export interface HealthCheckConfig {
  /** Health check endpoint path */
  path: string;
  /** Check interval in ms */
  intervalMs: number;
  /** Timeout in ms */
  timeoutMs: number;
  /** Number of failures before marking unhealthy */
  unhealthyThreshold: number;
  /** Number of successes before marking healthy */
  healthyThreshold: number;
}

export interface LifecycleHooks {
  /** Called before service installation */
  preInstall?: string;
  /** Called after service installation */
  postInstall?: string;
  /** Called before service starts */
  preStart?: string;
  /** Called after service starts */
  postStart?: string;
  /** Called before service stops */
  preStop?: string;
  /** Called after service stops */
  postStop?: string;
  /** Called before service uninstallation */
  preUninstall?: string;
  /** Called after service uninstallation */
  postUninstall?: string;
  /** Called before service upgrade */
  preUpgrade?: string;
  /** Called after service upgrade */
  postUpgrade?: string;
}

// ============================================================
// SERVICE PACKAGER
// ============================================================

export interface PackageValidationResult {
  valid: boolean;
  errors: PackageValidationError[];
  warnings: PackageValidationWarning[];
}

export interface PackageValidationError {
  field: string;
  message: string;
  code: string;
}

export interface PackageValidationWarning {
  field: string;
  message: string;
  code: string;
}

export class ServicePackager {
  /**
   * Validate a service manifest against the schema
   */
  static validate(manifest: Partial<ServiceManifest>): PackageValidationResult {
    const errors: PackageValidationError[] = [];
    const warnings: PackageValidationWarning[] = [];

    // Required fields
    if (!manifest.id) {
      errors.push({ field: 'id', message: 'Service ID is required', code: 'MISSING_ID' });
    } else if (!/^[a-z][a-z0-9.-]*[a-z0-9]$/.test(manifest.id)) {
      errors.push({ field: 'id', message: 'Service ID must be lowercase alphanumeric with dots/hyphens', code: 'INVALID_ID' });
    }

    if (!manifest.name) {
      errors.push({ field: 'name', message: 'Service name is required', code: 'MISSING_NAME' });
    }

    if (!manifest.version) {
      errors.push({ field: 'version', message: 'Version is required', code: 'MISSING_VERSION' });
    } else if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(manifest.version)) {
      errors.push({ field: 'version', message: 'Version must follow semver format', code: 'INVALID_VERSION' });
    }

    if (!manifest.description) {
      errors.push({ field: 'description', message: 'Description is required', code: 'MISSING_DESCRIPTION' });
    }

    if (!manifest.author) {
      errors.push({ field: 'author', message: 'Author is required', code: 'MISSING_AUTHOR' });
    }

    if (!manifest.category) {
      errors.push({ field: 'category', message: 'Category is required', code: 'MISSING_CATEGORY' });
    }

    if (!manifest.entryPoint) {
      errors.push({ field: 'entryPoint', message: 'Entry point is required', code: 'MISSING_ENTRY_POINT' });
    }

    if (!manifest.license) {
      errors.push({ field: 'license', message: 'License is required', code: 'MISSING_LICENSE' });
    }

    if (!manifest.minKernelVersion) {
      errors.push({ field: 'minKernelVersion', message: 'Minimum kernel version is required', code: 'MISSING_KERNEL_VERSION' });
    }

    // Validate resources
    if (manifest.resources) {
      if (manifest.resources.cpuMin > manifest.resources.cpuMax) {
        errors.push({ field: 'resources.cpuMin', message: 'CPU min cannot exceed CPU max', code: 'INVALID_CPU_RANGE' });
      }
      if (manifest.resources.memoryMin > manifest.resources.memoryMax) {
        errors.push({ field: 'resources.memoryMin', message: 'Memory min cannot exceed memory max', code: 'INVALID_MEMORY_RANGE' });
      }
    } else {
      errors.push({ field: 'resources', message: 'Resource requirements are required', code: 'MISSING_RESOURCES' });
    }

    // Validate listing
    if (!manifest.listing) {
      errors.push({ field: 'listing', message: 'Marketplace listing is required', code: 'MISSING_LISTING' });
    } else {
      if (!manifest.listing.tagline) {
        errors.push({ field: 'listing.tagline', message: 'Tagline is required', code: 'MISSING_TAGLINE' });
      }
      if (!manifest.listing.pricing) {
        errors.push({ field: 'listing.pricing', message: 'Pricing model is required', code: 'MISSING_PRICING' });
      }
    }

    // Validate health check
    if (!manifest.healthCheck) {
      warnings.push({ field: 'healthCheck', message: 'Health check configuration recommended', code: 'MISSING_HEALTH_CHECK' });
    }

    // Validate dependencies
    if (manifest.dependencies) {
      for (const dep of manifest.dependencies) {
        if (!dep.serviceId) {
          errors.push({ field: 'dependencies', message: `Dependency missing serviceId`, code: 'INVALID_DEPENDENCY' });
        }
        if (!dep.versionRange) {
          errors.push({ field: 'dependencies', message: `Dependency ${dep.serviceId} missing version range`, code: 'INVALID_DEPENDENCY_VERSION' });
        }
      }
    }

    // Validate endpoints
    if (manifest.endpoints) {
      for (const endpoint of manifest.endpoints) {
        if (!endpoint.path.startsWith('/')) {
          errors.push({ field: 'endpoints', message: `Endpoint path must start with /: ${endpoint.path}`, code: 'INVALID_ENDPOINT_PATH' });
        }
      }
    }

    // Warnings
    if (!manifest.tags || manifest.tags.length === 0) {
      warnings.push({ field: 'tags', message: 'Adding tags improves discoverability', code: 'NO_TAGS' });
    }

    if (!manifest.listing?.screenshots || manifest.listing.screenshots.length === 0) {
      warnings.push({ field: 'listing.screenshots', message: 'Adding screenshots improves conversion', code: 'NO_SCREENSHOTS' });
    }

    if (!manifest.listing?.documentationUrl) {
      warnings.push({ field: 'listing.documentationUrl', message: 'Documentation URL recommended', code: 'NO_DOCS_URL' });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Create a default manifest template
   */
  static createTemplate(serviceId: string, name: string): ServiceManifest {
    return {
      id: serviceId,
      name,
      description: '',
      version: '0.1.0',
      author: {
        name: '',
        email: '',
        verified: false,
      },
      category: 'utilities',
      tags: [],
      license: 'MIT',
      minKernelVersion: '0.1.0',
      entryPoint: 'dist/index.js',
      permissions: [],
      dependencies: [],
      configSchema: {
        version: '1.0',
        fields: [],
        groups: [],
      },
      resources: {
        cpuMin: 100,
        cpuMax: 500,
        memoryMin: 64,
        memoryMax: 256,
        storage: 100,
        database: 'none',
      },
      endpoints: [],
      eventsPublished: [],
      eventsConsumed: [],
      listing: {
        tagline: '',
        detailedDescription: '',
        iconUrl: '',
        screenshots: [],
        pricing: { type: 'free' },
        featured: false,
        maturity: 'alpha',
      },
      healthCheck: {
        path: '/health',
        intervalMs: 30000,
        timeoutMs: 5000,
        unhealthyThreshold: 3,
        healthyThreshold: 2,
      },
      lifecycle: {},
    };
  }
}

// ============================================================
// VERSION MANAGEMENT
// ============================================================

export interface VersionInfo {
  version: string;
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export class VersionManager {
  /**
   * Parse a semver version string
   */
  static parse(version: string): VersionInfo | null {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)(-(.+))?$/);
    if (!match) return null;
    return {
      version,
      major: parseInt(match[1]),
      minor: parseInt(match[2]),
      patch: parseInt(match[3]),
      prerelease: match[5],
    };
  }

  /**
   * Check if a version satisfies a version range
   * Supports: exact (1.2.3), caret (^1.2.3), tilde (~1.2.3), range (>=1.0.0)
   */
  static satisfies(version: string, range: string): boolean {
    const parsed = this.parse(version);
    if (!parsed) return false;

    // Exact match
    if (range === version) return true;

    // Caret range (^1.2.3 = >=1.2.3 <2.0.0)
    if (range.startsWith('^')) {
      const rangeVersion = this.parse(range.slice(1));
      if (!rangeVersion) return false;
      if (parsed.major !== rangeVersion.major) return false;
      if (parsed.major === 0) {
        if (parsed.minor !== rangeVersion.minor) return false;
        return parsed.patch >= rangeVersion.patch;
      }
      return this.compare(version, range.slice(1)) >= 0;
    }

    // Tilde range (~1.2.3 = >=1.2.3 <1.3.0)
    if (range.startsWith('~')) {
      const rangeVersion = this.parse(range.slice(1));
      if (!rangeVersion) return false;
      return parsed.major === rangeVersion.major &&
        parsed.minor === rangeVersion.minor &&
        parsed.patch >= rangeVersion.patch;
    }

    // Greater than or equal (>=1.0.0)
    if (range.startsWith('>=')) {
      return this.compare(version, range.slice(2)) >= 0;
    }

    // Greater than (>1.0.0)
    if (range.startsWith('>')) {
      return this.compare(version, range.slice(1)) > 0;
    }

    // Wildcard
    if (range === '*') return true;

    return false;
  }

  /**
   * Compare two versions: -1 (a < b), 0 (a == b), 1 (a > b)
   */
  static compare(a: string, b: string): number {
    const parsedA = this.parse(a);
    const parsedB = this.parse(b);
    if (!parsedA || !parsedB) return 0;

    if (parsedA.major !== parsedB.major) return parsedA.major > parsedB.major ? 1 : -1;
    if (parsedA.minor !== parsedB.minor) return parsedA.minor > parsedB.minor ? 1 : -1;
    if (parsedA.patch !== parsedB.patch) return parsedA.patch > parsedB.patch ? 1 : -1;
    return 0;
  }

  /**
   * Get the next version based on bump type
   */
  static bump(version: string, type: 'major' | 'minor' | 'patch'): string {
    const parsed = this.parse(version);
    if (!parsed) return version;

    switch (type) {
      case 'major': return `${parsed.major + 1}.0.0`;
      case 'minor': return `${parsed.major}.${parsed.minor + 1}.0`;
      case 'patch': return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    }
  }
}

// ============================================================
// DEPENDENCY RESOLVER
// ============================================================

export interface DependencyResolution {
  resolved: Map<string, string>;
  unresolved: ServiceDependency[];
  conflicts: DependencyConflict[];
}

export interface DependencyConflict {
  serviceId: string;
  requestedBy: string[];
  versions: string[];
  resolvedVersion?: string;
}

export class DependencyResolver {
  private availableServices: Map<string, string[]> = new Map();

  /**
   * Register available service versions
   */
  registerAvailable(serviceId: string, versions: string[]): void {
    this.availableServices.set(serviceId, versions.sort((a, b) => VersionManager.compare(b, a)));
  }

  /**
   * Resolve dependencies for a service manifest
   */
  resolve(manifest: ServiceManifest): DependencyResolution {
    const resolved = new Map<string, string>();
    const unresolved: ServiceDependency[] = [];
    const conflicts: DependencyConflict[] = [];

    for (const dep of manifest.dependencies) {
      const available = this.availableServices.get(dep.serviceId);

      if (!available || available.length === 0) {
        if (dep.required) {
          unresolved.push(dep);
        }
        continue;
      }

      // Find the best matching version
      const matchingVersion = available.find(v => VersionManager.satisfies(v, dep.versionRange));

      if (matchingVersion) {
        // Check for conflicts with already resolved
        const existing = resolved.get(dep.serviceId);
        if (existing && existing !== matchingVersion) {
          conflicts.push({
            serviceId: dep.serviceId,
            requestedBy: [manifest.id],
            versions: [existing, matchingVersion],
            resolvedVersion: VersionManager.compare(existing, matchingVersion) >= 0 ? existing : matchingVersion,
          });
        }
        resolved.set(dep.serviceId, matchingVersion);
      } else if (dep.required) {
        unresolved.push(dep);
      }
    }

    return { resolved, unresolved, conflicts };
  }

  /**
   * Check if all required dependencies can be satisfied
   */
  canInstall(manifest: ServiceManifest): { installable: boolean; missing: string[] } {
    const resolution = this.resolve(manifest);
    const missing = resolution.unresolved.map(d => `${d.serviceId}@${d.versionRange}`);
    return {
      installable: missing.length === 0,
      missing,
    };
  }
}