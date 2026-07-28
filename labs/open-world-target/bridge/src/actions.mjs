import { BridgeError } from "./errors.mjs";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const ACTION_TYPES = new Set(["selectHypothesis", "unlockHint"]);

function exactKeys(value, expected, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new BridgeError("invalid_action", `${label} must be an object`);
  }
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    keys.length !== wanted.length ||
    keys.some((key, index) => key !== wanted[index])
  ) {
    throw new BridgeError(
      "invalid_action",
      `${label} contains unsupported fields`,
    );
  }
}

export function validateAction(value) {
  exactKeys(
    value,
    ["id", "type", "targetId", "createdAt"],
    "cloud action",
  );
  if (typeof value.id !== "string" || !SAFE_ID.test(value.id)) {
    throw new BridgeError("invalid_action", "cloud action id is invalid");
  }
  if (!ACTION_TYPES.has(value.type)) {
    throw new BridgeError("invalid_action", "cloud action type is not allowed");
  }
  if (typeof value.targetId !== "string" || !SAFE_ID.test(value.targetId)) {
    throw new BridgeError(
      "invalid_action",
      "cloud action targetId is invalid",
    );
  }
  if (
    typeof value.createdAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
      value.createdAt,
    ) ||
    Number.isNaN(Date.parse(value.createdAt))
  ) {
    throw new BridgeError(
      "invalid_action",
      "cloud action createdAt is invalid",
    );
  }
  return Object.freeze({
    id: value.id,
    type: value.type,
    targetId: value.targetId,
    createdAt: value.createdAt,
  });
}

export function targetPathForAction(action) {
  const validated = validateAction(action);
  const encoded = encodeURIComponent(validated.targetId);
  if (validated.type === "selectHypothesis") {
    return `/api/session/hypotheses/${encoded}/select`;
  }
  if (validated.type === "unlockHint") {
    return `/api/session/hints/${encoded}/unlock`;
  }
  throw new BridgeError("invalid_action", "cloud action type is not allowed");
}

export { ACTION_TYPES };
