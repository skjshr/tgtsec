import assert from "node:assert/strict";
import test from "node:test";

import { KaliBridge } from "../src/bridge.mjs";
import { action, projection } from "./helpers.mjs";

function openStateStream(value) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `id: ${value.revision}\nevent: state\ndata: ${JSON.stringify(value)}\n\n`,
          ),
        );
      },
    }),
    {
      headers: { "content-type": "text/event-stream" },
    },
  );
}

test("bridge prints only pairing data, relays state, and acknowledges fixed actions", async () => {
  const initial = projection();
  const afterAction = projection({
    revision: 1,
    hypotheses: [
      {
        ...initial.hypotheses[0],
        selected: true,
      },
    ],
  });
  const targetPaths = [];
  const target = {
    secrets: ["target-token-that-must-not-print"],
    async getState() {
      return initial;
    },
    async openEvents() {
      return openStateStream(initial);
    },
    async applyAction(path) {
      targetPaths.push(path);
      return afterAction;
    },
  };
  const uploads = [];
  let bridge;
  const cloud = {
    secrets: [
      "deployment-token-that-must-not-print",
      "upload-token-that-must-not-print",
    ],
    async createSession(targetSessionId) {
      assert.equal(targetSessionId, initial.sessionId);
      return {
        sessionId: "cloud-session-secret",
        pairingCode: "PAIR23",
        viewerUrl: "https://guide.example.test/live",
        expiresAt: "2026-07-28T01:00:00.000Z",
      };
    },
    async uploadSnapshot(value, { ackActionIds }) {
      uploads.push({ value, ackActionIds });
      if (ackActionIds.length === 1) queueMicrotask(() => bridge.stop());
    },
    async pollActions() {
      return {
        actions: [action()],
        pollAfterMs: 250,
      };
    },
  };
  let output = "";
  bridge = new KaliBridge({
    config: {
      actionPollMs: 250,
      heartbeatMs: 60_000,
      requestTimeoutMs: 1_000,
      sseIdleTimeoutMs: 60_000,
      reconnectBaseMs: 100,
      reconnectMaxMs: 1_000,
    },
    targetClient: target,
    cloudClient: cloud,
    output: (value) => {
      output += value;
    },
    errorOutput: () => undefined,
    random: () => 0.5,
  });

  await bridge.run();

  assert.equal(
    output,
    "Pairing code: PAIR23\nViewer URL: https://guide.example.test/live\n",
  );
  assert.doesNotMatch(
    output,
    /cloud-session-secret|deployment-token|upload-token/,
  );
  assert.doesNotMatch(output, /target-token/);
  assert.deepEqual(targetPaths, [
    "/api/session/hypotheses/hyp-service-inventory/select",
  ]);
  assert.equal(uploads.length, 2);
  assert.deepEqual(uploads[1].ackActionIds, ["action-001"]);
  assert.equal(uploads[1].value.revision, 1);
});

test("does not acknowledge an action until its resulting revision is accepted", async () => {
  const initial = projection({ revision: 1 });
  const rolledBack = projection({ revision: 0 });
  const applied = projection({ revision: 2 });
  let actionAttempts = 0;
  const target = {
    secrets: [],
    async getState() {
      return initial;
    },
    async openEvents() {
      return openStateStream(initial);
    },
    async applyAction() {
      actionAttempts += 1;
      return actionAttempts === 1 ? rolledBack : applied;
    },
  };
  const uploads = [];
  let bridge;
  const cloud = {
    secrets: [],
    async createSession() {
      return {
        sessionId: "cloud-session-rollback",
        pairingCode: "ROLL23",
        viewerUrl: "https://guide.example.test/",
        expiresAt: "2026-07-28T01:00:00.000Z",
      };
    },
    async uploadSnapshot(value, { ackActionIds }) {
      uploads.push({ value, ackActionIds });
      if (ackActionIds.length === 1) queueMicrotask(() => bridge.stop());
    },
    async pollActions() {
      return { actions: [action()], pollAfterMs: 250 };
    },
  };

  bridge = new KaliBridge({
    config: {
      actionPollMs: 250,
      heartbeatMs: 60_000,
      requestTimeoutMs: 1_000,
      sseIdleTimeoutMs: 60_000,
      reconnectBaseMs: 1,
      reconnectMaxMs: 1,
    },
    targetClient: target,
    cloudClient: cloud,
    output: () => undefined,
    errorOutput: () => undefined,
    random: () => 0,
  });

  await bridge.run();

  assert.equal(actionAttempts, 2);
  const acknowledgements = uploads.filter(
    ({ ackActionIds }) => ackActionIds.length > 0,
  );
  assert.equal(acknowledgements.length, 1);
  assert.equal(acknowledgements[0].value.revision, 2);
  assert.deepEqual(acknowledgements[0].ackActionIds, ["action-001"]);
});
