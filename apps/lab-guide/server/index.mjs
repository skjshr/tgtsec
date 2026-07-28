import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_STATIC_ROOT = fileURLToPath(
  new URL("../dist/client/", import.meta.url),
);
const MAX_URL_LENGTH = 4096;
const TELEMETRY_REQUEST_TIMEOUT_MS = 2_000;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function securityHeaders() {
  return {
    "Content-Security-Policy":
      "default-src 'self'; connect-src 'self'; font-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function writeJson(response, status, body, extraHeaders = {}) {
  const payload = `${JSON.stringify(body)}\n`;
  response.writeHead(status, {
    ...securityHeaders(),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  response.end(payload);
}

function writeError(response, error) {
  const status =
    error instanceof HttpError && Number.isInteger(error.status)
      ? error.status
      : 500;
  const code =
    error instanceof HttpError ? error.code : "internal_server_error";
  const message =
    error instanceof HttpError
      ? error.message
      : "ガイドを表示できませんでした。";
  writeJson(response, status, { error: { code, message } });
}

function parseRequestUrl(rawUrl) {
  if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) {
    throw new HttpError(400, "invalid_url", "URLが不正です。");
  }

  const rawPath = rawUrl.split("?", 1)[0];
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    throw new HttpError(400, "invalid_url", "URLが不正です。");
  }

  if (
    decodedPath.includes("\\") ||
    decodedPath.includes("\0") ||
    decodedPath.split("/").some((segment) => segment === "..")
  ) {
    throw new HttpError(400, "unsafe_path", "安全でないパスです。");
  }

  let url;
  try {
    url = new URL(rawUrl, "http://guide.local");
  } catch {
    throw new HttpError(400, "invalid_url", "URLが不正です。");
  }
  return { decodedPath, url };
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

async function findStaticFile(rootRealPath, relativePath) {
  const candidate = path.resolve(rootRealPath, relativePath);
  if (!isInside(rootRealPath, candidate)) {
    throw new HttpError(400, "unsafe_path", "安全でないパスです。");
  }

  try {
    const candidateRealPath = await realpath(candidate);
    if (!isInside(rootRealPath, candidateRealPath)) {
      throw new HttpError(400, "unsafe_path", "安全でないパスです。");
    }
    const fileStat = await stat(candidateRealPath);
    return fileStat.isFile()
      ? { filePath: candidateRealPath, size: fileStat.size }
      : undefined;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return undefined;
    }
    throw error;
  }
}

function isSpaRoute(decodedPath) {
  const lastSegment = decodedPath.split("/").at(-1) ?? "";
  return !lastSegment.includes(".");
}

async function serveStatic({
  request,
  response,
  decodedPath,
  rootRealPath,
}) {
  const relativePath =
    decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  let file = await findStaticFile(rootRealPath, relativePath);
  let isSpaFallback = false;

  if (!file && isSpaRoute(decodedPath)) {
    file = await findStaticFile(rootRealPath, "index.html");
    isSpaFallback = true;
  }

  if (!file) {
    throw new HttpError(404, "not_found", "ファイルが見つかりません。");
  }

  const extension = path.extname(file.filePath).toLowerCase();
  const isHtml = extension === ".html";
  response.writeHead(200, {
    ...securityHeaders(),
    "Cache-Control":
      isHtml || isSpaFallback
        ? "no-cache"
        : relativePath.startsWith("assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
    "Content-Type":
      CONTENT_TYPES.get(extension) ?? "application/octet-stream",
    "Content-Length": file.size,
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(file.filePath);
  stream.on("error", (error) => {
    if (!response.headersSent) {
      writeError(response, error);
    } else {
      response.destroy(error);
    }
  });
  stream.pipe(response);
}

function copyUpstreamHeaders(headers) {
  const copied = {};
  for (const [name, value] of Object.entries(headers)) {
    if (
      value !== undefined &&
      !HOP_BY_HOP_HEADERS.has(name.toLowerCase())
    ) {
      copied[name] = value;
    }
  }
  return copied;
}

function proxySessionRequest({
  request,
  response,
  url,
  telemetryHost,
  telemetryPort,
  telemetryToken,
}) {
  const forwardedHeaders = {};
  for (const name of [
    "accept",
    "content-length",
    "content-type",
    "last-event-id",
  ]) {
    const value = request.headers[name];
    if (value !== undefined) forwardedHeaders[name] = value;
  }
  forwardedHeaders.authorization = `Bearer ${telemetryToken}`;

  const upstream = http.request(
    {
      host: telemetryHost,
      port: telemetryPort,
      method: request.method,
      path: `${url.pathname}${url.search}`,
      headers: forwardedHeaders,
      timeout: TELEMETRY_REQUEST_TIMEOUT_MS,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, {
        ...securityHeaders(),
        ...copyUpstreamHeaders(upstreamResponse.headers),
      });
      upstreamResponse.pipe(response);
    },
  );

  upstream.on("error", (error) => {
    if (!response.headersSent) {
      writeJson(response, 502, {
        error: {
          code: "telemetry_unavailable",
          message: "進行状況へ接続できません。",
        },
      });
    } else {
      response.destroy(error);
    }
  });
  upstream.on("timeout", () => {
    upstream.destroy(new Error("telemetry request timed out"));
  });
  request.on("aborted", () => upstream.destroy());
  response.on("close", () => {
    if (!response.writableEnded) upstream.destroy();
  });
  request.pipe(upstream);
}

export function createGuideServer({
  staticRoot = DEFAULT_STATIC_ROOT,
  telemetryHost = "10.13.37.10",
  telemetryPort = 8787,
  telemetryToken,
} = {}) {
  const rootRealPathPromise = realpath(path.resolve(staticRoot));

  const server = http.createServer(async (request, response) => {
    try {
      const { decodedPath, url } = parseRequestUrl(request.url);
      const isSessionApi = decodedPath.startsWith("/api/session/");
      const isAnyApi = decodedPath === "/api" || decodedPath.startsWith("/api/");

      if (isSessionApi) {
        if (request.method !== "GET" && request.method !== "POST") {
          throw new HttpError(
            405,
            "method_not_allowed",
            "この操作方法には対応していません。",
          );
        }
        if (!telemetryToken) {
          throw new HttpError(
            503,
            "telemetry_auth_unavailable",
            "ローカル接続の認証設定がありません。",
          );
        }
        proxySessionRequest({
          request,
          response,
          url,
          telemetryHost,
          telemetryPort,
          telemetryToken,
        });
        return;
      }

      if (isAnyApi) {
        throw new HttpError(404, "not_found", "このAPIはありません。");
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        throw new HttpError(
          405,
          "method_not_allowed",
          "この操作方法には対応していません。",
        );
      }

      await serveStatic({
        request,
        response,
        decodedPath,
        rootRealPath: await rootRealPathPromise,
      });
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      const allow =
        error instanceof HttpError && error.status === 405
          ? request.url?.startsWith("/api/session/")
            ? "GET, POST"
            : "GET, HEAD"
          : undefined;
      if (allow) {
        response.setHeader("Allow", allow);
      }
      writeError(response, error);
    }
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

function parsePort(value, name) {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer from 1 to 65535`);
  }
  return port;
}

function parseSecret(value, name) {
  if (
    typeof value !== "string" ||
    value.length < 32 ||
    value.length > 512 ||
    /[\s\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(
      `${name} must contain 32-512 visible non-whitespace characters`,
    );
  }
  return value;
}

export function readRuntimeConfig(environment = process.env) {
  return {
    host: environment.LAB_GUIDE_HOST ?? "127.0.0.1",
    port: parsePort(environment.LAB_GUIDE_PORT ?? "8080", "LAB_GUIDE_PORT"),
    staticRoot: environment.LAB_GUIDE_DIST ?? DEFAULT_STATIC_ROOT,
    telemetryHost: environment.LAB_TELEMETRY_HOST ?? "10.13.37.10",
    telemetryPort: parsePort(
      environment.LAB_TELEMETRY_PORT ?? "8787",
      "LAB_TELEMETRY_PORT",
    ),
    telemetryToken: parseSecret(
      environment.BRIDGE_TARGET_TOKEN,
      "BRIDGE_TARGET_TOKEN",
    ),
  };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
  const config = readRuntimeConfig();
  const server = createGuideServer(config);
  server.once("error", (error) => {
    process.stderr.write(`open-world guide failed: ${error.message}\n`);
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    process.stdout.write(
      `open-world guide ready http=${config.host}:${config.port} telemetry=${config.telemetryHost}:${config.telemetryPort}\n`,
    );
  });

  const shutdown = () => {
    server.close((error) => {
      if (error) {
        process.stderr.write(`open-world guide shutdown failed: ${error.message}\n`);
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
