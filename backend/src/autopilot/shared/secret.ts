import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from './env.js';

/**
 * Keeping other people's mailbox passwords out of the database in readable form.
 *
 * Each person hands over a Gmail app password so their own job alerts can be read.
 * That is their secret, not ours, so it is encrypted with the key in .env and stored
 * as one string: the starting value, the seal, and the ciphertext.
 */

const key = Buffer.from((env.ENCRYPTION_KEY ?? '').padEnd(32, '0').slice(0, 32), 'utf8');

export function lock(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const out = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${out.toString('base64')}`;
}

export function unlock(sealed: string | null): string | null {
  if (!sealed) return null;
  const [iv, tag, body] = sealed.split('.');
  if (!iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;        // a key that has changed, or a tampered value: treat as absent
  }
}
