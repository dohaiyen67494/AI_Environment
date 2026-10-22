import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  DPoPHeader,
  DPoPPayload,
  DPoPValidationResult,
  DPoPOptions,
  JWK,
} from './dpop.types';
import { DPoPReplayCacheService } from './dpop-replay-cache.service';

@Injectable()
export class DPoPService {
  private readonly logger = new Logger(DPoPService.name);

  constructor(private readonly replayCache: DPoPReplayCacheService) {}

  /**
   * Compute Base64URL-encoded SHA-256 hash of access token (ath)
   * RFC 9449 Section 4.2
   */
  computeAccessTokenHash(accessToken: string): string {
    return crypto
      .createHash('sha256')
      .update(accessToken, 'ascii')
      .digest('base64url');
  }

  /**
   * Validate a DPoP proof according to RFC 9449 Section 4.3
   */
  async validateDPoPProof(
    dpopProofJwt: string,
    expectedMethod: string,
    expectedUrl: string,
    accessToken?: string,
    options?: DPoPOptions,
  ): Promise<DPoPValidationResult> {
    const maxAgeSeconds = options?.maxAgeSeconds ?? 300; // 5 minutes
    const maxClockSkewSeconds = options?.maxClockSkewSeconds ?? 60; // 1 minute

    if (!dpopProofJwt || typeof dpopProofJwt !== 'string') {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: 'Missing or empty DPoP proof',
      };
    }

    // 1. Split JWT into 3 parts (header, payload, signature)
    const parts = dpopProofJwt.split('.');
    if (parts.length !== 3) {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: 'DPoP proof must be a valid 3-part JWS',
      };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // 2. Decode and parse Header
    let header: DPoPHeader;
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    } catch {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: 'Invalid DPoP header JSON',
      };
    }

    // 3. Validate Header: typ MUST be 'dpop+jwt' (case-insensitive)
    if (!header.typ || header.typ.toLowerCase() !== 'dpop+jwt') {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: `Header 'typ' must be 'dpop+jwt', received: '${header.typ}'`,
      };
    }

    // 4. Validate Header: alg MUST NOT be 'none' or symmetric (HS*)
    if (!header.alg || header.alg === 'none' || header.alg.toUpperCase().startsWith('HS')) {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: `Forbidden or missing 'alg' in DPoP header: '${header.alg}'. Symmetric algorithms and 'none' are disallowed by RFC 9449.`,
      };
    }

    // 5. Validate Header: jwk MUST be present, valid object, and MUST NOT contain private key parts
    if (!header.jwk || typeof header.jwk !== 'object') {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: `DPoP header must contain a public 'jwk'`,
      };
    }

    const forbiddenPrivateFields = ['d', 'p', 'q', 'dp', 'dq', 'qi'];
    for (const field of forbiddenPrivateFields) {
      if (field in header.jwk) {
        return {
          isValid: false,
          errorCode: 'invalid_dpop_proof',
          error: `DPoP JWK must NOT contain private key components (found '${field}')`,
        };
      }
    }

    // 6. Decode and parse Payload
    let payload: DPoPPayload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: 'Invalid DPoP payload JSON',
      };
    }

    // 7. Validate Payload: jti MUST be non-empty string
    if (!payload.jti || typeof payload.jti !== 'string' || payload.jti.trim() === '') {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: `DPoP payload must contain a non-empty 'jti'`,
      };
    }

    // 8. Replay Protection: Check if JTI was previously used
    if (this.replayCache.has(payload.jti)) {
      this.logger.warn(`DPoP Replay attack detected for JTI: ${payload.jti}`);
      return {
        isValid: false,
        errorCode: 'replay_detected',
        error: `DPoP proof token has already been used (replay attack detected for jti: '${payload.jti}')`,
      };
    }

    // 9. Validate Payload: htm (HTTP Method) MUST match request method
    if (!payload.htm || payload.htm.toUpperCase() !== expectedMethod.toUpperCase()) {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: `HTTP method mismatch: expected '${expectedMethod.toUpperCase()}', got '${payload.htm}'`,
      };
    }

    // 10. Validate Payload: htu (HTTP URI) MUST match request URI without query/fragment
    const normalizedExpected = this.normalizeUrl(expectedUrl);
    const normalizedPayload = this.normalizeUrl(payload.htu);
    if (!this.matchesUrl(normalizedExpected, normalizedPayload)) {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: `HTTP URI mismatch: expected '${normalizedExpected}', got '${normalizedPayload}'`,
      };
    }

    // 11. Validate Payload: iat (Issued At)
    if (typeof payload.iat !== 'number' || isNaN(payload.iat)) {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: `DPoP payload must contain a numeric 'iat'`,
      };
    }

    const nowEpoch = Math.floor(Date.now() / 1000);
    if (payload.iat > nowEpoch + maxClockSkewSeconds) {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: `DPoP proof iat is in the future (${payload.iat} > ${nowEpoch + maxClockSkewSeconds})`,
      };
    }

    if (payload.iat < nowEpoch - maxAgeSeconds) {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: `DPoP proof has expired (iat: ${payload.iat}, current: ${nowEpoch}, maxAge: ${maxAgeSeconds}s)`,
      };
    }

    // 12. Validate Payload: ath (Access Token Hash) if access token is present
    if (accessToken) {
      const expectedAth = this.computeAccessTokenHash(accessToken);
      if (!payload.ath) {
        return {
          isValid: false,
          errorCode: 'invalid_dpop_proof',
          error: `DPoP proof is missing 'ath' claim for the presented access token`,
        };
      }
      if (payload.ath !== expectedAth) {
        return {
          isValid: false,
          errorCode: 'invalid_dpop_proof',
          error: `DPoP 'ath' claim mismatch with presented access token`,
        };
      }
    }

    // 13. Cryptographic Signature Verification using the public JWK
    const signingInput = `${headerB64}.${payloadB64}`;
    const signatureBuffer = Buffer.from(signatureB64, 'base64url');

    const isSignatureValid = this.verifySignature(
      header.alg,
      header.jwk,
      signingInput,
      signatureBuffer,
    );

    if (!isSignatureValid) {
      return {
        isValid: false,
        errorCode: 'invalid_dpop_proof',
        error: 'DPoP cryptographic signature verification failed',
      };
    }

    // 14. Record JTI into Replay Cache
    this.replayCache.add(payload.jti, maxAgeSeconds);

    return {
      isValid: true,
      payload,
      header,
    };
  }

  /**
   * Verify digital signature with public JWK
   */
  private verifySignature(
    alg: string,
    jwk: JWK,
    signingInput: string,
    signature: Buffer,
  ): boolean {
    try {
      const publicKey = crypto.createPublicKey({
        key: jwk as crypto.JsonWebKey,
        format: 'jwk',
      });

      const upperAlg = alg.toUpperCase();

      if (upperAlg === 'RS256' || upperAlg === 'RS384' || upperAlg === 'RS512') {
        const hashAlg = upperAlg.replace('RS', 'SHA');
        const verifier = crypto.createVerify(hashAlg);
        verifier.update(signingInput);
        verifier.end();
        return verifier.verify(publicKey, signature);
      }

      if (upperAlg === 'PS256' || upperAlg === 'PS384' || upperAlg === 'PS512') {
        const hashAlg = upperAlg.replace('PS', 'SHA');
        const verifier = crypto.createVerify(hashAlg);
        verifier.update(signingInput);
        verifier.end();
        return verifier.verify(
          {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
          },
          signature,
        );
      }

      if (upperAlg === 'ES256' || upperAlg === 'ES384' || upperAlg === 'ES512') {
        const hashAlg = upperAlg.replace('ES', 'SHA');
        const verifier = crypto.createVerify(hashAlg);
        verifier.update(signingInput);
        verifier.end();
        return verifier.verify(
          {
            key: publicKey,
            dsaEncoding: 'ieee-p1363',
          },
          signature,
        );
      }

      if (upperAlg === 'EDDSA') {
        return crypto.verify(null, Buffer.from(signingInput), publicKey, signature);
      }

      return false;
    } catch (err) {
      this.logger.debug(`Signature verification exception: ${err.message}`);
      return false;
    }
  }

  /**
   * Strip query string and fragments and normalize URL
   */
  normalizeUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    try {
      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        const parsed = new URL(rawUrl);
        // Normalized: scheme + host + pathname (without trailing slash unless root)
        const path = parsed.pathname.length > 1 && parsed.pathname.endsWith('/')
          ? parsed.pathname.slice(0, -1)
          : parsed.pathname;
        return `${parsed.protocol}//${parsed.host}${path}`;
      }
      // If path only
      const pathOnly = rawUrl.split('?')[0].split('#')[0];
      return pathOnly.length > 1 && pathOnly.endsWith('/') ? pathOnly.slice(0, -1) : pathOnly;
    } catch {
      return rawUrl.split('?')[0].split('#')[0];
    }
  }

  /**
   * Flexible URL matching that handles full URL vs pathname matching
   */
  private matchesUrl(expected: string, received: string): boolean {
    if (expected === received) return true;

    // If one is full URL and other is relative path, compare pathname
    try {
      const expectedPath = expected.startsWith('http') ? new URL(expected).pathname : expected;
      const receivedPath = received.startsWith('http') ? new URL(received).pathname : received;
      const cleanExpected = expectedPath.length > 1 && expectedPath.endsWith('/') ? expectedPath.slice(0, -1) : expectedPath;
      const cleanReceived = receivedPath.length > 1 && receivedPath.endsWith('/') ? receivedPath.slice(0, -1) : receivedPath;

      if (cleanExpected === cleanReceived) {
        return true;
      }
    } catch {
      // Fall through
    }

    return false;
  }

  /**
   * Helper to create a signed DPoP Proof (useful in tests and client emulation)
   */
  generateDPoPProof(
    keyPair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject },
    alg: 'ES256' | 'RS256' | 'PS256',
    htm: string,
    htu: string,
    accessToken?: string,
    customPayload?: Partial<DPoPPayload>,
    customHeader?: Partial<DPoPHeader>,
  ): string {
    const jwk = keyPair.publicKey.export({ format: 'jwk' }) as JWK;

    const header: DPoPHeader = {
      typ: 'dpop+jwt',
      alg,
      jwk,
      ...customHeader,
    };

    const payload: DPoPPayload = {
      jti: crypto.randomUUID(),
      htm: htm.toUpperCase(),
      htu,
      iat: Math.floor(Date.now() / 1000),
      ...(accessToken ? { ath: this.computeAccessTokenHash(accessToken) } : {}),
      ...customPayload,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signingInput = `${headerB64}.${payloadB64}`;

    let signatureBuffer: Buffer;
    if (alg === 'ES256') {
      const signer = crypto.createSign('SHA256');
      signer.update(signingInput);
      signer.end();
      signatureBuffer = signer.sign({
        key: keyPair.privateKey,
        dsaEncoding: 'ieee-p1363',
      });
    } else if (alg === 'PS256') {
      const signer = crypto.createSign('SHA256');
      signer.update(signingInput);
      signer.end();
      signatureBuffer = signer.sign({
        key: keyPair.privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      });
    } else {
      // RS256
      const signer = crypto.createSign('SHA256');
      signer.update(signingInput);
      signer.end();
      signatureBuffer = signer.sign(keyPair.privateKey);
    }

    const signatureB64 = signatureBuffer.toString('base64url');
    return `${headerB64}.${payloadB64}.${signatureB64}`;
  }
}
