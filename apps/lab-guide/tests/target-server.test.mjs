import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createGuideServer,
  readRuntimeConfig,
} from "../server/index.mjs";

let staticRoot;
const TELEMETRY_TOKEN = "kali-fallback-token-".padEnd(40, "k");

before(async () => {
  staticRoot = await mkdtemp(path.join(os.tmpdir(), "lab-guide-server-"));
  await writeFile(
    path.join(staticRoot, "index.html"),
    "<!doctype html><title>guide shell</title>",
  );
  await writeFile(path.join(staticRoot, "app.js"), "console.log('guide');");
});

after(async () => {
  await rm(staticRoot, { force: true, recursive: true });
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  server.closeAllConnections?.();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function request(port, {
  method = "GET",
  requestPath = "/",
  headers = {},
  body,
} = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: requestPath,
        headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
            status: response.statusCode,
          });
        });
      },
    );
    outgoing.on("error", reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

describe("Kali local-only fallback guide server", () => {
  test("serves static files, HEAD, and extensionless SPA routes", async () => {
    const server = createGuideServer({ staticRoot });
    const port = await listen(server);
    try {
      const index = await request(port);
      assert.equal(index.status, 200);
      assert.match(index.body, /guide shell/);
      assert.equal(index.headers["x-content-type-options"], "nosniff");
      assert.match(index.headers["content-security-policy"], /connect-src 'self'/);

      const head = await request(port, {
        method: "HEAD",
        requestPath: "/app.js",
      });
      assert.equal(head.status, 200);
      assert.equal(head.body, "");
      assert.equal(head.headers["content-type"], "text/javascript; charset=utf-8");

      const spa = await request(port, { requestPath: "/map/entrance" });
      assert.equal(spa.status, 200);
      assert.match(spa.body, /guide shell/);

      const missingAsset = await request(port, {
        requestPath: "/missing.js",
      });
      assert.equal(missingAsset.status, 404);
    } finally {
      await close(server);
    }
  });

  test("rejects traversal, unsupported methods, and non-session APIs", async () => {
    const server = createGuideServer({ staticRoot });
    const port = await listen(server);
    try {
      const traversal = await request(port, {
        requestPath: "/%2e%2e%2fsecret.txt",
      });
      assert.equal(traversal.status, 400);
      assert.equal(JSON.parse(traversal.body).error.code, "unsafe_path");

      const mutation = await request(port, {
        method: "DELETE",
        requestPath: "/map",
      });
      assert.equal(mutation.status, 405);
      assert.equal(mutation.headers.allow, "GET, HEAD");

      const apiMutation = await request(port, {
        method: "PUT",
        requestPath: "/api/session/state",
      });
      assert.equal(apiMutation.status, 405);
      assert.equal(apiMutation.headers.allow, "GET, POST");

      const unknownApi = await request(port, {
        requestPath: "/api/private-answer",
      });
      assert.equal(unknownApi.status, 404);
      assert.doesNotMatch(unknownApi.body, /guide shell/);
    } finally {
      await close(server);
    }
  });

  test("streams state, mutations, and SSE through the fixed telemetry origin", async () => {
    const seen = [];
    const telemetry = http.createServer((incoming, response) => {
      seen.push({
        authorization: incoming.headers.authorization,
        method: incoming.method,
        url: incoming.url,
      });
      if (incoming.url === "/api/session/events") {
        response.writeHead(200, {
          "Cache-Control": "no-cache",
          "Content-Type": "text/event-stream; charset=utf-8",
        });
        response.write("event: state\ndata: {\"revision\":7}\n\n");
        incoming.on("close", () => response.end());
        return;
      }

      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => {
        const payload = JSON.stringify({
          body: Buffer.concat(chunks).toString("utf8"),
          method: incoming.method,
          url: incoming.url,
        });
        response.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        });
        response.end(payload);
      });
    });
    const telemetryPort = await listen(telemetry);
    const guide = createGuideServer({
      staticRoot,
      telemetryHost: "127.0.0.1",
      telemetryPort,
      telemetryToken: TELEMETRY_TOKEN,
    });
    const guidePort = await listen(guide);

    try {
      const state = await request(guidePort, {
        requestPath: "/api/session/state?revision=6",
        headers: { authorization: "Bearer browser-must-not-control-this" },
      });
      assert.equal(state.status, 200);
      assert.deepEqual(JSON.parse(state.body), {
        body: "",
        method: "GET",
        url: "/api/session/state?revision=6",
      });

      const mutation = await request(guidePort, {
        method: "POST",
        requestPath: "/api/session/flags/submit",
        headers: { "Content-Type": "application/json" },
        body: '{"flag":"LAB{example}"}',
      });
      assert.deepEqual(JSON.parse(mutation.body), {
        body: '{"flag":"LAB{example}"}',
        method: "POST",
        url: "/api/session/flags/submit",
      });

      const sseChunk = await new Promise((resolve, reject) => {
        const outgoing = http.get(
          {
            host: "127.0.0.1",
            port: guidePort,
            path: "/api/session/events",
          },
          (response) => {
            assert.equal(
              response.headers["content-type"],
              "text/event-stream; charset=utf-8",
            );
            response.once("data", (chunk) => {
              resolve(chunk.toString("utf8"));
              response.destroy();
            });
          },
        );
        outgoing.on("error", reject);
      });
      assert.match(sseChunk, /event: state/);
      assert.deepEqual(seen.map(({ method, url }) => `${method} ${url}`), [
        "GET /api/session/state?revision=6",
        "POST /api/session/flags/submit",
        "GET /api/session/events",
      ]);
      assert.ok(
        seen.every(
          ({ authorization }) =>
            authorization === `Bearer ${TELEMETRY_TOKEN}`,
        ),
      );
    } finally {
      await close(guide);
      await close(telemetry);
    }
  });

  test("returns a bounded 502 response when telemetry is unavailable", async () => {
    const unused = http.createServer();
    const unavailablePort = await listen(unused);
    await close(unused);

    const server = createGuideServer({
      staticRoot,
      telemetryHost: "127.0.0.1",
      telemetryPort: unavailablePort,
      telemetryToken: TELEMETRY_TOKEN,
    });
    const port = await listen(server);
    try {
      const response = await request(port, {
        requestPath: "/api/session/state",
      });
      assert.equal(response.status, 502);
      assert.equal(
        JSON.parse(response.body).error.code,
        "telemetry_unavailable",
      );
    } finally {
      await close(server);
    }
  });

  test("requires a token and defaults the offline fallback to Kali loopback", () => {
    assert.throws(
      () => readRuntimeConfig({}),
      /BRIDGE_TARGET_TOKEN/,
    );
    assert.deepEqual(readRuntimeConfig({
      BRIDGE_TARGET_TOKEN: TELEMETRY_TOKEN,
    }), {
      host: "127.0.0.1",
      port: 8080,
      staticRoot: fileURLToPath(new URL("../dist/client/", import.meta.url)),
      telemetryHost: "10.13.37.10",
      telemetryPort: 8787,
      telemetryToken: TELEMETRY_TOKEN,
    });
  });
});
