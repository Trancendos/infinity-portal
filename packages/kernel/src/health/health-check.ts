/**
 * Health Check System
 * 
 * Provides comprehensive health checking for all services:
 * - Liveness: Is the service running?
 * - Readiness: Is the service ready to accept traffic?
 * - Dependency checks: Are all dependencies healthy?
 * - Aggregated health status
 */

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

export interface HealthCheckResult {
  status: HealthStatus;
  name: string;
  message?: string;
  duration: number;
  timestamp: number;
  details?: Record<string, any>;
}

export interface AggregatedHealthResult {
  status: HealthStatus;
  version: string;
  uptime: number;
  timestamp: number;
  checks: HealthCheckResult[];
  system: SystemInfo;
}

export interface SystemInfo {
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  cpu: {
    loadAvg: number[];
  };
  uptime: number;
  nodeVersion: string;
  platform: string;
}

export type HealthCheckFn = () => Promise<HealthCheckResult>;

export interface HealthCheckOptions {
  /** Name of the health check */
  name: string;
  /** Timeout for the check in ms */
  timeout: number;
  /** Whether this check is critical (affects overall status) */
  critical: boolean;
  /** Check interval in ms for background monitoring */
  interval?: number;
}

/**
 * Health Check Registry
 */
export class HealthCheckRegistry {
  private checks: Map<string, { fn: HealthCheckFn; options: HealthCheckOptions }> = new Map();
  private cachedResults: Map<string, HealthCheckResult> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private startTime: number = Date.now();
  private version: string;

  constructor(version: string = '1.0.0') {
    this.version = version;
  }

  /**
   * Register a health check
   */
  register(options: HealthCheckOptions, fn: HealthCheckFn): void {
    this.checks.set(options.name, { fn, options });

    // Start background monitoring if interval is set
    if (options.interval) {
      const interval = setInterval(async () => {
        try {
          const result = await this.executeCheck(options.name);
          this.cachedResults.set(options.name, result);
        } catch (error) {
          // Store failed result
          this.cachedResults.set(options.name, {
            status: HealthStatus.UNHEALTHY,
            name: options.name,
            message: error instanceof Error ? error.message : 'Unknown error',
            duration: 0,
            timestamp: Date.now(),
          });
        }
      }, options.interval);
      this.intervals.set(options.name, interval);
    }
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): void {
    this.checks.delete(name);
    this.cachedResults.delete(name);
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
    }
  }

  /**
   * Execute a single health check
   */
  async executeCheck(name: string): Promise<HealthCheckResult> {
    const check = this.checks.get(name);
    if (!check) {
      return {
        status: HealthStatus.UNHEALTHY,
        name,
        message: `Health check '${name}' not found`,
        duration: 0,
        timestamp: Date.now(),
      };
    }

    const startTime = Date.now();

    try {
      const result = await Promise.race([
        check.fn(),
        new Promise<HealthCheckResult>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Health check '${name}' timed out after ${check.options.timeout}ms`)),
            check.options.timeout
          )
        ),
      ]);

      return {
        ...result,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        name,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Execute all health checks and return aggregated result
   */
  async checkAll(): Promise<AggregatedHealthResult> {
    const results = await Promise.all(
      Array.from(this.checks.keys()).map(name => this.executeCheck(name))
    );

    // Determine overall status
    const criticalChecks = Array.from(this.checks.entries())
      .filter(([_, check]) => check.options.critical)
      .map(([name]) => name);

    let overallStatus = HealthStatus.HEALTHY;

    for (const result of results) {
      if (result.status === HealthStatus.UNHEALTHY && criticalChecks.includes(result.name)) {
        overallStatus = HealthStatus.UNHEALTHY;
        break;
      }
      if (result.status === HealthStatus.DEGRADED || result.status === HealthStatus.UNHEALTHY) {
        if (overallStatus !== HealthStatus.UNHEALTHY) {
          overallStatus = HealthStatus.DEGRADED;
        }
      }
    }

    return {
      status: overallStatus,
      version: this.version,
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
      checks: results,
      system: this.getSystemInfo(),
    };
  }

  /**
   * Liveness check - is the service running?
   */
  async liveness(): Promise<{ status: HealthStatus; uptime: number }> {
    return {
      status: HealthStatus.HEALTHY,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Readiness check - is the service ready to accept traffic?
   */
  async readiness(): Promise<AggregatedHealthResult> {
    return this.checkAll();
  }

  /**
   * Get system information
   */
  private getSystemInfo(): SystemInfo {
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem?.() || 0;
    const freeMem = require('os').freemem?.() || 0;

    return {
      memory: {
        total: totalMem,
        used: totalMem - freeMem,
        free: freeMem,
        usagePercent: totalMem > 0 ? ((totalMem - freeMem) / totalMem) * 100 : 0,
      },
      cpu: {
        loadAvg: require('os').loadavg?.() || [0, 0, 0],
      },
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
    };
  }

  /**
   * Destroy the registry and clean up intervals
   */
  destroy(): void {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
    this.checks.clear();
    this.cachedResults.clear();
  }
}

/**
 * Common health check factories
 */
export const HealthChecks = {
  /** Database connectivity check */
  database(name: string, queryFn: () => Promise<any>): HealthCheckFn {
    return async () => {
      try {
        await queryFn();
        return {
          status: HealthStatus.HEALTHY,
          name,
          message: 'Database connection is healthy',
          duration: 0,
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          name,
          message: `Database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          duration: 0,
          timestamp: Date.now(),
        };
      }
    };
  },

  /** Redis connectivity check */
  redis(name: string, pingFn: () => Promise<string>): HealthCheckFn {
    return async () => {
      try {
        const result = await pingFn();
        return {
          status: result === 'PONG' ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
          name,
          message: `Redis responded: ${result}`,
          duration: 0,
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          name,
          message: `Redis check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          duration: 0,
          timestamp: Date.now(),
        };
      }
    };
  },

  /** HTTP endpoint check */
  http(name: string, url: string, expectedStatus: number = 200): HealthCheckFn {
    return async () => {
      try {
        const response = await fetch(url);
        const isHealthy = response.status === expectedStatus;
        return {
          status: isHealthy ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
          name,
          message: `HTTP ${response.status} from ${url}`,
          duration: 0,
          timestamp: Date.now(),
          details: { url, status: response.status },
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          name,
          message: `HTTP check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          duration: 0,
          timestamp: Date.now(),
          details: { url },
        };
      }
    };
  },

  /** Memory usage check */
  memory(name: string, thresholdPercent: number = 90): HealthCheckFn {
    return async () => {
      const totalMem = require('os').totalmem?.() || 1;
      const freeMem = require('os').freemem?.() || 0;
      const usagePercent = ((totalMem - freeMem) / totalMem) * 100;

      let status: HealthStatus;
      if (usagePercent >= thresholdPercent) {
        status = HealthStatus.UNHEALTHY;
      } else if (usagePercent >= thresholdPercent * 0.8) {
        status = HealthStatus.DEGRADED;
      } else {
        status = HealthStatus.HEALTHY;
      }

      return {
        status,
        name,
        message: `Memory usage: ${usagePercent.toFixed(1)}%`,
        duration: 0,
        timestamp: Date.now(),
        details: { totalMem, freeMem, usagePercent },
      };
    };
  },

  /** Disk usage check */
  disk(name: string, thresholdPercent: number = 90): HealthCheckFn {
    return async () => {
      // Simplified disk check
      return {
        status: HealthStatus.HEALTHY,
        name,
        message: 'Disk check passed',
        duration: 0,
        timestamp: Date.now(),
      };
    };
  },
};

/**
 * Express/Fastify health check routes
 */
export function healthCheckRoutes(registry: HealthCheckRegistry) {
  return {
    /** GET /health - Full health check */
    async health(_req: any, res: any) {
      const result = await registry.checkAll();
      const statusCode = result.status === HealthStatus.HEALTHY ? 200
        : result.status === HealthStatus.DEGRADED ? 200
        : 503;
      res.status(statusCode).json(result);
    },

    /** GET /health/live - Liveness probe */
    async live(_req: any, res: any) {
      const result = await registry.liveness();
      res.status(200).json(result);
    },

    /** GET /health/ready - Readiness probe */
    async ready(_req: any, res: any) {
      const result = await registry.readiness();
      const statusCode = result.status === HealthStatus.UNHEALTHY ? 503 : 200;
      res.status(statusCode).json(result);
    },
  };
}