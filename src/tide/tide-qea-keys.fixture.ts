import * as crypto from 'crypto';
import { JWK } from '../auth/dpop/dpop.types';
import { AuthorizedAdmin } from './tide-qea.types';

export interface KeyPairRecord {
  adminId: string;
  email: string;
  name: string;
  publicKeyJwk: JWK;
  privateKeyJwk: JWK;
  publicKeyObject: crypto.KeyObject;
  privateKeyObject: crypto.KeyObject;
}

export const ADMIN_KEYS_DATA: Array<{
  adminId: string;
  email: string;
  name: string;
  index: number;
  pub: JWK;
  priv: JWK;
}> = [
  {
    adminId: 'tide-admin-001',
    email: 'admin1@careflow.vn',
    name: 'Nguyễn Minh Trí',
    index: 1,
    pub: {
      kty: 'EC',
      x: 'dTnZ062v-QR3mvg_bAfC16AXTMULDLPCkgt6rvfAzPA',
      y: 'by0wtG_Xm8utz6UGrDGur4PDvVCaHUJZHgTqLigCZio',
      crv: 'P-256',
    },
    priv: {
      kty: 'EC',
      x: 'dTnZ062v-QR3mvg_bAfC16AXTMULDLPCkgt6rvfAzPA',
      y: 'by0wtG_Xm8utz6UGrDGur4PDvVCaHUJZHgTqLigCZio',
      crv: 'P-256',
      d: '1UX23-EdUAAzvLIIsdfaDpzwLmrXQviKDeOLnEIazL8',
    },
  },
  {
    adminId: 'tide-admin-002',
    email: 'admin2@careflow.vn',
    name: 'Trần Thị Mai',
    index: 2,
    pub: {
      kty: 'EC',
      x: 'cExMpH-1qxh13IM2tECwDXZo-hcfg8V9LvPKdneaiNw',
      y: 'wp_iU1dNt6lorr0CQaxn1sU2spcmULDFh9R01I9SCMo',
      crv: 'P-256',
    },
    priv: {
      kty: 'EC',
      x: 'cExMpH-1qxh13IM2tECwDXZo-hcfg8V9LvPKdneaiNw',
      y: 'wp_iU1dNt6lorr0CQaxn1sU2spcmULDFh9R01I9SCMo',
      crv: 'P-256',
      d: 'oC1is7MYOsp5_2bG4Dc34jIOjhqG_qEo5JXdvRGWPkY',
    },
  },
  {
    adminId: 'tide-admin-003',
    email: 'admin3@careflow.vn',
    name: 'Lê Hoàng Nam',
    index: 3,
    pub: {
      kty: 'EC',
      x: 'EK1xxFROofK3GGVq46ceOMZMJJ3s0zBStABvZdV70dk',
      y: 'U5ypssCErJF4V8Z2G4tQ2MqkiUMPJ6Gw34FNvtk1gZk',
      crv: 'P-256',
    },
    priv: {
      kty: 'EC',
      x: 'EK1xxFROofK3GGVq46ceOMZMJJ3s0zBStABvZdV70dk',
      y: 'U5ypssCErJF4V8Z2G4tQ2MqkiUMPJ6Gw34FNvtk1gZk',
      crv: 'P-256',
      d: 'KxZg-UoIKlj_s1ftstQL7o-GWWfLQNIrx3Y1_ZqLNrg',
    },
  },
];

// Attacker key (not in authorized admins)
export const ATTACKER_KEY = {
  adminId: 'attacker-admin-999',
  pub: {
    kty: 'EC',
    x: 'Wan4hQP7fQSL9ATTCrFP_7QtRiDbQralY5h-lqeDlfI',
    y: 'zM5-XnGCTTCwP35Fp-veqpjHw_cOveC9R4_SGPzFiUk',
    crv: 'P-256',
  },
  priv: {
    kty: 'EC',
    x: 'Wan4hQP7fQSL9ATTCrFP_7QtRiDbQralY5h-lqeDlfI',
    y: 'zM5-XnGCTTCwP35Fp-veqpjHw_cOveC9R4_SGPzFiUk',
    crv: 'P-256',
    d: 'r_VFlO6RVHLPAUD2jlioxw9iKdgbKGBiz-Vv2yWZ7O0',
  },
};

/**
 * Returns instantiated KeyObjects for the authorized admins
 */
export function getAuthorizedAdminKeyPairs(): Map<string, KeyPairRecord> {
  const map = new Map<string, KeyPairRecord>();

  for (const item of ADMIN_KEYS_DATA) {
    const pubObj = crypto.createPublicKey({
      key: item.pub as crypto.JsonWebKey,
      format: 'jwk',
    });
    const privObj = crypto.createPrivateKey({
      key: item.priv as crypto.JsonWebKey,
      format: 'jwk',
    });

    map.set(item.adminId, {
      adminId: item.adminId,
      email: item.email,
      name: item.name,
      publicKeyJwk: item.pub,
      privateKeyJwk: item.priv,
      publicKeyObject: pubObj,
      privateKeyObject: privObj,
    });
  }

  return map;
}

/**
 * Returns authorized admin definitions for policy configuration
 */
export function getAuthorizedAdminsList(): AuthorizedAdmin[] {
  return ADMIN_KEYS_DATA.map((item) => ({
    tideId: item.adminId,
    email: item.email,
    name: item.name,
    role: 'ADMIN',
    index: item.index,
    publicKey: item.pub,
  }));
}

/**
 * Cryptographically sign a canonical payload with an Admin's ECDSA P-256 private key
 */
export function signPayloadWithAdminKey(
  adminId: string,
  canonicalPayload: string,
): string {
  const adminKey = ADMIN_KEYS_DATA.find((a) => a.adminId === adminId);
  if (!adminKey) {
    throw new Error(`Admin key not found for ID: ${adminId}`);
  }

  const privObj = crypto.createPrivateKey({
    key: adminKey.priv as crypto.JsonWebKey,
    format: 'jwk',
  });

  const signer = crypto.createSign('SHA256');
  signer.update(canonicalPayload);
  signer.end();

  const signature = signer.sign({
    key: privObj,
    dsaEncoding: 'ieee-p1363',
  });

  return signature.toString('base64url');
}

/**
 * Sign payload using the attacker's unauthorized key
 */
export function signPayloadWithAttackerKey(canonicalPayload: string): string {
  const privObj = crypto.createPrivateKey({
    key: ATTACKER_KEY.priv as crypto.JsonWebKey,
    format: 'jwk',
  });

  const signer = crypto.createSign('SHA256');
  signer.update(canonicalPayload);
  signer.end();

  const signature = signer.sign({
    key: privObj,
    dsaEncoding: 'ieee-p1363',
  });

  return signature.toString('base64url');
}
