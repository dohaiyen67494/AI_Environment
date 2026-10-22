import * as crypto from 'crypto';
import { TideQeaService } from './tide-qea.service';
import { DPoPReplayCacheService } from '../auth/dpop/dpop-replay-cache.service';
import { DPoPService } from '../auth/dpop/dpop.service';
import {
  signPayloadWithAdminKey,
  signPayloadWithAttackerKey,
  ADMIN_KEYS_DATA,
} from './tide-qea-keys.fixture';

describe('Tide QEA Multi-Admin Security Verification (TASK-203)', () => {
  let qeaService: TideQeaService;
  let replayCache: DPoPReplayCacheService;
  let dpopService: DPoPService;

  const DOCTOR_ID = 'doc11111-1111-1111-1111-111111111111';
  const OTHER_DOCTOR_ID = 'doc22222-2222-2222-2222-222222222222';
  const RECORD_ID = 'rec-medical-test-record-001';
  const OTHER_RECORD_ID = 'rec-medical-test-record-002';
  const ADMIN_1_ID = 'tide-admin-001';
  const ADMIN_2_ID = 'tide-admin-002';
  const ADMIN_3_ID = 'tide-admin-003';

  beforeEach(() => {
    replayCache = new DPoPReplayCacheService();
    dpopService = new DPoPService(replayCache);
    qeaService = new TideQeaService(replayCache);
  });

  afterEach(() => {
    replayCache.onModuleDestroy();
  });

  // =========================================================================
  // TEST 1 (FAIL PROOF): Single Admin Sign MUST FAIL (Threshold 2/3 Not Met)
  // =========================================================================
  describe('Test 1 (FAIL Proof): 1 Admin signature fails threshold 2/3', () => {
    it('should REJECT authorization when only Admin 1 signs (1/3 < 2/3)', () => {
      const assertion = qeaService.createAssertion(RECORD_ID, DOCTOR_ID, [
        ADMIN_1_ID,
      ]);

      const result = qeaService.verifyQuorumAssertion(assertion);

      // Invariant: 1 Admin sign MUST FAIL to unlock/decrypt
      expect(result.isAuthorized).toBe(false);
      expect(result.status).toBe('DENIED');
      expect(result.verifiedAdminCount).toBe(1);
      expect(result.thresholdRequired).toBe(2);
      expect(result.totalAdmins).toBe(3);
      expect(result.verifiedAdmins).toEqual([ADMIN_1_ID]);
      expect(result.rejectionReason).toContain(
        'Quorum threshold not met: Requires at least 2 distinct Admin signatures, received 1',
      );
      expect(result.unlockedGrantToken).toBeUndefined();
    });

    it('should REJECT authorization when only Admin 2 signs (1/3 < 2/3)', () => {
      const assertion = qeaService.createAssertion(RECORD_ID, DOCTOR_ID, [
        ADMIN_2_ID,
      ]);

      const result = qeaService.verifyQuorumAssertion(assertion);

      expect(result.isAuthorized).toBe(false);
      expect(result.status).toBe('DENIED');
      expect(result.verifiedAdminCount).toBe(1);
      expect(result.verifiedAdmins).toEqual([ADMIN_2_ID]);
    });

    it('should REJECT authorization when only Admin 3 signs (1/3 < 2/3)', () => {
      const assertion = qeaService.createAssertion(RECORD_ID, DOCTOR_ID, [
        ADMIN_3_ID,
      ]);

      const result = qeaService.verifyQuorumAssertion(assertion);

      expect(result.isAuthorized).toBe(false);
      expect(result.status).toBe('DENIED');
      expect(result.verifiedAdminCount).toBe(1);
      expect(result.verifiedAdmins).toEqual([ADMIN_3_ID]);
    });

    it('should reject access request with HTTP 403 Forbidden when single admin assertion is presented', () => {
      const assertion = qeaService.createAssertion(RECORD_ID, DOCTOR_ID, [
        ADMIN_1_ID,
      ]);

      const response = qeaService.requestRecordAccess({
        requesterId: DOCTOR_ID,
        requesterRole: 'DOCTOR',
        recordId: RECORD_ID,
        qeaAssertion: assertion,
      });

      expect(response.allowed).toBe(false);
      expect(response.statusCode).toBe(403);
      expect(response.qeaStatus).toBe('DENIED');
      expect(response.verifiedSignaturesCount).toBe(1);
      expect(response.decryptionGrantToken).toBeUndefined();
    });
  });

  // =========================================================================
  // TEST 2 (PASS PROOF): 2 of 3 Admin Signatures MUST PASS (Quorum Reached)
  // =========================================================================
  describe('Test 2 (PASS Proof): 2 of 3 Admin signatures unlock decryption', () => {
    it('should PASS authorization when Admin 1 and Admin 2 sign (2/3 quorum)', () => {
      const assertion = qeaService.createAssertion(RECORD_ID, DOCTOR_ID, [
        ADMIN_1_ID,
        ADMIN_2_ID,
      ]);

      const result = qeaService.verifyQuorumAssertion(assertion);

      expect(result.isAuthorized).toBe(true);
      expect(result.status).toBe('APPROVED');
      expect(result.verifiedAdminCount).toBe(2);
      expect(result.thresholdRequired).toBe(2);
      expect(result.totalAdmins).toBe(3);
      expect(result.verifiedAdmins).toContain(ADMIN_1_ID);
      expect(result.verifiedAdmins).toContain(ADMIN_2_ID);
      expect(result.unlockedGrantToken).toBeDefined();

      // Verify grant token structure
      const grantPayload = JSON.parse(
        Buffer.from(result.unlockedGrantToken!, 'base64url').toString('utf8'),
      );
      expect(grantPayload.grantType).toBe('TIDE_QEA_DECRYPTION_AUTHORIZATION');
      expect(grantPayload.quorumSatisfied).toBe(true);
      expect(grantPayload.recordId).toBe(RECORD_ID);
      expect(grantPayload.requesterId).toBe(DOCTOR_ID);
    });

    it('should PASS authorization when Admin 2 and Admin 3 sign (2/3 quorum)', () => {
      const assertion = qeaService.createAssertion(RECORD_ID, DOCTOR_ID, [
        ADMIN_2_ID,
        ADMIN_3_ID,
      ]);

      const result = qeaService.verifyQuorumAssertion(assertion);

      expect(result.isAuthorized).toBe(true);
      expect(result.status).toBe('APPROVED');
      expect(result.verifiedAdminCount).toBe(2);
      expect(result.verifiedAdmins).toContain(ADMIN_2_ID);
      expect(result.verifiedAdmins).toContain(ADMIN_3_ID);
      expect(result.unlockedGrantToken).toBeDefined();
    });

    it('should PASS authorization when Admin 1 and Admin 3 sign (2/3 quorum)', () => {
      const assertion = qeaService.createAssertion(RECORD_ID, DOCTOR_ID, [
        ADMIN_1_ID,
        ADMIN_3_ID,
      ]);

      const result = qeaService.verifyQuorumAssertion(assertion);

      expect(result.isAuthorized).toBe(true);
      expect(result.status).toBe('APPROVED');
      expect(result.verifiedAdminCount).toBe(2);
      expect(result.verifiedAdmins).toContain(ADMIN_1_ID);
      expect(result.verifiedAdmins).toContain(ADMIN_3_ID);
      expect(result.unlockedGrantToken).toBeDefined();
    });

    it('should PASS authorization when all 3 Admins sign (3/3 quorum)', () => {
      const assertion = qeaService.createAssertion(RECORD_ID, DOCTOR_ID, [
        ADMIN_1_ID,
        ADMIN_2_ID,
        ADMIN_3_ID,
      ]);

      const result = qeaService.verifyQuorumAssertion(assertion);

      expect(result.isAuthorized).toBe(true);
      expect(result.status).toBe('APPROVED');
      expect(result.verifiedAdminCount).toBe(3);
      expect(result.verifiedAdmins.length).toBe(3);
    });

    it('should grant access to Doctor with HTTP 200 when 2/3 QEA assertion is presented', () => {
      const assertion = qeaService.createAssertion(RECORD_ID, DOCTOR_ID, [
        ADMIN_1_ID,
        ADMIN_2_ID,
      ]);

      const response = qeaService.requestRecordAccess({
        requesterId: DOCTOR_ID,
        requesterRole: 'DOCTOR',
        recordId: RECORD_ID,
        qeaAssertion: assertion,
      });

      expect(response.allowed).toBe(true);
      expect(response.statusCode).toBe(200);
      expect(response.qeaStatus).toBe('APPROVED');
      expect(response.verifiedSignaturesCount).toBe(2);
      expect(response.decryptionGrantToken).toBeDefined();
    });
  });

  // =========================================================================
  // TEST 3 (DEFAULT DENY): Admins & Doctors CANNOT Decrypt Without QEA Quorum
  // =========================================================================
  describe('Test 3 (Default Deny): Role alone grants ZERO decryption authority', () => {
    it('should BLOCK Admin from decrypting (Admins have NO default decryption capability)', () => {
      const response = qeaService.requestRecordAccess({
        requesterId: 'admin-super-id-001',
        requesterRole: 'ADMIN',
        recordId: RECORD_ID,
      });

      // Invariant: Admins have no default decryption capability
      expect(response.allowed).toBe(false);
      expect(response.statusCode).toBe(403);
      expect(response.message).toContain(
        'Default Deny: Administrators have no default decryption capability',
      );
      expect(response.qeaStatus).toBe('DENIED');
    });

    it('should BLOCK Doctor from decrypting when NO QEA assertion is provided', () => {
      const response = qeaService.requestRecordAccess({
        requesterId: DOCTOR_ID,
        requesterRole: 'DOCTOR',
        recordId: RECORD_ID,
      });

      expect(response.allowed).toBe(false);
      expect(response.statusCode).toBe(403);
      expect(response.message).toContain(
        'Default Deny: Medical records cannot be decrypted without 2/3 Multi-Admin Tide QEA approval',
      );
      expect(response.qeaStatus).toBe('DENIED');
    });

    it('should BLOCK Patient from accessing clinical decryption pipeline', () => {
      const response = qeaService.requestRecordAccess({
        requesterId: 'patient-test-id-001',
        requesterRole: 'PATIENT',
        recordId: RECORD_ID,
      });

      expect(response.allowed).toBe(false);
      expect(response.statusCode).toBe(403);
      expect(response.message).toContain('Default Deny: Patients cannot invoke');
      expect(response.qeaStatus).toBe('DENIED');
    });

    it('should BLOCK access if Doctor presents a valid QEA assertion issued for a different doctor', () => {
      // Assertion was issued for DOCTOR_ID, but OTHER_DOCTOR_ID tries to use it
      const assertion = qeaService.createAssertion(RECORD_ID, DOCTOR_ID, [
        ADMIN_1_ID,
        ADMIN_2_ID,
      ]);

      const response = qeaService.requestRecordAccess({
        requesterId: OTHER_DOCTOR_ID,
        requesterRole: 'DOCTOR',
        recordId: RECORD_ID,
        qeaAssertion: assertion,
      });

      expect(response.allowed).toBe(false);
      expect(response.statusCode).toBe(403);
      expect(response.message).toContain('Requester ID mismatch');
      expect(response.qeaStatus).toBe('DENIED');
    });

    it('should BLOCK access if Doctor presents a valid QEA assertion issued for a different record', () => {
      // Assertion was issued for RECORD_ID, but Doctor attempts to access OTHER_RECORD_ID
      const assertion = qeaService.createAssertion(RECORD_ID, DOCTOR_ID, [
        ADMIN_1_ID,
        ADMIN_2_ID,
      ]);

      const response = qeaService.requestRecordAccess({
        requesterId: DOCTOR_ID,
        requesterRole: 'DOCTOR',
        recordId: OTHER_RECORD_ID,
        qeaAssertion: assertion,
      });

      expect(response.allowed).toBe(false);
      expect(response.statusCode).toBe(403);
      expect(response.message).toContain('Record ID mismatch');
      expect(response.qeaStatus).toBe('DENIED');
    });
  });

  // =========================================================================
  // TEST 4: Replay Attack Protection (RFC 9449 & Nonce Cache)
  // =========================================================================
  describe('Test 4: Replay Attack Prevention on DPoP & QEA tokens', () => {
    it('should REJECT a replayed QEA assertion with the same nonce', () => {
      const fixedNonce = 'qea-nonce-unique-test-12345';
      const assertion1 = qeaService.createAssertion(
        RECORD_ID,
        DOCTOR_ID,
        [ADMIN_1_ID, ADMIN_2_ID],
        { customNonce: fixedNonce },
      );

      // First verification: Must SUCCEED
      const result1 = qeaService.verifyQuorumAssertion(assertion1);
      expect(result1.isAuthorized).toBe(true);
      expect(result1.status).toBe('APPROVED');

      // Second verification (Replay Attack): Must FAIL
      const assertionReplay = qeaService.createAssertion(
        RECORD_ID,
        DOCTOR_ID,
        [ADMIN_1_ID, ADMIN_2_ID],
        { customNonce: fixedNonce },
      );

      const resultReplay = qeaService.verifyQuorumAssertion(assertionReplay);
      expect(resultReplay.isAuthorized).toBe(false);
      expect(resultReplay.status).toBe('DENIED');
      expect(resultReplay.rejectionReason).toContain('Replay attack detected');
      expect(resultReplay.unlockedGrantToken).toBeUndefined();
    });

    it('should REJECT a replayed DPoP proof token with identical JTI', async () => {
      const ecKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const method = 'POST';
      const url = 'http://localhost:3333/v1/records/verify-qea';
      const token = 'sample-dpop-access-token';

      const proof = dpopService.generateDPoPProof(
        ecKeyPair,
        'ES256',
        method,
        url,
        token,
      );

      // 1st request with DPoP proof -> PASS
      const res1 = await dpopService.validateDPoPProof(proof, method, url, token);
      expect(res1.isValid).toBe(true);

      // 2nd request with exact same DPoP proof -> REPLAY ATTACK BLOCKED
      const res2 = await dpopService.validateDPoPProof(proof, method, url, token);
      expect(res2.isValid).toBe(false);
      expect(res2.errorCode).toBe('replay_detected');
      expect(res2.error).toContain('replay attack detected');
    });
  });

  // =========================================================================
  // ADDITIONAL SECURITY & CRYPTOGRAPHIC INVARIANTS
  // =========================================================================
  describe('Additional Security & Cryptographic Invariants', () => {
    it('should PREVENT duplicate counting when the same Admin signs multiple times', () => {
      // Attacker attempts to forge 2 signatures using only Admin 1's key
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        policyId: 'pol-qea-2of3-sample',
        resource: 'MedicalRecord',
        action: 'DECRYPT_RECORD',
        recordId: RECORD_ID,
        requesterId: DOCTOR_ID,
        nonce: crypto.randomUUID(),
        issuedAt: now,
        expiresAt: now + 300,
      };

      const canonicalPayload = qeaService.serializePayloadCanonical(payload);
      const sig1 = signPayloadWithAdminKey(ADMIN_1_ID, canonicalPayload);
      const sig2 = signPayloadWithAdminKey(ADMIN_1_ID, canonicalPayload);

      const assertion = {
        payload,
        signatures: [
          { adminId: ADMIN_1_ID, signature: sig1, algorithm: 'ES256' as const, signedAt: now },
          { adminId: ADMIN_1_ID, signature: sig2, algorithm: 'ES256' as const, signedAt: now },
        ],
      };

      const result = qeaService.verifyQuorumAssertion(assertion);

      // Duplicate signatures from same admin must be deduplicated
      expect(result.verifiedAdminCount).toBe(1);
      expect(result.isAuthorized).toBe(false);
      expect(result.status).toBe('DENIED');
    });

    it('should REJECT signature from an unauthorized entity / attacker key', () => {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        policyId: 'pol-qea-2of3-sample',
        resource: 'MedicalRecord',
        action: 'DECRYPT_RECORD',
        recordId: RECORD_ID,
        requesterId: DOCTOR_ID,
        nonce: crypto.randomUUID(),
        issuedAt: now,
        expiresAt: now + 300,
      };

      const canonicalPayload = qeaService.serializePayloadCanonical(payload);
      const legitimateSig = signPayloadWithAdminKey(ADMIN_1_ID, canonicalPayload);
      const attackerSig = signPayloadWithAttackerKey(canonicalPayload);

      const assertion = {
        payload,
        signatures: [
          { adminId: ADMIN_1_ID, signature: legitimateSig, algorithm: 'ES256' as const, signedAt: now },
          { adminId: 'attacker-fake-admin', signature: attackerSig, algorithm: 'ES256' as const, signedAt: now },
        ],
      };

      const result = qeaService.verifyQuorumAssertion(assertion);

      // Attacker signature must be rejected, only Admin 1 is valid -> 1 < 2 -> DENIED
      expect(result.verifiedAdminCount).toBe(1);
      expect(result.isAuthorized).toBe(false);
      expect(result.status).toBe('DENIED');
    });

    it('should REJECT assertion when payload was TAMPERED after signing', () => {
      const assertion = qeaService.createAssertion(
        RECORD_ID,
        DOCTOR_ID,
        [ADMIN_1_ID, ADMIN_2_ID],
        { tamperPayload: true }, // Modifies recordId after signing
      );

      const result = qeaService.verifyQuorumAssertion(assertion);

      // Cryptographic signature check fails because hash does not match tampered payload
      expect(result.verifiedAdminCount).toBe(0);
      expect(result.isAuthorized).toBe(false);
      expect(result.status).toBe('DENIED');
    });

    it('should REJECT assertion when assertion has EXPIRED', () => {
      const assertion = qeaService.createAssertion(
        RECORD_ID,
        DOCTOR_ID,
        [ADMIN_1_ID, ADMIN_2_ID],
        { expiresInSeconds: -10 }, // Expired 10 seconds ago
      );

      const result = qeaService.verifyQuorumAssertion(assertion);

      expect(result.isAuthorized).toBe(false);
      expect(result.status).toBe('DENIED');
      expect(result.rejectionReason).toContain('QEA assertion expired');
    });
  });
});
