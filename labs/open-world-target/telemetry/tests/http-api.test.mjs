import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { WORLD } from "../../world/world-definition.mjs";
import { createLabHttpServer } from "../src/http-server.mjs";
import { SessionEngine } from "../src/session-engine.mjs";
import { installDetectorStatusSignals } from "../src/status-control.mjs";

const BRIDGE_TOKEN = "telemetry-test-token-".padEnd(40, "t");

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

async function startApi(context, engine) {
  const server = createLabHttpServer({
    engine,
    bridgeToken: BRIDGE_TOKEN,
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  context.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
  );
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function bridgeFetch(url, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${BRIDGE_TOKEN}`,
    },
  });
}

async function readSseFrame(reader, expectedText) {
  const decoder = new TextDecoder();
  let received = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await Promise.race([
      reader.read(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timed out waiting for SSE")), 2000),
      ),
    ]);
    if (result.done) break;
    received += decoder.decode(result.value, { stream: true });
    if (received.includes(expectedText) && received.includes("\n\n")) {
      return received;
    }
  }
  throw new Error(`SSE frame did not contain ${expectedText}: ${received}`);
}

test("target APIs require a secret-safe Bridge bearer token", async (context) => {
  const engine = new SessionEngine({ sessionId: "http-auth" });
  const baseUrl = await startApi(context, engine);

  let response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 200);

  response = await fetch(`${baseUrl}/api/session/state`);
  assert.equal(response.status, 401);
  let text = await response.text();
  assert.match(text, /unauthorized/);
  assert.ok(!text.includes(BRIDGE_TOKEN));

  const wrongToken = "wrong-telemetry-token-".padEnd(40, "w");
  response = await fetch(`${baseUrl}/api/session/state`, {
    headers: { authorization: `Bearer ${wrongToken}` },
  });
  assert.equal(response.status, 401);
  text = await response.text();
  assert.ok(!text.includes(wrongToken));
  assert.ok(!text.includes(BRIDGE_TOKEN));
});

test("GET state and POST hypothesis/hint/guidance APIs return the stable projection", async (context) => {
  const engine = new SessionEngine({ sessionId: "http-state" });
  const baseUrl = await startApi(context, engine);

  let response = await bridgeFetch(`${baseUrl}/api/session/state`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  let state = await response.json();
  assert.equal(state.sessionId, "http-state");
  assert.equal(state.progress.total, 13);
  assert.equal(state.guidance.showCommandExamples, true);

  engine.applyEvent(eventFor("event-entry-web", "http-state"));
  response = await bridgeFetch(
    `${baseUrl}/api/session/hypotheses/hyp-web-input-boundary/select`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(response.status, 200);
  state = await response.json();
  assert.equal(
    state.hypotheses.find(
      (hypothesis) => hypothesis.id === "hyp-web-input-boundary",
    ).selected,
    true,
  );

  response = await bridgeFetch(
    `${baseUrl}/api/session/hints/hyp-web-input-boundary%3A1/unlock`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(response.status, 200);
  state = await response.json();
  assert.equal(state.hints[0].state, "unlocked");
  assert.match(state.hints[0].body, /診断対象/);

  response = await bridgeFetch(
    `${baseUrl}/api/session/guidance/preset.hard/apply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(response.status, 200);
  state = await response.json();
  assert.equal(state.guidance.showCommandExamples, false);
  assert.equal(state.guidance.silhouetteDepth, 0);
});

test("guidance endpoint rejects unsupported commands and request fields", async (context) => {
  const engine = new SessionEngine({ sessionId: "http-guidance" });
  const baseUrl = await startApi(context, engine);

  let response = await bridgeFetch(
    `${baseUrl}/api/session/guidance/preset.easy/apply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "not-allowed" }),
    },
  );
  assert.equal(response.status, 400);

  response = await bridgeFetch(
    `${baseUrl}/api/session/guidance/not-a-setting/apply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(response.status, 400);

  response = await bridgeFetch(`${baseUrl}/api/session/flags/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ flag: "FLAG{not-forwarded}" }),
  });
  assert.equal(response.status, 404);
});

test("SSE sends a full initial snapshot, broadcasts changes, and snapshots on reconnect", async (context) => {
  const engine = new SessionEngine({ sessionId: "http-sse" });
  const baseUrl = await startApi(context, engine);
  const firstAbort = new AbortController();
  const response = await bridgeFetch(`${baseUrl}/api/session/events`, {
    signal: firstAbort.signal,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/event-stream/);
  const reader = response.body.getReader();
  const initial = await readSseFrame(reader, '"revision":0');
  assert.match(initial, /event: state/);
  assert.match(initial, /retry: 2000/);

  engine.applyEvent(eventFor("event-entry-smb", "http-sse"));
  const changed = await readSseFrame(reader, '"revision":1');
  assert.match(changed, /匿名で読める引き継ぎ共有/);
  await reader.cancel();
  firstAbort.abort();

  const reconnectAbort = new AbortController();
  const reconnectResponse = await bridgeFetch(`${baseUrl}/api/session/events`, {
    headers: { "Last-Event-ID": "1" },
    signal: reconnectAbort.signal,
  });
  const reconnectReader = reconnectResponse.body.getReader();
  const reconnect = await readSseFrame(reconnectReader, '"revision":1');
  assert.match(reconnect, /: reconnect-after 1/);
  assert.match(reconnect, /event: state/);
  await reconnectReader.cancel();
  reconnectAbort.abort();
});

test("root-controlled detector signals preserve state while the HTTP API stays alive", async (context) => {
  const engine = new SessionEngine({ sessionId: "http-status-control" });
  const signalTarget = new EventEmitter();
  const removeSignals = installDetectorStatusSignals({
    engine,
    signalTarget,
  });
  context.after(removeSignals);
  const baseUrl = await startApi(context, engine);

  signalTarget.emit("SIGUSR1");
  let response = await bridgeFetch(`${baseUrl}/api/session/state`);
  assert.equal(response.status, 200);
  let state = await response.json();
  assert.equal(state.telemetry.status, "unavailable");

  const ignored = engine.applyEvent(
    eventFor("event-entry-web", "http-status-control"),
  );
  assert.equal(ignored.changed, false);

  signalTarget.emit("SIGUSR2");
  engine.applyEvent(eventFor("event-entry-web", "http-status-control"));
  response = await bridgeFetch(`${baseUrl}/api/session/state`);
  assert.equal(response.status, 200);
  state = await response.json();
  assert.equal(state.telemetry.status, "live");
  assert.equal(state.progress.discovered, 1);
});
