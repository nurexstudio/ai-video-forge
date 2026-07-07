// ─── src/convex/lib/crypto.ts ────────────────────────────────────────────────
// AES-256-GCM symmetric encryption helpers using the Web Crypto API.
// Works in Convex's V8 runtime without "use node" — no Node.js crypto needed.

const IV_LEN = 12; // GCM standard IV length (96 bits)

async function getMasterKey(): Promise<CryptoKey> {
  const raw = process.env.CLIPFORGE_MASTER_KEY;
  let keyBytes: Uint8Array;

  if (raw && raw.length === 64) {
    keyBytes = new Uint8Array(
      (raw.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)),
    );
  } else {
    // Derive a stable 32-byte key from the deploy key or a fallback constant.
    // For production, set CLIPFORGE_MASTER_KEY to a 64-char hex string.
    const fallback =
      process.env.CONVEX_DEPLOY_KEY || "clipforge-nurex-studio-fallback-key";
    const encoded = new TextEncoder().encode(fallback);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", encoded);
    keyBytes = new Uint8Array(hashBuffer);
  }

  return globalThis.crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypts plaintext → base64 string in form: base64(IV || CIPHERTEXT+TAG).
 * Web Crypto appends the 16-byte auth tag at the end of the ciphertext.
 */
export async function encryptString(plaintext: string): Promise<string> {
  const key = await getMasterKey();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LEN));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherWithTag = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    encoded,
  );
  const combined = new Uint8Array(IV_LEN + cipherWithTag.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipherWithTag), IV_LEN);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts a base64 string produced by encryptString back to plaintext.
 * Throws on auth tag mismatch (tampering detection).
 */
export async function decryptString(encoded: string): Promise<string> {
  const key = await getMasterKey();
  const combined = new Uint8Array(
    atob(encoded)
      .split("")
      .map((c) => c.charCodeAt(0)),
  );
  if (combined.length < IV_LEN + 16) throw new Error("Ciphertext too short");
  const iv = combined.slice(0, IV_LEN);
  const cipherWithTag = combined.slice(IV_LEN);
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    cipherWithTag,
  );
  return new TextDecoder().decode(decrypted);
}
