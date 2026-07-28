import { createHash } from "node:crypto";

import { LabError } from "./errors.mjs";

export const CANONICAL_EVENT_FIELDS = Object.freeze([
  "sessionId",
  "kind",
  "nodeId",
  "sourceId",
  "evidenceCode",
  "occurredAt",
]);
const EVENT_KEYS = Object.freeze([
  "evidenceCode",
  "kind",
  "nodeId",
  "occurredAt",
  "sessionId",
  "sourceId",
]);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;
const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function eventRouteKey({
  kind,
  nodeId,
  sourceId,
  evidenceCode,
}) {
  return `${kind}\u0000${nodeId}\u0000${sourceId}\u0000${evidenceCode}`;
}

export function buildEventRouteIndex(world) {
  return new Map(
    world.eventRoutes.map((route) => [eventRouteKey(route), route]),
  );
}

function assertPlainObject(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new LabError("invalid_event", "教材イベントはobjectで指定します。");
  }
}

function assertExactKeys(event) {
  const keys = Object.keys(event).sort();
  if (
    keys.length !== EVENT_KEYS.length ||
    keys.some((key, index) => key !== EVENT_KEYS[index])
  ) {
    throw new LabError(
      "invalid_event_fields",
      "教材イベントに許可されていない項目があります。",
    );
  }
}

function assertIdentifier(value, field) {
  if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value)) {
    throw new LabError(
      "invalid_event",
      `${field}は許可済み識別子で指定します。`,
    );
  }
}

function assertTimestamp(value) {
  if (
    typeof value !== "string" ||
    value.length > 32 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new LabError(
      "invalid_event",
      "occurredAtはUTCのISO 8601日時で指定します。",
    );
  }
}

export function validateEvent(input, { world, sessionId, routeIndex }) {
  assertPlainObject(input);
  assertExactKeys(input);

  if (
    typeof input.sessionId !== "string" ||
    !SAFE_SESSION_ID.test(input.sessionId) ||
    input.sessionId !== sessionId
  ) {
    throw new LabError(
      "session_mismatch",
      "このセッションの教材イベントではありません。",
      409,
    );
  }

  assertIdentifier(input.kind, "kind");
  assertIdentifier(input.nodeId, "nodeId");
  assertIdentifier(input.sourceId, "sourceId");
  assertIdentifier(input.evidenceCode, "evidenceCode");
  assertTimestamp(input.occurredAt);

  const normalized = Object.freeze({
    sessionId: input.sessionId,
    kind: input.kind,
    nodeId: input.nodeId,
    sourceId: input.sourceId,
    evidenceCode: input.evidenceCode,
    occurredAt: new Date(input.occurredAt).toISOString(),
  });
  const route =
    (routeIndex ?? buildEventRouteIndex(world)).get(
      eventRouteKey(normalized),
    ) ?? null;
  if (!route) {
    throw new LabError(
      "event_not_allowlisted",
      "この送信元と教材イベントの組み合わせは許可されていません。",
      403,
    );
  }

  const fingerprint = createHash("sha256")
    .update(JSON.stringify(normalized), "utf8")
    .digest("hex");
  return { event: normalized, route, fingerprint };
}
