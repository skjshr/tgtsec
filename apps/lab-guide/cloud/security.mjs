import {
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from "node:crypto";

import { CloudError, fail } from "./errors.mjs";

export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COOKIE_VERSION = "v1";

function digest(value) {
  return createHash("sha256").update(String(value), "utf8").digest();
}

export function constantTimeEqual(left, right) {
  return timingSafeEqual(digest(left), digest(right));
}

export function hashSecret(value) {
  return digest(value).toString("base64url");
}

export function opaqueToken(size = 32, randomBytes = nodeRandomBytes) {
  return Buffer.from(randomBytes(size)).toString("base64url");
}

export function shortPairingCode(randomBytes = nodeRandomBytes) {
  const entropy = Buffer.from(randomBytes(6));
  if (entropy.length !== 6) {
    throw new Error("randomBytes must return the requested byte count");
  }
  return Array.from(entropy, (byte) => PAIRING_ALPHABET[byte & 31]).join("");
}

export function pairingLookupKey(code, secret) {
  return createHmac("sha256", secret)
    .update(`pair:${code}`, "utf8")
    .digest("base64url");
}

function cookieSignature(payload, secret) {
  return createHmac("sha256", secret)
    .update(`${COOKIE_VERSION}.${payload}`, "utf8")
    .digest("base64url");
}

export function signSessionCookie({ sessionId, expiresAtMs }, secret) {
  if (!SAFE_ID.test(sessionId) || !Number.isSafeInteger(expiresAtMs)) {
    throw new Error("invalid session cookie payload");
  }
  const payload = Buffer.from(
    JSON.stringify({ s: sessionId, e: expiresAtMs }),
    "utf8",
  ).toString("base64url");
  return `${COOKIE_VERSION}.${payload}.${cookieSignature(payload, secret)}`;
}

export function verifySessionCookie(value, secret, nowMs) {
  if (typeof value !== "string" || value.length > 1024) {
    fail(401, "invalid_session", "接続情報を確認できません。");
  }
  const pieces = value.split(".");
  if (
    pieces.length !== 3 ||
    pieces[0] !== COOKIE_VERSION ||
    !constantTimeEqual(pieces[2], cookieSignature(pieces[1], secret))
  ) {
    fail(401, "invalid_session", "接続情報を確認できません。");
  }

  let decoded;
  try {
    const buffer = Buffer.from(pieces[1], "base64url");
    if (buffer.toString("base64url") !== pieces[1]) throw new Error("encoding");
    decoded = JSON.parse(buffer.toString("utf8"));
  } catch {
    fail(401, "invalid_session", "接続情報を確認できません。");
  }
  if (
    decoded === null ||
    typeof decoded !== "object" ||
    Array.isArray(decoded) ||
    Object.keys(decoded).sort().join(",") !== "e,s" ||
    typeof decoded.s !== "string" ||
    !SAFE_ID.test(decoded.s) ||
    !Number.isSafeInteger(decoded.e)
  ) {
    fail(401, "invalid_session", "接続情報を確認できません。");
  }
  if (decoded.e <= nowMs) {
    fail(410, "session_expired", "この接続は期限切れです。");
  }
  return { sessionId: decoded.s, expiresAtMs: decoded.e };
}

export function assertSecret(actual, expected, code = "unauthorized") {
  if (
    typeof actual !== "string" ||
    typeof expected !== "string" ||
    expected.length < 32 ||
    !constantTimeEqual(actual, expected)
  ) {
    throw new CloudError(401, code, "認証できません。");
  }
}

export function assertSafeId(value, label = "id") {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail(400, "invalid_request", "リクエストが不正です。", `${label} is invalid`);
  }
  return value;
}

export function validateOrigin(value, label = "origin") {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP origin`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must be an absolute HTTP origin`);
  }
  return url.origin;
}
