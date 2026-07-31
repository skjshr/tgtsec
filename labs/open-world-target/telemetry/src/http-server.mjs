import { timingSafeEqual } from "node:crypto";
import http from "node:http";

import { asPublicError, LabError } from "./errors.mjs";

const MAX_JSON_BODY_BYTES = 4096;
const MIN_BRIDGE_TOKEN_LENGTH = 32;
const MAX_BRIDGE_TOKEN_LENGTH = 512;

function validateBridgeToken(value) {
  if (
    typeof value !== "string" ||
    value.length < MIN_BRIDGE_TOKEN_LENGTH ||
    value.length > MAX_BRIDGE_TOKEN_LENGTH ||
    /[\s\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(
      "TELEMETRY_BRIDGE_TOKEN must contain 32-512 visible non-whitespace characters",
    );
  }
  return value;
}

function hasValidBearer(request, bridgeToken) {
  const authorization = request.headers.authorization;
  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    return false;
  }
  const supplied = Buffer.from(authorization.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(bridgeToken, "utf8");
  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}

function requireBridgeBearer(request, bridgeToken) {
  if (!hasValidBearer(request, bridgeToken)) {
    throw new LabError(
      "unauthorized",
      "Bridge認証を確認できません。",
      401,
    );
  }
}

function writeJson(response, status, body) {
  const payload = `${JSON.stringify(body)}\n`;
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(payload);
}

async function readJsonBody(request, { allowEmpty = false } = {}) {
  const contentType = request.headers["content-type"];
  if (
    contentType !== undefined &&
    !contentType.toLowerCase().startsWith("application/json")
  ) {
    throw new LabError(
      "unsupported_media_type",
      "JSONで送信してください。",
      415,
    );
  }

  let body = "";
  for await (const chunk of request) {
    body += chunk.toString("utf8");
    if (Buffer.byteLength(body) > MAX_JSON_BODY_BYTES) {
      throw new LabError(
        "request_too_large",
        "送信内容が大きすぎます。",
        413,
      );
    }
  }
  if (body.length === 0 && allowEmpty) return {};
  try {
    const parsed = JSON.parse(body);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error("body is not an object");
    }
    return parsed;
  } catch {
    throw new LabError("invalid_json", "JSONの形式を確認してください。");
  }
}

function assertExactKeys(body, expectedKeys) {
  const actualKeys = Object.keys(body).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpected.length ||
    actualKeys.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new LabError(
      "invalid_request_fields",
      "許可されていない入力項目があります。",
    );
  }
}

function decodePathId(value) {
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.length === 0 ||
      decoded.length > 128 ||
      /[/?#\u0000-\u001f\u007f]/.test(decoded)
    ) {
      throw new Error("unsafe path id");
    }
    return decoded;
  } catch {
    throw new LabError("invalid_path", "URLの識別子が不正です。");
  }
}

function writeSseState(response, projection) {
  response.write(`id: ${projection.revision}\n`);
  response.write("event: state\n");
  response.write(`data: ${JSON.stringify(projection)}\n\n`);
}

export function createLabHttpServer({ engine, bridgeToken }) {
  const requiredBridgeToken = validateBridgeToken(bridgeToken);
  const clients = new Set();
  const broadcast = (projection) => {
    for (const response of clients) {
      writeSseState(response, projection);
    }
  };
  engine.on("change", broadcast);

  const heartbeat = setInterval(() => {
    for (const response of clients) response.write(": keepalive\n\n");
  }, 15_000);
  heartbeat.unref();

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://lab.local");
      const pathName = url.pathname;

      if (request.method === "GET" && pathName === "/healthz") {
        writeJson(response, 200, { status: "ok" });
        return;
      }

      requireBridgeBearer(request, requiredBridgeToken);

      if (request.method === "GET" && pathName === "/api/session/state") {
        writeJson(response, 200, engine.getProjection());
        return;
      }

      if (request.method === "GET" && pathName === "/api/session/events") {
        response.writeHead(200, {
          "Cache-Control": "no-cache, no-store",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream; charset=utf-8",
          "Referrer-Policy": "no-referrer",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
        });
        response.write("retry: 2000\n");
        const lastEventId = request.headers["last-event-id"];
        if (typeof lastEventId === "string") {
          response.write(`: reconnect-after ${lastEventId.slice(0, 32)}\n`);
        }
        writeSseState(response, engine.getProjection());
        clients.add(response);
        request.on("close", () => clients.delete(response));
        return;
      }

      const selectMatch = pathName.match(
        /^\/api\/session\/hypotheses\/([^/]+)\/select$/,
      );
      if (request.method === "POST" && selectMatch) {
        const body = await readJsonBody(request, { allowEmpty: true });
        assertExactKeys(body, []);
        const result = engine.selectHypothesis(decodePathId(selectMatch[1]));
        writeJson(response, 200, result.projection);
        return;
      }

      const hintMatch = pathName.match(
        /^\/api\/session\/hints\/([^/]+)\/unlock$/,
      );
      if (request.method === "POST" && hintMatch) {
        const body = await readJsonBody(request, { allowEmpty: true });
        assertExactKeys(body, []);
        const result = engine.unlockHint(decodePathId(hintMatch[1]));
        writeJson(response, 200, result.projection);
        return;
      }

      const guidanceMatch = pathName.match(
        /^\/api\/session\/guidance\/([^/]+)\/apply$/,
      );
      if (request.method === "POST" && guidanceMatch) {
        const body = await readJsonBody(request, { allowEmpty: true });
        assertExactKeys(body, []);
        const result = engine.applyGuidance(
          decodePathId(guidanceMatch[1]),
        );
        writeJson(response, 200, result.projection);
        return;
      }

      writeJson(response, 404, {
        error: {
          code: "not_found",
          message: "このAPIはありません。",
        },
      });
    } catch (error) {
      const publicError = asPublicError(error);
      writeJson(response, publicError.status, publicError.body);
    }
  });

  server.on("close", () => {
    clearInterval(heartbeat);
    engine.off("change", broadcast);
    for (const response of clients) response.end();
    clients.clear();
  });

  return server;
}
