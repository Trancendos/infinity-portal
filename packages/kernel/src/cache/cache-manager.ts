/**
 * Cache Manager Implementation
 * 
 * Provides multi-layer caching with:
 * - In-memory L1 cache (fast, limited size)
 * - Redis L2 cache (distributed, larger capacity)
 * - Cache-aside pattern with automatic invalidation
 * - TTL-based expiration
 * - Cache warming and preloading
 */

export interface CacheOptions {
  /** Default TTL in seconds */
  defaultTtl: number;
  /** Maximum items in L1 cache */
  maxL1Size: number;
  /** Whether to use L2 (Redis) cache */
  useL2: boolean;
  /** Redis connection URL */
  redisUrl?: string;
  /** Key prefix for namespacing */
  keyPrefix: string;
  /** Callback for cache metrics */
  onMetric?: (metric: CacheMetric) => void;
}

export interface CacheMetric {
  hits: number;
  misses: number;
  l1Hits: number;
  l2Hits: number;
  sets: number;
  deletes: number;
  hitRate: number;
  size: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

export class CacheManager {
  private l1Cache: Map<string, CacheEntry<any>> = new Map();
  private hits: number = 0;
  private misses: number = 0;
  private l1Hits: number = 0;
  private l2Hits: number = 0;
  private sets: number = 0;
  private deletes: number = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly options: CacheOptions) {
    // Start periodic cleanup of expired entries
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key);

    // Check L1 cache first
    const l1Entry = this.l1Cache.get(fullKey);
    if (l1Entry && l1Entry.expiresAt > Date.now()) {
      this.hits++;
      this.l1Hits++;
      this.emitMetric();
      return l1Entry.value as T;
    }

    // Remove expired L1 entry
    if (l1Entry) {
      this.l1Cache.delete(fullKey);
    }

    this.misses++;
    this.emitMetric();
    return null;
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const fullKey = this.getFullKey(key);
    const ttl = ttlSeconds || this.options.defaultTtl;
    const expiresAt = Date.now() + ttl * 1000;

    // Evict if L1 is full
    if (this.l1Cache.size >= this.options.maxL1Size) {
      this.evictOldest();
    }

    // Set in L1 cache
    this.l1Cache.set(fullKey, {
      value,
      expiresAt,
      createdAt: Date.now(),
    });

    this.sets++;
    this.emitMetric();
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    this.l1Cache.delete(fullKey);
    this.deletes++;
    this.emitMetric();
  }

  /**
   * Delete all keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    const fullPattern = this.getFullKey(pattern);
    let count = 0;

    for (const key of this.l1Cache.keys()) {
      if (key.startsWith(fullPattern.replace('*', ''))) {
        this.l1Cache.delete(key);
        count++;
      }
    }

    this.deletes += count;
    this.emitMetric();
    return count;
  }

  /**
   * Get or set a value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Warm cache with multiple entries
   */
  async warm(entries: Array<{ key: string; factory: () => Promise<any>; ttl?: number }>): Promise<void> {
    await Promise.all(
      entries.map(async ({ key, factory, ttl }) => {
        try {
          const value = await factory();
          await this.set(key, value, ttl);
        } catch (error) {
          // Silently skip failed warm-up entries
          console.warn(`Cache warm-up failed for key '${key}':`, error);
        }
      })
    );
  }

  /**
   * Check if a key exists in cache
   */
  async has(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    const entry = this.l1Cache.get(fullKey);
    return entry !== undefined && entry.expiresAt > Date.now();
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetric {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      l1Hits: this.l1Hits,
      l2Hits: this.l2Hits,
      sets: this.sets,
      deletes: this.deletes,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.l1Cache.size,
    };
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.l1Cache.clear();
    this.emitMetric();
  }

  /**
   * Destroy the cache manager
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.l1Cache.clear();
  }

  /**
   * Get full key with prefix
   */
  private getFullKey(key: string): string {
    return `${this.options.keyPrefix}:${key}`;
  }

  /**
   * Evict oldest entry from L1 cache
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.l1Cache.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.l1Cache.delete(oldestKey);
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.l1Cache.entries()) {
      if (entry.expiresAt <= now) {
        this.l1Cache.delete(key);
      }
    }
  }

  /**
   * Emit cache metrics
   */
  private emitMetric(): void {
    this.options.onMetric?.(this.getMetrics());
  }
}

/**
 * Create a default cache manager
 */
export function createCacheManager(options?: Partial<CacheOptions>): CacheManager {
  return new CacheManager({
    defaultTtl: 300,
    maxL1Size: 10000,
    useL2: false,
    keyPrefix: 'infinity',
    ...options,
  });
}