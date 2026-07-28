import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { WORLD } from "../../world/world-definition.mjs";
import { signEvent } from "../src/event-auth.mjs";
import {
  createEventIngestServer,
  EVENT_INGEST_DEADLINE_MS,
  listenForEvents,
  MAX_EVENT_CONNECTIONS,
} from "../src/ingest-server.mjs";
import { SessionEngine } from "../src/session-engine.mjs";

function eventFor(routeId, sessionId) {
  const route = WORLD.eventRoutes.find((candidate) => candidate.id === routeId);
  return {
    sessionId,
    kind: route.kind,
    nodeId: route.nodeId,
    sourceId: route.sourceId,
    evidenceCode: route.evidenceCode,
    occurredAt: "2026-07-27T00:00:00.000Z",
  };
}

const eventKeys = Object.freeze({
  low: Buffer.from("low-test-key-32-bytes-minimum-0001", "utf8"),
  root: Buffer.from("root-test-key-32-bytes-minimum-001", "utf8"),
});

function authenticated(event, key = eventKeys.low) {
  return { ...event, authTag: signEvent(event, key) };
}

function send(socketPath, value) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let response = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify(value)}\n`));
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.on("end", () => {
      try {
        resolve(JSON.parse(response));
      } catch (error) {
        reject(error);
      }
    });
    socket.on("error", reject);
  });
}

test("local socket enforces source-scoped authentication before ingestion", async (context) => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "open-world-socket-"),
  );
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const socketPath =
    process.platform === "win32"
      ? `\\\\.\\pipe\\open-world-${process.pid}-${Date.now()}`
      : path.join(temporaryRoot, "events.sock");
  const engine = new SessionEngine({ sessionId: "socket" });
  const server = createEventIngestServer({ engine, eventKeys });
  await listenForEvents(server, { socketPath });
  context.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
  );

  const accepted = await send(
    socketPath,
    authenticated(eventFor("event-entry-nfs", "socket"), eventKeys.root),
  );
  assert.deepEqual(accepted, {
    accepted: true,
    changed: true,
    revision: 1,
  });
  assert.equal(engine.getProjection().progress.discovered, 1);

  const acceptedLow = await send(
    socketPath,
    authenticated(eventFor("event-entry-web", "socket"), eventKeys.low),
  );
  assert.equal(acceptedLow.accepted, true);
  assert.equal(acceptedLow.changed, true);
  assert.equal(engine.getProjection().progress.discovered, 2);

  const missingTag = await send(
    socketPath,
    eventFor("event-entry-smb", "socket"),
  );
  assert.equal(missingTag.error.code, "event_auth_failed");

  const wrongTag = await send(socketPath, {
    ...eventFor("event-entry-smb", "socket"),
    authTag: "0".repeat(64),
  });
  assert.equal(wrongTag.error.code, "event_auth_failed");

  const forgedRoot = await send(
    socketPath,
    authenticated(eventFor("event-foothold-sales", "socket"), eventKeys.low),
  );
  assert.equal(forgedRoot.error.code, "event_auth_failed");

  const rootRoute = eventFor("event-root-common", "socket");
  const lowSourceRootTuple = {
    ...rootRoute,
    sourceId: "apache2.service",
  };
  const forgedLowTuple = await send(
    socketPath,
    authenticated(lowSourceRootTuple, eventKeys.low),
  );
  assert.equal(forgedLowTuple.error.code, "event_not_allowlisted");

  const rejected = await send(socketPath, {
    ...authenticated(eventFor("event-entry-nfs", "socket"), eventKeys.root),
    password: "must-never-be-accepted",
  });
  assert.equal(rejected.error.code, "event_auth_failed");
  assert.ok(!JSON.stringify(rejected).includes("must-never-be-accepted"));
  assert.equal(engine.getProjection().progress.discovered, 2);
});

test("silent ingest clients are bounded and released without state changes", async (context) => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "open-world-idle-socket-"),
  );
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const socketPath =
    process.platform === "win32"
      ? `\\\\.\\pipe\\open-world-idle-${process.pid}-${Date.now()}`
      : path.join(temporaryRoot, "events.sock");
  const engine = new SessionEngine({ sessionId: "idle-socket" });
  const server = createEventIngestServer({ engine, eventKeys });
  assert.equal(server.maxConnections, MAX_EVENT_CONNECTIONS);
  assert.ok(EVENT_INGEST_DEADLINE_MS <= 2_000);
  await listenForEvents(server, { socketPath });
  context.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
  );

  const startedAt = Date.now();
  const response = await new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let body = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      body += chunk;
    });
    socket.on("close", () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    socket.on("error", reject);
  });
  const elapsed = Date.now() - startedAt;
  assert.equal(response.error.code, "event_timeout");
  assert.ok(elapsed >= 1_000 && elapsed < 4_000);
  assert.equal(engine.getProjection().progress.discovered, 0);
  const remainingConnections = await new Promise((resolve, reject) => {
    server.getConnections((error, count) => {
      if (error) reject(error);
      else resolve(count);
    });
  });
  assert.equal(remainingConnections, 0);
});
