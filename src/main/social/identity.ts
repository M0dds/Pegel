import { createPrivateKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, safeStorage } from 'electron';
import { isUserId, type UserId } from '@shared/social-protocol';

/**
 * Pegel's own identity for friends and parties: an Ed25519 key pair made on
 * this computer. The public key is the user id; the private key never leaves
 * the machine and is stored encrypted by the OS (`safeStorage`) where
 * available. It is not a password and has nothing to do with Google.
 */
export interface Identity {
  id: UserId;
  /** Signature as base64url (86 characters). */
  sign(payload: string): string;
}

interface IdentityFile {
  v: 1;
  id: UserId;
  /** PKCS#8 DER of the private key, base64; encrypted with safeStorage if `encrypted`. */
  key: string;
  encrypted: boolean;
}

function filePath(): string {
  return join(app.getPath('userData'), 'identity.json');
}

function wrap(id: UserId, key: KeyObject): Identity {
  return { id, sign: (payload) => sign(null, Buffer.from(payload), key).toString('base64url') };
}

export function loadIdentity(): Identity | null {
  try {
    const file = JSON.parse(readFileSync(filePath(), 'utf8')) as IdentityFile;
    if (file.v !== 1 || !isUserId(file.id) || typeof file.key !== 'string') return null;
    const raw = Buffer.from(file.key, 'base64');
    const der = file.encrypted ? Buffer.from(safeStorage.decryptString(raw), 'base64') : raw;
    const key = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    return wrap(file.id, key);
  } catch {
    return null;
  }
}

export function createIdentity(): Identity {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const id = publicKey.export({ format: 'jwk' }).x as string;
  const der = privateKey.export({ format: 'der', type: 'pkcs8' });
  // Linux without a keyring has no encryption; the file is then only protected by the profile folder.
  const encrypted = safeStorage.isEncryptionAvailable();
  const key = encrypted
    ? safeStorage.encryptString(der.toString('base64')).toString('base64')
    : der.toString('base64');
  const file: IdentityFile = { v: 1, id, key, encrypted };
  const target = filePath();
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(`${target}.tmp`, JSON.stringify(file), { encoding: 'utf8', mode: 0o600 });
  renameSync(`${target}.tmp`, target);
  return wrap(id, privateKey);
}

export function deleteIdentity(): void {
  rmSync(filePath(), { force: true });
}
