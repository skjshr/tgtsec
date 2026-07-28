import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";

import { CANONICAL_EVENT_FIELDS } from "./event-validator.mjs";
import { LabError } from "./errors.mjs";

export const EVENT_SOURCE_SCOPES = Object.freeze({
  "apache2.service": "low",
  "smbd.service": "low",
  "ssh.service": "root",
  "nfs-server.service": "root",
  "open-world-file-watch.service": "root",
});

export const DEFAULT_EVENT_KEY_PATHS = Object.freeze({
  low: "/etc/examserver-open-world/event-keys/low.key",
  root: "/etc/examserver-open-world/event-keys/root.key",
});

const WIRE_FIELDS = Object.freeze(
  [...CANONICAL_EVENT_FIELDS, "authTag"].sort(),
);

function keyBuffer(value, scope) {
  const buffer = Buffer.isBuffer(value)
    ? value
    : typeof value === "string"
      ? Buffer.from(value, "utf8")
      : null;
  if (!buffer || buffer.length < 32 || buffer.length > 512) {
    throw new Error(`${scope} event key must contain 32-512 bytes`);
  }
  return buffer;
}

function hasExactWireFields(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    return false;
  }
  const keys = Object.keys(value).sort();
  return (
    keys.length === WIRE_FIELDS.length &&
    keys.every((key, index) => key === WIRE_FIELDS[index])
  );
}

export function sourceScope(sourceId) {
  return EVENT_SOURCE_SCOPES[sourceId] ?? null;
}

export function canonicalEventPayload(event) {
  const canonical = {};
  for (const field of CANONICAL_EVENT_FIELDS) {
    const value = event?.[field];
    if (typeof value !== "string") {
      throw new Error(`event field ${field} must be a string`);
    }
    canonical[field] = value;
  }
  return JSON.stringify(canonical);
}

export function signEvent(event, key) {
  const scope = sourceScope(event?.sourceId);
  if (!scope) throw new Error("event source has no authentication scope");
  return createHmac("sha256", keyBuffer(key, scope))
    .update(canonicalEventPayload(event), "utf8")
    .digest("hex");
}

export function authenticateWireEvent(input, keys) {
  if (!hasExactWireFields(input)) {
    throw new LabError(
      "event_auth_failed",
      "教材イベントを認証できませんでした。",
      403,
    );
  }
  const scope = sourceScope(input.sourceId);
  const suppliedTag =
    typeof input.authTag === "string" && /^[a-f0-9]{64}$/.test(input.authTag)
      ? Buffer.from(input.authTag, "hex")
      : null;
  if (!scope || !suppliedTag) {
    throw new LabError(
      "event_auth_failed",
      "教材イベントを認証できませんでした。",
      403,
    );
  }

  const event = Object.freeze(
    Object.fromEntries(
      CANONICAL_EVENT_FIELDS.map((field) => [field, input[field]]),
    ),
  );
  let expectedTag;
  try {
    expectedTag = Buffer.from(signEvent(event, keys?.[scope]), "hex");
  } catch {
    throw new LabError(
      "event_auth_failed",
      "教材イベントを認証できませんでした。",
      403,
    );
  }
  if (
    suppliedTag.length !== expectedTag.length ||
    !timingSafeEqual(suppliedTag, expectedTag)
  ) {
    throw new LabError(
      "event_auth_failed",
      "教材イベントを認証できませんでした。",
      403,
    );
  }
  return event;
}

async function readEventKey(filePath, scope) {
  const contents = await readFile(filePath);
  const trimmed = Buffer.from(contents.toString("utf8").trim(), "utf8");
  return keyBuffer(trimmed, scope);
}

export async function loadEventKeys({
  lowPath = DEFAULT_EVENT_KEY_PATHS.low,
  rootPath = DEFAULT_EVENT_KEY_PATHS.root,
} = {}) {
  const [low, root] = await Promise.all([
    readEventKey(lowPath, "low"),
    readEventKey(rootPath, "root"),
  ]);
  return Object.freeze({ low, root });
}
