import { CloudError, fail } from "./errors.mjs";
import { MAX_PROJECTION_BYTES } from "./projection.mjs";

export const SESSION_COOKIE_NAME = "__Host-examserver_lab_session";
const JSON_TYPE = "application/json";
const COMMON_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(`${JSON.stringify(body)}\n`, {
    status,
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function emptyResponse(status = 204, extraHeaders = {}) {
  return new Response(null, {
    status,
    headers: { ...COMMON_HEADERS, ...extraHeaders },
  });
}

function errorResponse(error) {
  const publicError =
    error instanceof CloudError
      ? error
      : new CloudError(
          500,
          "internal_server_error",
          "処理を完了できませんでした。",
        );
  return jsonResponse(
    {
      error: {
        code: publicError.code,
        message: publicError.publicMessage,
      },
    },
    publicError.status,
  );
}

function method(request, expected) {
  if (request.method !== expected) {
    throw new CloudError(
      405,
      "method_not_allowed",
      "この操作方法には対応していません。",
    );
  }
}

function plainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(400, "invalid_request", "リクエストが不正です。", `${label} invalid`);
  }
  return value;
}

function exactKeys(value, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !allowed.has(key))
  ) {
    fail(400, "invalid_request", "リクエストが不正です。");
  }
  return value;
}

async function boundedBody(request, maximumBytes) {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)
  ) {
    fail(413, "request_too_large", "リクエストが大きすぎます。");
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        fail(413, "request_too_large", "リクエストが大きすぎます。");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function readJson(request, maximumBytes) {
  const contentType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== JSON_TYPE) {
    fail(415, "unsupported_media_type", "JSONで送信してください。");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      await boundedBody(request, maximumBytes),
    );
  } catch (error) {
    if (error instanceof CloudError) throw error;
    fail(400, "invalid_json", "JSONを読み取れません。");
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(400, "invalid_json", "JSONを読み取れません。");
  }
}

async function requireEmptyBody(request) {
  if ((await boundedBody(request, 1)).byteLength !== 0) {
    fail(400, "invalid_request", "この操作に本文は送信できません。");
  }
}

function bearer(request) {
  const value = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]{1,512})$/.exec(value);
  return match?.[1] ?? "";
}

function sessionHeader(request) {
  const value = request.headers.get("x-lab-session") ?? "";
  return value.length <= 128 ? value : "";
}

function sessionCookie(request) {
  const raw = request.headers.get("cookie") ?? "";
  if (raw.length > 4096) {
    fail(401, "invalid_session", "接続情報を確認できません。");
  }
  const matches = [];
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    if (part.slice(0, separator).trim() === SESSION_COOKIE_NAME) {
      matches.push(part.slice(separator + 1).trim());
    }
  }
  if (matches.length !== 1 || matches[0].length > 1024) {
    fail(401, "invalid_session", "接続情報を確認できません。");
  }
  return matches[0];
}

function pairedCookieHeader(value, expiresAtMs, nowMs) {
  const maxAge = Math.max(1, Math.floor((expiresAtMs - nowMs) / 1_000));
  return [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    `Expires=${new Date(expiresAtMs).toUTCString()}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

function routePath(url) {
  let path = url.pathname;
  if (path === "/api") {
    const rewritten = url.searchParams.get("__route");
    if (rewritten !== null && rewritten.length <= 2048) {
      path = `/api/${rewritten.replace(/^\/+/, "")}`;
    }
  }
  if (path === "/api/lab") return "/api";
  if (path.startsWith("/api/lab/")) return `/api/${path.slice(9)}`;
  return path;
}

function decodedTargetId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    fail(400, "invalid_request", "リクエストが不正です。");
  }
}

function sseResponse(projection, nowMs) {
  const payload = JSON.stringify(projection);
  const heartbeat = JSON.stringify({ at: new Date(nowMs).toISOString() });
  const body = [
    "retry: 1000",
    `id: ${projection.revision}`,
    "event: state",
    `data: ${payload}`,
    "",
    "event: heartbeat",
    `data: ${heartbeat}`,
    "",
    "",
  ].join("\n");
  return new Response(body, {
    status: 200,
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

export function createCloudHandler({ service, now = Date.now }) {
  if (!service) throw new Error("service is required");

  return {
    async fetch(request) {
      try {
        const url = new URL(request.url);
        const path = routePath(url);

        if (path === "/api/bridge/session") {
          method(request, "POST");
          const body = exactKeys(
            plainObject(await readJson(request, 4 * 1024), "session body"),
            ["targetSessionId"],
          );
          return jsonResponse(
            await service.createSession({
              deploymentToken: bearer(request),
              targetSessionId: body.targetSessionId,
              requestOrigin: url.origin,
            }),
            200,
          );
        }

        if (path === "/api/bridge/snapshot") {
          method(request, "POST");
          const body = exactKeys(
            plainObject(
              await readJson(request, MAX_PROJECTION_BYTES + 16 * 1024),
              "snapshot body",
            ),
            ["projection"],
            ["ackActionIds"],
          );
          await service.uploadSnapshot({
            sessionId: sessionHeader(request),
            uploadToken: bearer(request),
            projection: body.projection,
            ackActionIds: body.ackActionIds,
          });
          return emptyResponse();
        }

        if (path === "/api/bridge/actions") {
          method(request, "GET");
          return jsonResponse(
            await service.pollActions({
              sessionId: sessionHeader(request),
              uploadToken: bearer(request),
            }),
          );
        }

        if (path === "/api/session/pair") {
          method(request, "POST");
          const body = exactKeys(
            plainObject(await readJson(request, 1024), "pair body"),
            ["code"],
          );
          const paired = await service.pair(body.code);
          return jsonResponse(paired.projection, 200, {
            "Set-Cookie": pairedCookieHeader(
              paired.cookieValue,
              paired.expiresAtMs,
              now(),
            ),
          });
        }

        if (path === "/api/session/state") {
          method(request, "GET");
          return jsonResponse(await service.getState(sessionCookie(request)));
        }

        if (path === "/api/session/events") {
          method(request, "GET");
          return sseResponse(
            await service.getState(sessionCookie(request)),
            now(),
          );
        }

        const hypothesis = /^\/api\/session\/hypotheses\/([^/]+)\/select$/.exec(
          path,
        );
        if (hypothesis) {
          method(request, "POST");
          await requireEmptyBody(request);
          return jsonResponse(
            await service.queueAction({
              cookieValue: sessionCookie(request),
              type: "selectHypothesis",
              targetId: decodedTargetId(hypothesis[1]),
            }),
            202,
          );
        }

        const hint = /^\/api\/session\/hints\/([^/]+)\/unlock$/.exec(path);
        if (hint) {
          method(request, "POST");
          await requireEmptyBody(request);
          return jsonResponse(
            await service.queueAction({
              cookieValue: sessionCookie(request),
              type: "unlockHint",
              targetId: decodedTargetId(hint[1]),
            }),
            202,
          );
        }

        throw new CloudError(404, "not_found", "このAPIはありません。");
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}
