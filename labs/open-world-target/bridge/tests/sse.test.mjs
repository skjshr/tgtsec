import assert from "node:assert/strict";
import test from "node:test";

import { shouldReconnect } from "../src/bridge.mjs";
import { BridgeError } from "../src/errors.mjs";
import {
  ProjectionConflictError,
  ProjectionRollbackError,
} from "../src/projection-state.mjs";
import {
  parseProjectionFrame,
  parseSseStream,
  reconnectDelay,
} from "../src/sse.mjs";
import { projection } from "./helpers.mjs";

function streamFrom(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

test("SSE parser accepts split full state frames and comments", async () => {
  const payload = JSON.stringify(projection());
  const split = Math.floor(payload.length / 2);
  const frames = [];
  for await (const frame of parseSseStream(
    streamFrom([
      ": keepalive\n\nid: 0\nevent: state\ndata: ",
      payload.slice(0, split),
      `${payload.slice(split)}\n\n`,
    ]),
  )) {
    frames.push(frame);
  }

  assert.equal(frames.length, 1);
  assert.equal(frames[0].event, "state");
  assert.equal(parseProjectionFrame(frames[0]).sessionId, "exercise-test-001");
});

test("SSE frame rejects an id that disagrees with revision", () => {
  assert.throws(
    () =>
      parseProjectionFrame({
        event: "state",
        id: "2",
        data: JSON.stringify(projection({ revision: 1 })),
      }),
    /does not match/,
  );
  assert.equal(
    parseProjectionFrame({ event: "detector", id: "", data: "{}" }),
    null,
  );
});

test("reconnect decisions distinguish transport rollback from conflict", () => {
  assert.equal(
    shouldReconnect(
      new BridgeError("network", "temporary", { retryable: true }),
    ),
    true,
  );
  assert.equal(
    shouldReconnect(new ProjectionRollbackError("rollback")),
    true,
  );
  assert.equal(
    shouldReconnect(new ProjectionConflictError("conflict")),
    false,
  );
  assert.equal(
    shouldReconnect(new BridgeError("invalid", "fatal")),
    false,
  );
});

test("exponential reconnect delay stays bounded with deterministic jitter", () => {
  assert.equal(
    reconnectDelay(0, { baseMs: 500, maxMs: 30_000, random: () => 0.5 }),
    500,
  );
  assert.equal(
    reconnectDelay(3, { baseMs: 500, maxMs: 30_000, random: () => 0.5 }),
    4_000,
  );
  assert.equal(
    reconnectDelay(20, { baseMs: 500, maxMs: 30_000, random: () => 1 }),
    30_000,
  );
});
