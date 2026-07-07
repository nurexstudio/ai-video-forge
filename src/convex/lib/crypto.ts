// ─── src/convex/lib/crypto.ts ────────────────────────────────────────────────
// AES-256-GCM symmetric encryption helpers. Used by providers.ts to encrypt
// user API keys before persisting them to the database.
//
// IMPORTANT: requires "use node" directive so node:crypto is available.

"use node";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;       // GCM standard IV length (96 bits)
const TAG_LEN = 16;      // GCM auth tag length (128 bits)

/**
 * Derive a 32-byte master key from environment.
 *
 * Production: set CLIPFORGE_MASTER_KEY to a 64-character hex string
 * (32 bytes when decoded). It must be the same across deploys so previously
 * encrypted values stay decryptable.
 *
 * Fallback: hash a stable secret + app name. This is NOT secure — for
 * production deployments set CLIPFORGE_MASTER_KEY explicitly.
 */
function getMasterKey(): Buffer {
  const raw = process.env.CLIPFORGE_MASTER_KEY;
  if (raw && raw.length === 64) {
    return Buffer.from(raw, "hex");
  }
  const fallback = process.env.CONVEX_DEPLOY_KEY || "clipforge-nurex-studio-fallback-key";
  return createHash("sha256").update(fallback).digest();
}

/**
 * Encrypts plaintext → base64 string in form: base64(IV || TAG || CIPHERTEXT).
 * Each call uses a fresh random IV, so two encryptions of the same plaintext
 * produce different ciphertext (semantic security).
 */
export function encryptString(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * Decrypts a base64 string produced by encryptString back to plaintext.
 * Throws on auth tag mismatch (tampering detection).
 */
export function decryptString(encoded: string): string {
  const key = getMasterKey();
  const buf = Buffer.from(encoded, "base64");
  if (buf.length < IV_LEN + TAG_LEN) throw new Error("Ciphertext too short");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
