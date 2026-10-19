/**
 * Pieces shared by the hub and the party core. The cores are plain
 * TypeScript without Cloudflare types, so they run in Vitest (Node) as well
 * as in the Worker; `index.ts` wires them to Durable Objects.
 */

/** One WebSocket as the cores see it. */
export interface Conn {
  send(text: string): void;
  close(code: number, reason: string): void;
}

export interface CoreDeps {
  /** Checks an Ed25519 signature; `userId` is the raw public key as base64url. */
  verify(userId: string, payload: string, sig: string): Promise<boolean>;
  now(): number;
  randomBytes(length: number): Uint8Array;
}

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Ed25519 via WebCrypto; available in Workers and in Node. */
export async function verifyEd25519(
  userId: string,
  payload: string,
  sig: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      fromBase64url(userId),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      fromBase64url(sig),
      new TextEncoder().encode(payload),
    );
  } catch {
    return false;
  }
}

export const defaultDeps: CoreDeps = {
  verify: verifyEd25519,
  now: () => Date.now(),
  randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
};

/** Close codes Pegel understands; ≥ 4100 means "do not reconnect". */
export const CLOSE_RETRY = 4000;
export const CLOSE_FINAL = 4100;

/** Simple per-connection message budget against floods. */
export class RateLimit {
  private windowStart = 0;
  private count = 0;

  constructor(
    private readonly perSecond: number,
    private readonly now: () => number,
  ) {}

  /** False once the budget of the current second is used up. */
  take(): boolean {
    const t = this.now();
    if (t - this.windowStart >= 1000) {
      this.windowStart = t;
      this.count = 0;
    }
    this.count++;
    return this.count <= this.perSecond;
  }
}
