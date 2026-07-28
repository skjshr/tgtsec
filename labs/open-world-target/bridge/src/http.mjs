import { validateAction } from "./actions.mjs";
import { BridgeError } from "./errors.mjs";
import {
  MAX_PROJECTION_BYTES,
  validateProjection,
} from "./projection.mjs";
import {
  MAX_CONTROL_BYTES,
  fetchHeaders,
  requestJson,
} from "./request.mjs";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function joinedUrl(origin, path) {
  return new URL(path, `${origin}/`).toString();
}

function exactObject(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new BridgeError("invalid_response", `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new BridgeError(
      "invalid_response",
      `${label} contains unexpected fields`,
    );
  }
  return value;
}

function safeId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new BridgeError("invalid_response", `${label} is invalid`);
  }
  return value;
}

function bearer(token) {
  return `Bearer ${token}`;
}

function isLoopback(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function validateFixedActionPath(path) {
  const match =
    typeof path === "string"
      ? path.match(
          /^\/api\/session\/(hypotheses|hints)\/([A-Za-z0-9_.%~-]+)\/(select|unlock)$/,
        )
      : null;
  if (!match) return false;
  let targetId;
  try {
    targetId = decodeURIComponent(match[2]);
  } catch {
    return false;
  }
  if (!SAFE_ID.test(targetId) || encodeURIComponent(targetId) !== match[2]) {
    return false;
  }
  return (
    (match[1] === "hypotheses" && match[3] === "select") ||
    (match[1] === "hints" && match[3] === "unlock")
  );
}

export class TargetClient {
  #targetToken;

  constructor({
    origin,
    targetToken,
    requestTimeoutMs,
    fetchImpl = globalThis.fetch,
  }) {
    this.origin = origin;
    this.#targetToken = targetToken;
    this.requestTimeoutMs = requestTimeoutMs;
    this.fetchImpl = fetchImpl;
  }

  get secrets() {
    return [this.#targetToken];
  }

  getState({ signal } = {}) {
    return requestJson(
      this.fetchImpl,
      joinedUrl(this.origin, "/api/session/state"),
      {
        headers: {
          authorization: bearer(this.#targetToken),
        },
        signal,
        timeoutMs: this.requestTimeoutMs,
        maximumBytes: MAX_PROJECTION_BYTES,
      },
    );
  }

  async openEvents({ lastEventId, signal } = {}) {
    const response = await fetchHeaders(
      this.fetchImpl,
      joinedUrl(this.origin, "/api/session/events"),
      {
        headers: {
          accept: "text/event-stream",
          authorization: bearer(this.#targetToken),
          ...(lastEventId === undefined || lastEventId === null
            ? {}
            : { "last-event-id": String(lastEventId) }),
        },
        signal,
        timeoutMs: this.requestTimeoutMs,
      },
    );
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new BridgeError(
        "target_sse_status",
        `target SSE returned status ${response.status}`,
        { retryable: true },
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("text/event-stream")) {
      await response.body?.cancel();
      throw new BridgeError(
        "target_sse_content_type",
        "target SSE did not return text/event-stream",
      );
    }
    return response;
  }

  applyAction(path, { signal } = {}) {
    if (!validateFixedActionPath(path)) {
      throw new BridgeError("invalid_action_path", "target action path is not fixed");
    }
    return requestJson(this.fetchImpl, joinedUrl(this.origin, path), {
      method: "POST",
      headers: {
        authorization: bearer(this.#targetToken),
      },
      body: {},
      signal,
      timeoutMs: this.requestTimeoutMs,
      maximumBytes: MAX_PROJECTION_BYTES,
    });
  }
}

export class CloudClient {
  #session = null;
  #deploymentToken;

  constructor({
    origin,
    deploymentToken,
    requestTimeoutMs,
    fetchImpl = globalThis.fetch,
  }) {
    this.origin = origin;
    this.#deploymentToken = deploymentToken;
    this.requestTimeoutMs = requestTimeoutMs;
    this.fetchImpl = fetchImpl;
  }

  get sessionId() {
    return this.#session?.sessionId ?? null;
  }

  get secrets() {
    return [
      this.#deploymentToken,
      ...(this.#session ? [this.#session.uploadToken] : []),
    ];
  }

  async createSession(targetSessionId, { signal } = {}) {
    safeId(targetSessionId, "targetSessionId");
    const value = exactObject(
      await requestJson(
        this.fetchImpl,
        joinedUrl(this.origin, "/api/lab/bridge/session"),
        {
          method: "POST",
          headers: {
            authorization: bearer(this.#deploymentToken),
          },
          body: { targetSessionId },
          signal,
          timeoutMs: this.requestTimeoutMs,
        },
      ),
      [
        "sessionId",
        "pairingCode",
        "uploadToken",
        "viewerUrl",
        "expiresAt",
      ],
      "cloud session response",
    );
    const sessionId = safeId(value.sessionId, "cloud sessionId");
    if (
      typeof value.pairingCode !== "string" ||
      !/^[A-Z2-9]{6}$/.test(value.pairingCode)
    ) {
      throw new BridgeError(
        "invalid_response",
        "cloud pairingCode is invalid",
      );
    }
    if (
      typeof value.uploadToken !== "string" ||
      value.uploadToken.length < 32 ||
      value.uploadToken.length > 512 ||
      /\s/.test(value.uploadToken)
    ) {
      throw new BridgeError(
        "invalid_response",
        "cloud uploadToken is invalid",
      );
    }
    let viewerUrl;
    try {
      viewerUrl = new URL(value.viewerUrl);
    } catch {
      throw new BridgeError("invalid_response", "cloud viewerUrl is invalid");
    }
    if (
      !["http:", "https:"].includes(viewerUrl.protocol) ||
      viewerUrl.username ||
      viewerUrl.password ||
      (viewerUrl.protocol !== "https:" && !isLoopback(viewerUrl.hostname))
    ) {
      throw new BridgeError("invalid_response", "cloud viewerUrl is invalid");
    }
    if (
      typeof value.expiresAt !== "string" ||
      Number.isNaN(Date.parse(value.expiresAt))
    ) {
      throw new BridgeError("invalid_response", "cloud expiresAt is invalid");
    }
    this.#session = Object.freeze({
      sessionId,
      uploadToken: value.uploadToken,
    });
    return Object.freeze({
      sessionId,
      pairingCode: value.pairingCode,
      viewerUrl: viewerUrl.toString(),
      expiresAt: value.expiresAt,
    });
  }

  #sessionHeaders() {
    if (!this.#session) {
      throw new BridgeError("session_missing", "cloud session is not created");
    }
    return {
      authorization: bearer(this.#session.uploadToken),
      "x-lab-session": this.#session.sessionId,
    };
  }

  uploadSnapshot(projection, { ackActionIds = [], signal } = {}) {
    if (
      !Array.isArray(ackActionIds) ||
      ackActionIds.length > 32 ||
      ackActionIds.some(
        (value) => typeof value !== "string" || !SAFE_ID.test(value),
      )
    ) {
      throw new BridgeError(
        "invalid_acknowledgement",
        "ackActionIds must contain bounded safe identifiers",
      );
    }
    const sanitizedProjection = validateProjection(projection);
    return requestJson(
      this.fetchImpl,
      joinedUrl(this.origin, "/api/lab/bridge/snapshot"),
      {
        method: "POST",
        headers: this.#sessionHeaders(),
        body: {
          projection: sanitizedProjection,
          ...(ackActionIds.length === 0 ? {} : { ackActionIds }),
        },
        signal,
        timeoutMs: this.requestTimeoutMs,
        maximumBytes: MAX_CONTROL_BYTES,
        statuses: [200, 202, 204],
        allowEmpty: true,
      },
    );
  }

  async pollActions({ signal } = {}) {
    const value = exactObject(
      await requestJson(
        this.fetchImpl,
        joinedUrl(this.origin, "/api/lab/bridge/actions"),
        {
          headers: this.#sessionHeaders(),
          signal,
          timeoutMs: this.requestTimeoutMs,
        },
      ),
      ["actions", "pollAfterMs"],
      "cloud actions response",
    );
    if (!Array.isArray(value.actions) || value.actions.length > 32) {
      throw new BridgeError(
        "invalid_response",
        "cloud actions must be a bounded array",
      );
    }
    const actions = value.actions.map(validateAction);
    if (new Set(actions.map((action) => action.id)).size !== actions.length) {
      throw new BridgeError(
        "invalid_response",
        "cloud actions contain duplicate ids",
      );
    }
    if (
      !Number.isSafeInteger(value.pollAfterMs) ||
      value.pollAfterMs < 250 ||
      value.pollAfterMs > 10_000
    ) {
      throw new BridgeError(
        "invalid_response",
        "cloud pollAfterMs is outside the bounded interval",
      );
    }
    return Object.freeze({ actions, pollAfterMs: value.pollAfterMs });
  }
}
