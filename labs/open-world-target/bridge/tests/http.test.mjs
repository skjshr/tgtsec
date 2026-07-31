import assert from "node:assert/strict";
import test from "node:test";

import { CloudClient, TargetClient } from "../src/http.mjs";
import { action, jsonResponse, projection } from "./helpers.mjs";

const DEPLOYMENT_TOKEN = "deployment-token-".padEnd(40, "d");
const TARGET_TOKEN = "target-token-".padEnd(40, "t");
const UPLOAD_TOKEN = "upload-token-".padEnd(40, "u");

test("cloud client uses exact session, snapshot, and action contracts", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    if (path === "/api/lab/bridge/session") {
      return jsonResponse({
        sessionId: "cloud-session-001",
        pairingCode: "ABCD23",
        uploadToken: UPLOAD_TOKEN,
        viewerUrl: "https://guide.example.test/live",
        expiresAt: "2026-07-28T01:00:00.000Z",
      });
    }
    if (path === "/api/lab/bridge/snapshot") {
      return new Response(null, { status: 204 });
    }
    if (path === "/api/lab/bridge/actions") {
      return jsonResponse({
        actions: [action()],
        pollAfterMs: 750,
      });
    }
    throw new Error("unexpected path");
  };
  const cloud = new CloudClient({
    origin: "https://guide.example.test",
    deploymentToken: DEPLOYMENT_TOKEN,
    requestTimeoutMs: 1_000,
    fetchImpl,
  });

  const session = await cloud.createSession("exercise-test-001");
  assert.deepEqual(session, {
    sessionId: "cloud-session-001",
    pairingCode: "ABCD23",
    viewerUrl: "https://guide.example.test/live",
    expiresAt: "2026-07-28T01:00:00.000Z",
  });
  await cloud.uploadSnapshot(projection(), {
    ackActionIds: ["action-001"],
  });
  const actions = await cloud.pollActions();
  assert.equal(actions.actions[0].type, "selectHypothesis");
  assert.equal(actions.pollAfterMs, 750);

  assert.equal(
    calls[0].init.headers.authorization,
    `Bearer ${DEPLOYMENT_TOKEN}`,
  );
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    targetSessionId: "exercise-test-001",
  });
  assert.equal(calls[1].init.headers.authorization, `Bearer ${UPLOAD_TOKEN}`);
  assert.equal(calls[1].init.headers["x-lab-session"], "cloud-session-001");
  assert.deepEqual(
    JSON.parse(calls[1].init.body).ackActionIds,
    ["action-001"],
  );
  assert.equal(calls[2].init.method, "GET");
  assert.deepEqual(
    calls.map(({ url }) => new URL(url).pathname),
    [
      "/api/lab/bridge/session",
      "/api/lab/bridge/snapshot",
      "/api/lab/bridge/actions",
    ],
  );
});

test("target client rejects wrong content type and oversized JSON", async () => {
  const wrongType = new TargetClient({
    origin: "http://10.13.37.10:8787",
    targetToken: TARGET_TOKEN,
    requestTimeoutMs: 1_000,
    fetchImpl: async () =>
      new Response("<html>not telemetry</html>", {
        headers: { "content-type": "text/html" },
      }),
  });
  await assert.rejects(() => wrongType.getState(), /application\/json/);

  const oversized = new TargetClient({
    origin: "http://10.13.37.10:8787",
    targetToken: TARGET_TOKEN,
    requestTimeoutMs: 1_000,
    fetchImpl: async () =>
      jsonResponse({ padding: "x".repeat(300 * 1024) }),
  });
  await assert.rejects(() => oversized.getState(), /bounded size/);
});

test("target client authenticates state, events, and fixed actions", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ path: new URL(url).pathname, init });
    if (new URL(url).pathname === "/api/session/events") {
      return new Response("", {
        headers: { "content-type": "text/event-stream" },
      });
    }
    return jsonResponse(projection());
  };
  const target = new TargetClient({
    origin: "http://10.13.37.10:8787",
    targetToken: TARGET_TOKEN,
    requestTimeoutMs: 1_000,
    fetchImpl,
  });

  await target.getState();
  const events = await target.openEvents({ lastEventId: 7 });
  await events.body.cancel();
  await target.applyAction(
    "/api/session/hypotheses/hyp-service-inventory/select",
  );
  await target.applyAction(
    "/api/session/guidance/preset.easy/apply",
  );

  assert.deepEqual(
    calls.map(({ path }) => path),
    [
      "/api/session/state",
      "/api/session/events",
      "/api/session/hypotheses/hyp-service-inventory/select",
      "/api/session/guidance/preset.easy/apply",
    ],
  );
  for (const { init } of calls) {
    assert.equal(init.headers.authorization, `Bearer ${TARGET_TOKEN}`);
  }
  assert.equal(calls[1].init.headers["last-event-id"], "7");
  assert.equal(calls[2].init.method, "POST");
  assert.doesNotMatch(JSON.stringify(calls), /flags\/submit/);
});
