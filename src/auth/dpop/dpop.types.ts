export interface JWK {
  kty: string;
  use?: string;
  key_ops?: string[];
  alg?: string;
  kid?: string;
  x5u?: string;
  x5c?: string[];
  x5t?: string;
  'x5t#S256'?: string;
  crv?: string;
  x?: string;
  y?: string;
  n?: string;
  e?: string;
  d?: string; // Private key material - FORBIDDEN in DPoP JWK
  p?: string;
  q?: string;
  dp?: string;
  dq?: string;
  qi?: string;
  [key: string]: unknown;
}

export interface DPoPHeader {
  typ: string; // MUST be 'dpop+jwt'
  alg: string; // Asymmetric algorithm (e.g. ES256, RS256, PS256, EdDSA)
  jwk: JWK;    // Public key of client
  kid?: string;
}

export interface DPoPPayload {
  jti: string;  // Unique proof identifier for replay protection
  htm: string;  // HTTP method (GET, POST, etc.)
  htu: string;  // HTTP URI without query and fragment
  iat: number;  // Issuance timestamp (epoch seconds)
  ath?: string; // Base64URL(SHA-256(access_token))
  nonce?: string;
  [key: string]: unknown;
}

export interface DPoPValidationResult {
  isValid: boolean;
  error?: string;
  errorCode?: 'invalid_dpop_proof' | 'use_dpop_nonce' | 'replay_detected';
  payload?: DPoPPayload;
  header?: DPoPHeader;
}

export interface DPoPOptions {
  maxAgeSeconds?: number;      // Default: 300s (5 minutes)
  maxClockSkewSeconds?: number; // Default: 60s
  enforceNonce?: boolean;
}
