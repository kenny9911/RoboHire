import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ATS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ATS_ENCRYPTION_KEY environment variable is required for ATS integrations');
  }
  // Accept hex-encoded 32-byte key or derive from passphrase
  if (/^[0-9a-f]{64}$/i.test(key)) {
    return Buffer.from(key, 'hex');
  }
  return crypto.scryptSync(key, 'robohire-ats-salt', 32);
}

export function encryptCredentials(data: Record<string, unknown>): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: base64(iv + authTag + ciphertext)
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptCredentials(encoded: string): Record<string, unknown> {
  const key = getEncryptionKey();
  const buf = Buffer.from(encoded, 'base64');

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}
