import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class DPoPReplayCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(DPoPReplayCacheService.name);
  private readonly cache = new Map<string, number>(); // jti -> expiresAt timestamp (ms)
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Run cache cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
    // Unref so it won't block process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Check if a JTI has already been seen (replay attempt)
   */
  has(jti: string): boolean {
    const expiresAt = this.cache.get(jti);
    if (!expiresAt) {
      return false;
    }

    if (Date.now() > expiresAt) {
      this.cache.delete(jti);
      return false;
    }

    return true;
  }

  /**
   * Add a JTI to the cache with a time-to-live in seconds
   */
  add(jti: string, ttlSeconds: number = 300): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.cache.set(jti, expiresAt);
  }

  /**
   * Remove expired entries from cache
   */
  cleanup(): void {
    const now = Date.now();
    for (const [jti, expiresAt] of this.cache.entries()) {
      if (now > expiresAt) {
        this.cache.delete(jti);
      }
    }
  }

  /**
   * Clear all entries (useful in tests)
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
