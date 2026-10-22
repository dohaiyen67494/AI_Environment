import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DPoPGuard, DPoPRequest } from './dpop.guard';
import { DPoPService } from './dpop.service';
import { DPoPReplayCacheService } from './dpop-replay-cache.service';

describe('DPoPGuard (NestJS CanActivate Guard)', () => {
  let guard: DPoPGuard;
  let dpopService: DPoPService;
  let replayCache: DPoPReplayCacheService;
  let ecKeyPair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };

  beforeAll(() => {
    ecKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  });

  beforeEach(() => {
    replayCache = new DPoPReplayCacheService();
    dpopService = new DPoPService(replayCache);
    guard = new DPoPGuard(dpopService);
  });

  afterEach(() => {
    replayCache.onModuleDestroy();
  });

  const createMockContext = (
    reqOverrides: Partial<DPoPRequest> = {},
  ): ExecutionContext => {
    const mockRequest = {
      headers: {},
      method: 'GET',
      protocol: 'http',
      originalUrl: '/v1/appointments',
      get: (header: string) => {
        if (header.toLowerCase() === 'host') return 'localhost:3333';
        return undefined;
      },
      ...reqOverrides,
    } as unknown as DPoPRequest;

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  };

  it('should throw UnauthorizedException when DPoP header is missing', async () => {
    const context = createMockContext({
      headers: {},
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should pass and attach dpop context when proof is valid', async () => {
    const method = 'GET';
    const url = 'http://localhost:3333/v1/appointments';
    const accessToken = 'valid-access-token-abc';

    const proof = dpopService.generateDPoPProof(
      ecKeyPair,
      'ES256',
      method,
      url,
      accessToken,
    );

    const mockReq = {
      headers: {
        dpop: proof,
        authorization: `DPoP ${accessToken}`,
      },
      method,
      protocol: 'http',
      originalUrl: '/v1/appointments',
      get: () => 'localhost:3333',
    } as unknown as DPoPRequest;

    const context = {
      switchToHttp: () => ({
        getRequest: () => mockReq,
      }),
    } as unknown as ExecutionContext;

    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(mockReq.dpop).toBeDefined();
    expect(mockReq.dpop?.payload.htm).toBe('GET');
    expect(mockReq.dpop?.jwk.kty).toBe('EC');
  });

  it('should throw UnauthorizedException on HTTP method mismatch', async () => {
    const proof = dpopService.generateDPoPProof(
      ecKeyPair,
      'ES256',
      'POST', // Proof is for POST
      'http://localhost:3333/v1/appointments',
    );

    const context = createMockContext({
      method: 'GET', // Request is GET
      headers: { dpop: proof },
      originalUrl: '/v1/appointments',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException on HTTP URI mismatch', async () => {
    const proof = dpopService.generateDPoPProof(
      ecKeyPair,
      'ES256',
      'GET',
      'http://localhost:3333/v1/other-resource',
    );

    const context = createMockContext({
      method: 'GET',
      headers: { dpop: proof },
      originalUrl: '/v1/appointments',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException on access token hash (ath) mismatch', async () => {
    const proof = dpopService.generateDPoPProof(
      ecKeyPair,
      'ES256',
      'GET',
      'http://localhost:3333/v1/appointments',
      'token-X',
    );

    const context = createMockContext({
      method: 'GET',
      headers: {
        dpop: proof,
        authorization: 'Bearer token-Y', // Different token
      },
      originalUrl: '/v1/appointments',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException on Replay Attack (reusing same JTI)', async () => {
    const method = 'GET';
    const url = 'http://localhost:3333/v1/appointments';

    const proof = dpopService.generateDPoPProof(
      ecKeyPair,
      'ES256',
      method,
      url,
    );

    const context = createMockContext({
      method,
      headers: { dpop: proof },
      originalUrl: '/v1/appointments',
    });

    // 1st request -> PASS
    await expect(guard.canActivate(context)).resolves.toBe(true);

    // 2nd request with exact same proof -> FAIL (Replay attack blocked)
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
