/**
 * Address of the friends & party relay (`server/`, Cloudflare Worker).
 * `PEGEL_SOCIAL_URL` overrides it, e.g. `ws://127.0.0.1:8787` for `npm run dev` in `server/`.
 */
export const SOCIAL_SERVER_URL =
  process.env['PEGEL_SOCIAL_URL'] ?? 'wss://pegel-social.johann-mertens-98.workers.dev';
