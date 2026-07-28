import { BridgeError } from "./errors.mjs";

const DEFAULT_TARGET_ORIGIN = "http://10.13.37.10:8787";
const DEFAULTS = Object.freeze({
  actionPollMs: 1_000,
  heartbeatMs: 10_000,
  requestTimeoutMs: 5_000,
  sseIdleTimeoutMs: 25_000,
  reconnectBaseMs: 500,
  reconnectMaxMs: 30_000,
});

function parseInteger(name, value, fallback, minimum, maximum) {
  const parsed = value === undefined ? fallback : Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new BridgeError(
      "invalid_config",
      `${name} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return parsed;
}

function isLoopback(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function parseOrigin(
  name,
  value,
  { defaultValue, cloud = false, target = false } = {},
) {
  const candidate = value ?? defaultValue;
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new BridgeError("invalid_config", `${name} is required`);
  }

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new BridgeError("invalid_config", `${name} must be an absolute URL`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new BridgeError("invalid_config", `${name} must use HTTP or HTTPS`);
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  ) {
    throw new BridgeError(
      "invalid_config",
      `${name} must be an origin without credentials, path, query, or fragment`,
    );
  }
  if (cloud && url.protocol !== "https:" && !isLoopback(url.hostname)) {
    throw new BridgeError(
      "invalid_config",
      `${name} must use HTTPS outside loopback development`,
    );
  }
  if (
    target &&
    url.hostname !== "10.13.37.10" &&
    !isLoopback(url.hostname)
  ) {
    throw new BridgeError(
      "invalid_config",
      `${name} must use the direct target address or loopback`,
    );
  }
  return url.origin;
}

function parseSecret(name, value) {
  if (
    typeof value !== "string" ||
    value.length < 32 ||
    value.length > 512 ||
    /[\s\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new BridgeError(
      "invalid_config",
      `${name} must contain 32-512 visible non-whitespace characters`,
    );
  }
  return value;
}

export function loadConfig(environment = process.env) {
  return Object.freeze({
    targetOrigin: parseOrigin(
      "BRIDGE_TARGET_ORIGIN",
      environment.BRIDGE_TARGET_ORIGIN,
      { defaultValue: DEFAULT_TARGET_ORIGIN, target: true },
    ),
    cloudOrigin: parseOrigin(
      "BRIDGE_CLOUD_ORIGIN",
      environment.BRIDGE_CLOUD_ORIGIN,
      { cloud: true },
    ),
    deploymentToken: parseSecret(
      "BRIDGE_DEPLOYMENT_TOKEN",
      environment.BRIDGE_DEPLOYMENT_TOKEN,
    ),
    targetToken: parseSecret(
      "BRIDGE_TARGET_TOKEN",
      environment.BRIDGE_TARGET_TOKEN,
    ),
    actionPollMs: parseInteger(
      "BRIDGE_ACTION_POLL_MS",
      environment.BRIDGE_ACTION_POLL_MS,
      DEFAULTS.actionPollMs,
      250,
      10_000,
    ),
    heartbeatMs: parseInteger(
      "BRIDGE_HEARTBEAT_MS",
      environment.BRIDGE_HEARTBEAT_MS,
      DEFAULTS.heartbeatMs,
      5_000,
      60_000,
    ),
    requestTimeoutMs: parseInteger(
      "BRIDGE_REQUEST_TIMEOUT_MS",
      environment.BRIDGE_REQUEST_TIMEOUT_MS,
      DEFAULTS.requestTimeoutMs,
      500,
      30_000,
    ),
    sseIdleTimeoutMs: parseInteger(
      "BRIDGE_SSE_IDLE_TIMEOUT_MS",
      environment.BRIDGE_SSE_IDLE_TIMEOUT_MS,
      DEFAULTS.sseIdleTimeoutMs,
      5_000,
      60_000,
    ),
    reconnectBaseMs: parseInteger(
      "BRIDGE_RECONNECT_BASE_MS",
      environment.BRIDGE_RECONNECT_BASE_MS,
      DEFAULTS.reconnectBaseMs,
      100,
      5_000,
    ),
    reconnectMaxMs: parseInteger(
      "BRIDGE_RECONNECT_MAX_MS",
      environment.BRIDGE_RECONNECT_MAX_MS,
      DEFAULTS.reconnectMaxMs,
      1_000,
      60_000,
    ),
  });
}

export { DEFAULT_TARGET_ORIGIN };
