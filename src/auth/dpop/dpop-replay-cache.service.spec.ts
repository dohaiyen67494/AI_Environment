import { DPoPReplayCacheService } from './dpop-replay-cache.service';

describe('DPoPReplayCacheService', () => {
  let cacheService: DPoPReplayCacheService;

  beforeEach(() => {
    cacheService = new DPoPReplayCacheService();
  });

  afterEach(() => {
    cacheService.onModuleDestroy();
  });

  it('should store and detect JTI', () => {
    const jti = 'unique-jti-123';
    expect(cacheService.has(jti)).toBe(false);

    cacheService.add(jti, 300);
    expect(cacheService.has(jti)).toBe(true);
    expect(cacheService.size).toBe(1);
  });

  it('should expire entries after TTL', () => {
    const jti = 'short-lived-jti';
    // Add with -1 second TTL (already expired)
    cacheService.add(jti, -1);
    expect(cacheService.has(jti)).toBe(false);
  });

  it('should clear all entries', () => {
    cacheService.add('jti-1', 300);
    cacheService.add('jti-2', 300);
    expect(cacheService.size).toBe(2);

    cacheService.clear();
    expect(cacheService.size).toBe(0);
    expect(cacheService.has('jti-1')).toBe(false);
  });

  it('should cleanup expired entries during cleanup()', () => {
    cacheService.add('expired-jti', -10);
    cacheService.add('active-jti', 300);

    expect(cacheService.size).toBe(2);
    cacheService.cleanup();
    expect(cacheService.size).toBe(1);
    expect(cacheService.has('active-jti')).toBe(true);
  });
});
