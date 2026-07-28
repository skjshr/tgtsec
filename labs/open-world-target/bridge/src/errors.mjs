const SECRET_ASSIGNMENT =
  /(\b(?:token|secret|password|credential|authorization|authTag)\b\s*[:=]\s*)[^\s,;]+/gi;
const BEARER_VALUE = /\bBearer\s+[^\s,;]+/gi;
const URL_CREDENTIALS = /(https?:\/\/)[^/\s:@]+:[^@\s/]+@/gi;
const FLAG_VALUE = /\b(?:FLAG|LAB)\{[^}\r\n]{0,512}\}/gi;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class BridgeError extends Error {
  constructor(code, message, { retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = "BridgeError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function redactText(value, secrets = []) {
  let text =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : "unexpected bridge failure";

  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length < 4) continue;
    text = text.replace(
      new RegExp(escapeRegExp(secret), "g"),
      "[REDACTED]",
    );
  }

  return text
    .replace(URL_CREDENTIALS, "$1[REDACTED]@")
    .replace(BEARER_VALUE, "Bearer [REDACTED]")
    .replace(SECRET_ASSIGNMENT, "$1[REDACTED]")
    .replace(FLAG_VALUE, "[REDACTED_FLAG]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 500);
}

export function writeSafeError(
  writer,
  code,
  error,
  { secrets = [] } = {},
) {
  const safeCode =
    typeof code === "string" && /^[a-z0-9_.-]{1,64}$/.test(code)
      ? code
      : "bridge_failure";
  writer(
    `bridge_error code=${safeCode} detail=${redactText(error, secrets)}\n`,
  );
}
