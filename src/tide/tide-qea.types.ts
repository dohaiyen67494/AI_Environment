import { JWK } from '../auth/dpop/dpop.types';

export interface AuthorizedAdmin {
  tideId: string;
  email: string;
  name: string;
  role: 'ADMIN';
  index: number;
  publicKey: JWK;
}

export interface TideQeaPolicyDefinition {
  policyId: string;
  policyName: string;
  version: string;
  resource: string;
  action: string;
  rule: string;
  threshold: number;
  totalAdmins: number;
  defaultDeny: boolean;
  allowAdminDirectDecryption: boolean;
  allowDoctorDirectDecryption: boolean;
  enforceDPoPReplayProtection: boolean;
  authorizedAdmins: AuthorizedAdmin[];
}

export interface AdminSignature {
  adminId: string; // e.g. "tide-admin-001"
  signature: string; // Base64URL encoded ECDSA P-256 signature
  algorithm: 'ES256';
  signedAt: number; // Unix timestamp seconds
}

export interface TideQeaAssertionPayload {
  policyId: string;
  resource: string;
  action: string;
  recordId: string;
  requesterId: string; // Doctor ID requesting decryption
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export interface TideQeaAssertion {
  payload: TideQeaAssertionPayload;
  signatures: AdminSignature[];
}

export interface TideQeaVerificationResult {
  isAuthorized: boolean;
  status: 'APPROVED' | 'DENIED';
  verifiedAdminCount: number;
  thresholdRequired: number;
  totalAdmins: number;
  verifiedAdmins: string[];
  rejectionReason?: string;
  unlockedGrantToken?: string;
}

export interface DecryptionAccessRequest {
  requesterId: string;
  requesterRole: 'ADMIN' | 'DOCTOR' | 'PATIENT';
  recordId: string;
  qeaAssertion?: TideQeaAssertion;
  dpopProof?: string;
}

export interface DecryptionAccessResponse {
  allowed: boolean;
  statusCode: number;
  message: string;
  qeaStatus?: 'APPROVED' | 'DENIED';
  verifiedSignaturesCount?: number;
  decryptionGrantToken?: string;
}
