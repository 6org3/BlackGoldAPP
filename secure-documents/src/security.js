import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(["consentimiento", "identidad", "medico", "financiero", "contrato", "otro"]);
const MIMES = new Set(["application/pdf", "image/jpeg", "image/png", "application/octet-stream"]);

export function decodeMasterKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("master_key_invalid");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("master_key_invalid");
  return key;
}

export function encryptEnvelope(plain, masterKey, documentId) {
  if (!Buffer.isBuffer(plain) || plain.length === 0) throw new Error("content_invalid");
  if (!UUID_RE.test(documentId)) throw new Error("document_id_invalid");
  const dek = randomBytes(32);
  const payloadIv = randomBytes(12);
  const payloadCipher = createCipheriv("aes-256-gcm", dek, payloadIv);
  payloadCipher.setAAD(Buffer.from(documentId, "utf8"));
  const ciphertext = Buffer.concat([payloadCipher.update(plain), payloadCipher.final(), payloadCipher.getAuthTag()]);

  const wrapIv = randomBytes(12);
  const wrapCipher = createCipheriv("aes-256-gcm", masterKey, wrapIv);
  wrapCipher.setAAD(Buffer.from(`dek:${documentId}`, "utf8"));
  const encryptedDek = Buffer.concat([wrapCipher.update(dek), wrapCipher.final(), wrapCipher.getAuthTag()]);
  dek.fill(0);

  return {
    ciphertext,
    encryptedDek,
    payloadIv,
    wrapIv,
    contentSha256: createHash("sha256").update(plain).digest("hex"),
  };
}

export function decryptEnvelope(record, ciphertext, masterKey) {
  const decodeDbBytes = (value) => typeof value === "string" && value.startsWith("\\x")
    ? Buffer.from(value.slice(2), "hex")
    : Buffer.from(value, "base64");
  const encryptedDek = decodeDbBytes(record.encrypted_dek);
  const wrapIv = decodeDbBytes(record.wrap_iv);
  const wrapTag = encryptedDek.subarray(encryptedDek.length - 16);
  const unwrap = createDecipheriv("aes-256-gcm", masterKey, wrapIv);
  unwrap.setAAD(Buffer.from(`dek:${record.id}`, "utf8"));
  unwrap.setAuthTag(wrapTag);
  const dek = Buffer.concat([unwrap.update(encryptedDek.subarray(0, -16)), unwrap.final()]);

  try {
    const payloadIv = decodeDbBytes(record.payload_iv);
    const payloadTag = ciphertext.subarray(ciphertext.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", dek, payloadIv);
    decipher.setAAD(Buffer.from(record.id, "utf8"));
    decipher.setAuthTag(payloadTag);
    const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
    const actual = createHash("sha256").update(plain).digest();
    const expected = Buffer.from(record.content_sha256, "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("integrity_failed");
    return plain;
  } finally {
    dek.fill(0);
  }
}

export function validateUpload(body, actor) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "body_invalid" };
  if (!UUID_RE.test(body.contact_id ?? "")) return { error: "contact_id_invalid" };
  if (!TYPES.has(body.document_type)) return { error: "document_type_invalid" };
  if (!MIMES.has(body.mime_type)) return { error: "mime_type_invalid" };
  if (typeof body.purpose !== "string" || body.purpose.trim().length < 3 || body.purpose.length > 240) return { error: "purpose_invalid" };
  if (body.retention_until != null && !/^\d{4}-\d{2}-\d{2}$/.test(body.retention_until)) return { error: "retention_invalid" };
  if (typeof body.content_base64 !== "string" || body.content_base64.length < 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.content_base64)) return { error: "content_invalid" };
  const content = Buffer.from(body.content_base64, "base64");
  if (content.length === 0 || content.length > 10 * 1024 * 1024) return { error: "content_size_invalid" };
  if (actor === "lilith" && body.document_type === "financiero") return { error: "role_denied" };
  if (actor === "pythagoras" && body.document_type !== "financiero") return { error: "role_denied" };
  const magicValid = body.mime_type === "application/octet-stream"
    || (body.mime_type === "application/pdf" && content.subarray(0, 5).toString("ascii") === "%PDF-")
    || (body.mime_type === "image/png" && content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (body.mime_type === "image/jpeg" && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff);
  if (!magicValid) return { error: "content_type_mismatch" };
  return { data: { ...body, purpose: body.purpose.trim(), content } };
}

export function canRead(actor, record) {
  if (actor === "vegapunk") return true;
  return actor === "pythagoras" && record?.document_type === "financiero";
}

export function parseTokens(value) {
  const parsed = JSON.parse(value ?? "{}");
  const result = new Map();
  for (const [actor, token] of Object.entries(parsed)) {
    if (!["vegapunk", "lilith", "pythagoras"].includes(actor) || typeof token !== "string" || token.length < 32) {
      throw new Error("tokens_invalid");
    }
    result.set(token, actor);
  }
  return result;
}
