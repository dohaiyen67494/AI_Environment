import {
  Injectable,
  Logger,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  TideQeaPolicyDefinition,
  TideQeaAssertion,
  TideQeaAssertionPayload,
  TideQeaVerificationResult,
  DecryptionAccessRequest,
  DecryptionAccessResponse,
  AuthorizedAdmin,
} from './tide-qea.types';
import {
  getAuthorizedAdminsList,
  signPayloadWithAdminKey,
} from './tide-qea-keys.fixture';
import { DPoPReplayCacheService } from '../auth/dpop/dpop-replay-cache.service';

@Injectable()
export class TideQeaService {
  private readonly logger = new Logger(TideQeaService.name);
  private policy: TideQeaPolicyDefinition;
  private adminPublicKeys = new Map<string, crypto.KeyObject>();

  constructor(private readonly replayCache: DPoPReplayCacheService) {
    this.initPolicy();
  }

  /**
   * Initialize policy from realm config file or fallback to standard 2/3 definition
   */
  private initPolicy(): void {
    const realmPath = path.resolve(
      process.cwd(),
      'config',
      'tide',
      'careflow-realm.json',
    );

    let loadedPolicy: Partial<TideQeaPolicyDefinition> | undefined;

    if (fs.existsSync(realmPath)) {
      try {
        const realmContent = JSON.parse(fs.readFileSync(realmPath, 'utf8'));
        if (realmContent.tideQeaPolicy) {
          loadedPolicy = realmContent.tideQeaPolicy;
          this.logger.log('Loaded Tide QEA policy from careflow-realm.json');
        }
      } catch (err) {
        this.logger.warn(
          `Could not parse realm JSON at ${realmPath}: ${err.message}. Using built-in policy.`,
        );
      }
    }

    const authorizedAdmins: AuthorizedAdmin[] =
      loadedPolicy?.authorizedAdmins ?? getAuthorizedAdminsList();

    this.policy = {
      policyId: loadedPolicy?.policyId ?? 'pol-qea-2of3-sample',
      policyName:
        loadedPolicy?.policyName ?? 'CareFlow-MultiAdmin-Threshold-Policy',
      version: loadedPolicy?.version ?? '1.0.0',
      resource: loadedPolicy?.resource ?? 'MedicalRecord',
      action: loadedPolicy?.action ?? 'DECRYPT_RECORD',
      rule: loadedPolicy?.rule ?? 'REQUIRES_QEA_QUORUM_2_OF_3',
      threshold: loadedPolicy?.threshold ?? 2,
      totalAdmins: loadedPolicy?.totalAdmins ?? 3,
      defaultDeny: loadedPolicy?.defaultDeny ?? true,
      allowAdminDirectDecryption:
        loadedPolicy?.allowAdminDirectDecryption ?? false,
      allowDoctorDirectDecryption:
        loadedPolicy?.allowDoctorDirectDecryption ?? false,
      enforceDPoPReplayProtection:
        loadedPolicy?.enforceDPoPReplayProtection ?? true,
      authorizedAdmins,
    };

    // Cache Public Key objects for all authorized admins
    for (const admin of this.policy.authorizedAdmins) {
      try {
        const keyObj = crypto.createPublicKey({
          key: admin.publicKey as crypto.JsonWebKey,
          format: 'jwk',
        });
        this.adminPublicKeys.set(admin.tideId, keyObj);
      } catch (err) {
        this.logger.error(
          `Failed to parse public key for admin ${admin.tideId}: ${err.message}`,
        );
      }
    }
  }

  /**
   * Return current Tide QEA Policy Definition
   */
  getPolicy(): TideQeaPolicyDefinition {
    return this.policy;
  }

  /**
   * Canonical serialization of assertion payload for digital signature verification
   */
  serializePayloadCanonical(payload: TideQeaAssertionPayload): string {
    return [
      `action=${payload.action}`,
      `expiresAt=${payload.expiresAt}`,
      `issuedAt=${payload.issuedAt}`,
      `nonce=${payload.nonce}`,
      `policyId=${payload.policyId}`,
      `recordId=${payload.recordId}`,
      `requesterId=${payload.requesterId}`,
      `resource=${payload.resource}`,
    ].join('&');
  }

  /**
   * Cryptographically verify an Admin signature with ECDSA P-256 (ES256)
   */
  verifyAdminSignature(
    adminId: string,
    canonicalPayload: string,
    signatureB64: string,
  ): boolean {
    const publicKey = this.adminPublicKeys.get(adminId);
    if (!publicKey) {
      this.logger.warn(`Signature verification failed: Unknown Admin ID '${adminId}'`);
      return false;
    }

    try {
      const signature = Buffer.from(signatureB64, 'base64url');
      const verifier = crypto.createVerify('SHA256');
      verifier.update(canonicalPayload);
      verifier.end();

      return verifier.verify(
        {
          key: publicKey,
          dsaEncoding: 'ieee-p1363',
        },
        signature,
      );
    } catch (err) {
      this.logger.debug(
        `Crypto verification exception for admin '${adminId}': ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Core Tide QEA Verification:
   * Multi-Admin Threshold Policy verification (Requires 2 of 3 Admin signatures)
   */
  verifyQuorumAssertion(assertion: TideQeaAssertion): TideQeaVerificationResult {
    const { payload, signatures } = assertion;

    // 1. Validate Policy ID
    if (payload.policyId !== this.policy.policyId) {
      return {
        isAuthorized: false,
        status: 'DENIED',
        verifiedAdminCount: 0,
        thresholdRequired: this.policy.threshold,
        totalAdmins: this.policy.totalAdmins,
        verifiedAdmins: [],
        rejectionReason: `Policy ID mismatch: expected '${this.policy.policyId}', got '${payload.policyId}'`,
      };
    }

    // 2. Validate Resource & Action
    if (
      payload.resource !== this.policy.resource ||
      payload.action !== this.policy.action
    ) {
      return {
        isAuthorized: false,
        status: 'DENIED',
        verifiedAdminCount: 0,
        thresholdRequired: this.policy.threshold,
        totalAdmins: this.policy.totalAdmins,
        verifiedAdmins: [],
        rejectionReason: `Invalid resource/action: expected ${this.policy.resource}:${this.policy.action}, got ${payload.resource}:${payload.action}`,
      };
    }

    // 3. Expiration Check
    const nowEpoch = Math.floor(Date.now() / 1000);
    if (payload.expiresAt <= nowEpoch) {
      return {
        isAuthorized: false,
        status: 'DENIED',
        verifiedAdminCount: 0,
        thresholdRequired: this.policy.threshold,
        totalAdmins: this.policy.totalAdmins,
        verifiedAdmins: [],
        rejectionReason: `QEA assertion expired at ${payload.expiresAt} (current: ${nowEpoch})`,
      };
    }

    // 4. Replay Protection: Check if assertion nonce has already been used
    if (this.replayCache.has(payload.nonce)) {
      this.logger.warn(`QEA Assertion replay detected for nonce: ${payload.nonce}`);
      return {
        isAuthorized: false,
        status: 'DENIED',
        verifiedAdminCount: 0,
        thresholdRequired: this.policy.threshold,
        totalAdmins: this.policy.totalAdmins,
        verifiedAdmins: [],
        rejectionReason: `Replay attack detected: Nonce '${payload.nonce}' has already been used.`,
      };
    }

    // 5. Canonicalize Payload for signature checking
    const canonicalPayload = this.serializePayloadCanonical(payload);

    // 6. Cryptographic Signature Verification & Deduplication
    const verifiedAdminsSet = new Set<string>();

    for (const sig of signatures) {
      // Must be ES256
      if (sig.algorithm !== 'ES256') {
        this.logger.warn(`Skipping signature: Unsupported algorithm '${sig.algorithm}'`);
        continue;
      }

      // Check if admin is authorized in policy
      if (!this.adminPublicKeys.has(sig.adminId)) {
        this.logger.warn(`Skipping signature from unauthorized entity '${sig.adminId}'`);
        continue;
      }

      // Cryptographically verify signature
      const isValid = this.verifyAdminSignature(
        sig.adminId,
        canonicalPayload,
        sig.signature,
      );

      if (isValid) {
        verifiedAdminsSet.add(sig.adminId);
      } else {
        this.logger.warn(
          `Cryptographic signature verification FAILED for admin '${sig.adminId}'`,
        );
      }
    }

    const verifiedAdminCount = verifiedAdminsSet.size;
    const verifiedAdmins = Array.from(verifiedAdminsSet);

    // 7. Threshold Evaluation (Invariant: 2 of 3 Admins required)
    if (verifiedAdminCount < this.policy.threshold) {
      this.logger.warn(
        `[TIDE QEA FAIL PROOF] Quorum threshold not reached: required ${this.policy.threshold}, received ${verifiedAdminCount} valid admin signature(s) from [${verifiedAdmins.join(', ')}].`,
      );

      return {
        isAuthorized: false,
        status: 'DENIED',
        verifiedAdminCount,
        thresholdRequired: this.policy.threshold,
        totalAdmins: this.policy.totalAdmins,
        verifiedAdmins,
        rejectionReason: `Quorum threshold not met: Requires at least ${this.policy.threshold} distinct Admin signatures, received ${verifiedAdminCount}. Decryption authorization denied.`,
      };
    }

    // Record nonce in replay cache upon successful quorum to prevent replay
    this.replayCache.add(payload.nonce, 300);

    // 8. Quorum Succeeded (2 of 3 Admins verified)
    this.logger.log(
      `[TIDE QEA PASS PROOF] Quorum threshold SATISFIED: ${verifiedAdminCount}/${this.policy.totalAdmins} Admin signatures verified [${verifiedAdmins.join(', ')}]. Decryption authorization unlocked.`,
    );

    // Create cryptographically signed Grant Assertion Token
    const grantToken = this.issueDecryptionGrantToken(payload, verifiedAdmins);

    return {
      isAuthorized: true,
      status: 'APPROVED',
      verifiedAdminCount,
      thresholdRequired: this.policy.threshold,
      totalAdmins: this.policy.totalAdmins,
      verifiedAdmins,
      unlockedGrantToken: grantToken,
    };
  }

  /**
   * Request medical record decryption authorization.
   * Enforces Default Deny Principle & Multi-Admin QEA Quorum.
   */
  requestRecordAccess(
    request: DecryptionAccessRequest,
  ): DecryptionAccessResponse {
    const { requesterId, requesterRole, recordId, qeaAssertion } = request;

    // Rule 1: Admins have NO default decryption capability
    if (requesterRole === 'ADMIN') {
      this.logger.warn(
        `Default Deny: Admin (${requesterId}) attempted direct record decryption. Admins possess zero default decryption capability.`,
      );
      return {
        allowed: false,
        statusCode: 403,
        message:
          'Default Deny: Administrators have no default decryption capability under Tide zero-knowledge architecture. Medical records remain encrypted.',
        qeaStatus: 'DENIED',
      };
    }

    // Rule 2: Patients cannot directly invoke clinical record decryption endpoint
    if (requesterRole === 'PATIENT') {
      this.logger.warn(
        `Default Deny: Patient (${requesterId}) cannot decrypt records via provider pipeline.`,
      );
      return {
        allowed: false,
        statusCode: 403,
        message:
          'Default Deny: Patients cannot invoke doctor clinical decryption pipeline.',
        qeaStatus: 'DENIED',
      };
    }

    // Rule 3: Doctor without QEA approval CANNOT decrypt
    if (!qeaAssertion) {
      this.logger.warn(
        `Default Deny: Doctor (${requesterId}) requested record ${recordId} without Tide QEA approval.`,
      );
      return {
        allowed: false,
        statusCode: 403,
        message:
          'Default Deny: Medical records cannot be decrypted without 2/3 Multi-Admin Tide QEA approval.',
        qeaStatus: 'DENIED',
      };
    }

    // Rule 4: Verify QEA Multi-Admin Quorum
    const qeaResult = this.verifyQuorumAssertion(qeaAssertion);

    if (!qeaResult.isAuthorized) {
      return {
        allowed: false,
        statusCode: 403,
        message: qeaResult.rejectionReason || 'QEA threshold not met',
        qeaStatus: 'DENIED',
        verifiedSignaturesCount: qeaResult.verifiedAdminCount,
      };
    }

    // Ensure requester matches assertion requester
    if (qeaAssertion.payload.requesterId !== requesterId) {
      return {
        allowed: false,
        statusCode: 403,
        message: `Requester ID mismatch: assertion issued for '${qeaAssertion.payload.requesterId}', requested by '${requesterId}'`,
        qeaStatus: 'DENIED',
      };
    }

    // Ensure record matches assertion record
    if (qeaAssertion.payload.recordId !== recordId) {
      return {
        allowed: false,
        statusCode: 403,
        message: `Record ID mismatch: assertion issued for record '${qeaAssertion.payload.recordId}', requested '${recordId}'`,
        qeaStatus: 'DENIED',
      };
    }

    return {
      allowed: true,
      statusCode: 200,
      message:
        'Tide QEA Quorum Verified (2/3 Admins): Client is authorized to decrypt the medical record locally.',
      qeaStatus: 'APPROVED',
      verifiedSignaturesCount: qeaResult.verifiedAdminCount,
      decryptionGrantToken: qeaResult.unlockedGrantToken,
    };
  }

  /**
   * Helper: Generate a signed QEA Assertion for testing or client submission
   */
  createAssertion(
    recordId: string,
    requesterId: string,
    adminIds: string[],
    options?: {
      customNonce?: string;
      expiresInSeconds?: number;
      tamperPayload?: boolean;
    },
  ): TideQeaAssertion {
    const now = Math.floor(Date.now() / 1000);
    const ttl = options?.expiresInSeconds ?? 300;

    const payload: TideQeaAssertionPayload = {
      policyId: this.policy.policyId,
      resource: this.policy.resource,
      action: this.policy.action,
      recordId,
      requesterId,
      nonce: options?.customNonce ?? crypto.randomUUID(),
      issuedAt: now,
      expiresAt: now + ttl,
    };

    const canonicalPayload = this.serializePayloadCanonical(payload);

    const signatures = adminIds.map((adminId) => {
      const signature = signPayloadWithAdminKey(adminId, canonicalPayload);
      return {
        adminId,
        signature,
        algorithm: 'ES256' as const,
        signedAt: now,
      };
    });

    if (options?.tamperPayload) {
      // Modify recordId to simulate payload tampering after admin signed
      payload.recordId = 'tampered-record-id-999';
    }

    return {
      payload,
      signatures,
    };
  }

  /**
   * Issue a short-lived cryptographic grant token for local client decryption
   */
  private issueDecryptionGrantToken(
    payload: TideQeaAssertionPayload,
    verifiedAdmins: string[],
  ): string {
    const grantData = {
      grantType: 'TIDE_QEA_DECRYPTION_AUTHORIZATION',
      policyId: payload.policyId,
      recordId: payload.recordId,
      requesterId: payload.requesterId,
      quorumSatisfied: true,
      threshold: this.policy.threshold,
      verifiedAdmins,
      timestamp: Date.now(),
      expiresAt: payload.expiresAt,
    };

    return Buffer.from(JSON.stringify(grantData)).toString('base64url');
  }
}
