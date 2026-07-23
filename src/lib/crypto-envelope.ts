import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = 1;

export interface EncryptedEnvelope {
  version: 1;
  encryptedDataKey: string;
  dataKeyIv: string;
  dataKeyTag: string;
  ciphertext: string;
  payloadIv: string;
  payloadTag: string;
}

function decodeMasterKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");

  if (key.byteLength !== 32) {
    throw new Error("ENVELOPE_MASTER_KEY must be a base64-encoded 32-byte key");
  }

  return key;
}

function encryptBytes(plaintext: Buffer, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    ciphertext,
    iv,
    tag: cipher.getAuthTag(),
  };
}

function decryptBytes(
  ciphertext: Buffer,
  key: Buffer,
  iv: Buffer,
  tag: Buffer,
) {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptCredentialPayload(
  payload: Record<string, unknown>,
  encodedMasterKey: string,
): EncryptedEnvelope {
  const masterKey = decodeMasterKey(encodedMasterKey);
  const dataKey = randomBytes(32);
  const encryptedPayload = encryptBytes(
    Buffer.from(JSON.stringify(payload), "utf8"),
    dataKey,
  );
  const wrappedDataKey = encryptBytes(dataKey, masterKey);

  return {
    version: VERSION,
    encryptedDataKey: wrappedDataKey.ciphertext.toString("base64"),
    dataKeyIv: wrappedDataKey.iv.toString("base64"),
    dataKeyTag: wrappedDataKey.tag.toString("base64"),
    ciphertext: encryptedPayload.ciphertext.toString("base64"),
    payloadIv: encryptedPayload.iv.toString("base64"),
    payloadTag: encryptedPayload.tag.toString("base64"),
  };
}

export function decryptCredentialPayload(
  envelope: EncryptedEnvelope,
  encodedMasterKey: string,
): Record<string, unknown> {
  if (envelope.version !== VERSION) {
    throw new Error(`Unsupported credential envelope version: ${envelope.version}`);
  }

  const masterKey = decodeMasterKey(encodedMasterKey);
  const dataKey = decryptBytes(
    Buffer.from(envelope.encryptedDataKey, "base64"),
    masterKey,
    Buffer.from(envelope.dataKeyIv, "base64"),
    Buffer.from(envelope.dataKeyTag, "base64"),
  );
  const plaintext = decryptBytes(
    Buffer.from(envelope.ciphertext, "base64"),
    dataKey,
    Buffer.from(envelope.payloadIv, "base64"),
    Buffer.from(envelope.payloadTag, "base64"),
  );

  return JSON.parse(plaintext.toString("utf8")) as Record<string, unknown>;
}
