import * as crypto from 'crypto';
import { DPoPService } from './dpop.service';
import { DPoPReplayCacheService } from './dpop-replay-cache.service';
import { JWK } from './dpop.types';

describe('DPoPService (RFC 9449 Compliance)', () => {
  let dpopService: DPoPService;
  let replayCache: DPoPReplayCacheService;
  let ecKeyPair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };
  let rsaKeyPair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };

  beforeAll(() => {
    ecKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    rsaKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  });

  beforeEach(() => {
    replayCache = new DPoPReplayCacheService();
    dpopService = new DPoPService(replayCache);
  });

  afterEach(() => {
    replayCache.onModuleDestroy();
  });

  describe('computeAccessTokenHash (ath)', () => {
    it('should compute valid base64url SHA-256 hash of an access token', () => {
      const token = 'test-access-token-12345';
      const expectedHash = crypto
        .createHash('sha256')
        .update(token, 'ascii')
        .digest('base64url');

      expect(dpopService.computeAccessTokenHash(token)).toBe(expectedHash);
    });
  });

  describe('validateDPoPProof with ES256 (P-256)', () => {
    it('should successfully validate a well-formed ES256 DPoP proof', async () => {
      const method = 'POST';
      const url = 'http://localhost:3333/v1/appointments';
      const token = 'sample-jwt-access-token';

      const proof = dpopService.generateDPoPProof(
        ecKeyPair,
        'ES256',
        method,
        url,
        token,
      );

      const result = await dpopService.validateDPoPProof(
        proof,
        method,
        url,
        token,
      );

      expect(result.isValid).toBe(true);
      expect(result.payload?.htm).toBe('POST');
      expect(result.payload?.htu).toBe(url);
      expect(result.header?.typ).toBe('dpop+jwt');
      expect(result.header?.alg).toBe('ES256');
      expect(result.header?.jwk.kty).toBe('EC');
    });
  });

  describe('validateDPoPProof with RS256', () => {
    it('should successfully validate a well-formed RS256 DPoP proof', async () => {
      const method = 'GET';
      const url = 'http://localhost:3333/v1/records';

      const proof = dpopService.generateDPoPProof(
        rsaKeyPair,
        'RS256',
        method,
        url,
      );

      const result = await dpopService.validateDPoPProof(proof, method, url);

      expect(result.isValid).toBe(true);
      expect(result.payload?.htm).toBe('GET');
      expect(result.header?.alg).toBe('RS256');
      expect(result.header?.jwk.kty).toBe('RSA');
    });
  });

  describe('Security & RFC 9449 Invariant Rejections', () => {
    const defaultUrl = 'http://localhost:3333/v1/test';
    const defaultMethod = 'GET';

    it('should reject non-3-part strings', async () => {
      const result = await dpopService.validateDPoPProof(
        'not.a.valid.jwt.four.parts',
        defaultMethod,
        defaultUrl,
      );
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('invalid_dpop_proof');
    });

    it('should reject header typ other than dpop+jwt', async () => {
      const proof = dpopService.generateDPoPProof(
        ecKeyPair,
        'ES256',
        defaultMethod,
        defaultUrl,
        undefined,
        undefined,
        { typ: 'JWT' },
      );

      const result = await dpopService.validateDPoPProof(
        proof,
        defaultMethod,
        defaultUrl,
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Header 'typ' must be 'dpop+jwt'");
    });

    it('should reject symmetric algorithm (HS256)', async () => {
      const header = Buffer.from(
        JSON.stringify({
          typ: 'dpop+jwt',
          alg: 'HS256',
          jwk: { kty: 'oct', k: 'c2VjcmV0' },
        }),
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          jti: 'test-1',
          htm: 'GET',
          htu: defaultUrl,
          iat: Math.floor(Date.now() / 1000),
        }),
      ).toString('base64url');
      const fakeProof = `${header}.${payload}.fakesig`;

      const result = await dpopService.validateDPoPProof(
        fakeProof,
        defaultMethod,
        defaultUrl,
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Forbidden or missing');
    });

    it('should reject alg: none', async () => {
      const header = Buffer.from(
        JSON.stringify({
          typ: 'dpop+jwt',
          alg: 'none',
          jwk: ecKeyPair.publicKey.export({ format: 'jwk' }),
        }),
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          jti: 'test-2',
          htm: 'GET',
          htu: defaultUrl,
          iat: Math.floor(Date.now() / 1000),
        }),
      ).toString('base64url');
      const fakeProof = `${header}.${payload}.fakesig`;

      const result = await dpopService.validateDPoPProof(
        fakeProof,
        defaultMethod,
        defaultUrl,
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Forbidden or missing');
    });

    it('should reject JWK containing private key parameters (e.g. d)', async () => {
      const privateJwk = ecKeyPair.privateKey.export({ format: 'jwk' }) as JWK;
      expect(privateJwk.d).toBeDefined();

      const proof = dpopService.generateDPoPProof(
        ecKeyPair,
        'ES256',
        defaultMethod,
        defaultUrl,
        undefined,
        undefined,
        { jwk: privateJwk },
      );

      const result = await dpopService.validateDPoPProof(
        proof,
        defaultMethod,
        defaultUrl,
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('DPoP JWK must NOT contain private key components');
    });

    it('should reject expired DPoP proof (iat too old)', async () => {
      const expiredIat = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago (> 300s)
      const proof = dpopService.generateDPoPProof(
        ecKeyPair,
        'ES256',
        defaultMethod,
        defaultUrl,
        undefined,
        { iat: expiredIat },
      );

      const result = await dpopService.validateDPoPProof(
        proof,
        defaultMethod,
        defaultUrl,
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('has expired');
    });

    it('should reject DPoP proof issued in future beyond clock skew', async () => {
      const futureIat = Math.floor(Date.now() / 1000) + 120; // 120 seconds in future (> 60s)
      const proof = dpopService.generateDPoPProof(
        ecKeyPair,
        'ES256',
        defaultMethod,
        defaultUrl,
        undefined,
        { iat: futureIat },
      );

      const result = await dpopService.validateDPoPProof(
        proof,
        defaultMethod,
        defaultUrl,
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('is in the future');
    });

    it('should reject HTTP method mismatch (htm)', async () => {
      const proof = dpopService.generateDPoPProof(
        ecKeyPair,
        'ES256',
        'GET',
        defaultUrl,
      );

      const result = await dpopService.validateDPoPProof(
        proof,
        'POST', // Expected POST, proof contains GET
        defaultUrl,
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('HTTP method mismatch');
    });

    it('should reject HTTP URI mismatch (htu)', async () => {
      const proof = dpopService.generateDPoPProof(
        ecKeyPair,
        'ES256',
        defaultMethod,
        'http://localhost:3333/v1/other-endpoint',
      );

      const result = await dpopService.validateDPoPProof(
        proof,
        defaultMethod,
        defaultUrl,
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('HTTP URI mismatch');
    });

    it('should reject missing ath when access token is provided', async () => {
      const proof = dpopService.generateDPoPProof(
        ecKeyPair,
        'ES256',
        defaultMethod,
        defaultUrl,
        undefined, // No ath generated
      );

      const result = await dpopService.validateDPoPProof(
        proof,
        defaultMethod,
        defaultUrl,
        'my-access-token',
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("missing 'ath' claim");
    });

    it('should reject invalid ath value when access token is mismatched', async () => {
      const proof = dpopService.generateDPoPProof(
        ecKeyPair,
        'ES256',
        defaultMethod,
        defaultUrl,
        'token-A',
      );

      const result = await dpopService.validateDPoPProof(
        proof,
        defaultMethod,
        defaultUrl,
        'token-B', // Different token than was hashed in proof
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("'ath' claim mismatch");
    });

    it('should reject invalid / tampered digital signature', async () => {
      const proof = dpopService.generateDPoPProof(
        ecKeyPair,
        'ES256',
        defaultMethod,
        defaultUrl,
      );

      const [headerB64, payloadB64, signatureB64] = proof.split('.');
      // Tamper signature by replacing last 4 characters
      const tamperedSignature =
        signatureB64.slice(0, -4) + (signatureB64.endsWith('AAAA') ? 'BBBB' : 'AAAA');
      const tamperedProof = `${headerB64}.${payloadB64}.${tamperedSignature}`;

      const result = await dpopService.validateDPoPProof(
        tamperedProof,
        defaultMethod,
        defaultUrl,
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('signature verification failed');
    });

    it('should detect and prevent REPLAY ATTACK when same JTI is presented twice', async () => {
      const proof = dpopService.generateDPoPProof(
        ecKeyPair,
        'ES256',
        defaultMethod,
        defaultUrl,
      );

      // 1st request with proof -> Valid
      const result1 = await dpopService.validateDPoPProof(
        proof,
        defaultMethod,
        defaultUrl,
      );
      expect(result1.isValid).toBe(true);

      // 2nd request with exact same proof (Replay Attack) -> MUST BE REJECTED
      const result2 = await dpopService.validateDPoPProof(
        proof,
        defaultMethod,
        defaultUrl,
      );
      expect(result2.isValid).toBe(false);
      expect(result2.errorCode).toBe('replay_detected');
      expect(result2.error).toContain('replay attack detected');
    });
  });
});
