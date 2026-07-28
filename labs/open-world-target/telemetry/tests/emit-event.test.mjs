import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { WORLD } from "../../world/world-definition.mjs";
import {
  createEventIngestServer,
  listenForEvents,
} from "../src/ingest-server.mjs";
import { SessionEngine } from "../src/session-engine.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const emitterPath = path.resolve(testDirectory, "../bin/emit-event.mjs");

function runEmitter(route, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        emitterPath,
        "--kind",
        route.kind,
        "--node",
        route.nodeId,
        "--source",
        route.sourceId,
        "--evidence",
        route.evidenceCode,
        "--at",
        "2026-07-27T00:00:00.000Z",
      ],
      {
        env: { ...process.env, ...environment },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("event emitter selects the source-scoped key file and never prints authentication material", async (context) => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "open-world-emitter-"),
  );
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const lowText = "low-emitter-test-key-at-least-32-bytes";
  const rootText = "root-emitter-test-key-at-least-32-bytes";
  const lowPath = path.join(temporaryRoot, "low.key");
  const rootPath = path.join(temporaryRoot, "root.key");
  await writeFile(lowPath, `${lowText}\n`, "utf8");
  await writeFile(rootPath, `${rootText}\n`, "utf8");

  const socketPath =
    process.platform === "win32"
      ? `\\\\.\\pipe\\open-world-emitter-${process.pid}-${Date.now()}`
      : path.join(temporaryRoot, "events.sock");
  const engine = new SessionEngine({ sessionId: "emitter" });
  const server = createEventIngestServer({
    engine,
    eventKeys: {
      low: Buffer.from(lowText, "utf8"),
      root: Buffer.from(rootText, "utf8"),
    },
  });
  await listenForEvents(server, { socketPath });
  context.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
  );

  const environment = {
    LAB_SESSION_ID: "emitter",
    LAB_EVENT_SOCKET: socketPath,
    LAB_EVENT_LOW_KEY_FILE: lowPath,
    LAB_EVENT_ROOT_KEY_FILE: rootPath,
  };
  const lowRoute = WORLD.eventRoutes.find(
    (route) => route.id === "event-entry-web",
  );
  const rootRoute = WORLD.eventRoutes.find(
    (route) => route.id === "event-foothold-sales",
  );

  const lowResult = await runEmitter(lowRoute, environment);
  assert.equal(lowResult.code, 0);
  assert.match(lowResult.stdout, /accepted=true changed=true revision=1/);

  const rootResult = await runEmitter(rootRoute, environment);
  assert.equal(rootResult.code, 0);
  assert.match(rootResult.stdout, /accepted=true changed=true revision=2/);

  const forgedRootResult = await runEmitter(rootRoute, {
    ...environment,
    LAB_EVENT_ROOT_KEY_FILE: lowPath,
  });
  assert.equal(forgedRootResult.code, 1);
  assert.match(forgedRootResult.stderr, /event_auth_failed/);

  const silentSocketPath =
    process.platform === "win32"
      ? `\\\\.\\pipe\\open-world-silent-${process.pid}-${Date.now()}`
      : path.join(temporaryRoot, "silent-events.sock");
  const silentServer = net.createServer((socket) => {
    socket.on("data", () => {});
  });
  await new Promise((resolve, reject) => {
    silentServer.once("error", reject);
    silentServer.listen(silentSocketPath, () => {
      silentServer.off("error", reject);
      resolve();
    });
  });
  context.after(
    () =>
      new Promise((resolve) => {
        silentServer.close(resolve);
      }),
  );
  const silentStartedAt = Date.now();
  const silentResult = await runEmitter(lowRoute, {
    ...environment,
    LAB_EVENT_SOCKET: silentSocketPath,
  });
  const silentElapsed = Date.now() - silentStartedAt;
  assert.equal(silentResult.code, 1);
  assert.match(silentResult.stderr, /telemetry daemon timed out/);
  assert.ok(silentElapsed >= 1_000 && silentElapsed < 4_000);

  const combinedOutput =
    lowResult.stdout +
    lowResult.stderr +
    rootResult.stdout +
    rootResult.stderr +
    forgedRootResult.stdout +
    forgedRootResult.stderr +
    silentResult.stdout +
    silentResult.stderr;
  assert.ok(!combinedOutput.includes(lowText));
  assert.ok(!combinedOutput.includes(rootText));
  assert.ok(!/[a-f0-9]{64}/.test(combinedOutput));
  assert.equal(engine.getProjection().progress.discovered, 2);
});
