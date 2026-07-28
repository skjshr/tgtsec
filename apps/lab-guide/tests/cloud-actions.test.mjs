import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  call,
  createBridgeSession,
  createHarness,
  pairBrowser,
  poll,
  projection,
  upload,
} from "./cloud-test-helpers.mjs";

describe("cloud snapshot revisions", () => {
  test("accepts exact replays and rejects rollback or same-revision conflicts", async () => {
    const harness = createHarness();
    const created = await createBridgeSession(harness);
    const revisionTwo = projection(2);

    let response = await upload(harness, created.body, revisionTwo);
    assert.equal(response.status, 204);
    response = await upload(harness, created.body, structuredClone(revisionTwo));
    assert.equal(response.status, 204);

    response = await upload(harness, created.body, projection(1));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "revision_rollback");

    const conflict = structuredClone(revisionTwo);
    conflict.objective = "同じrevisionで異なる内容";
    response = await upload(harness, created.body, conflict);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "revision_conflict");
  });
});

describe("cloud guide action queue", () => {
  test("queues only exact allowlisted actions and removes acknowledged actions", async () => {
    const harness = createHarness();
    const created = await createBridgeSession(harness);
    const paired = await pairBrowser(harness, created.body.pairingCode);
    assert.equal((await upload(harness, created.body, projection())).status, 204);

    let response = await call(
      harness,
      "/api/session/hypotheses/hyp-web/select",
      {
        method: "POST",
        headers: { cookie: paired.cookie },
      },
    );
    assert.equal(response.status, 202);

    response = await call(
      harness,
      "/api/session/hypotheses/hyp-web/select",
      {
        method: "POST",
        headers: { cookie: paired.cookie },
      },
    );
    assert.equal(response.status, 202);

    response = await call(harness, "/api/session/hints/hint-web-1/unlock", {
      method: "POST",
      headers: { cookie: paired.cookie },
    });
    assert.equal(response.status, 202);

    response = await call(harness, "/api/session/hints/hint-web-2/unlock", {
      method: "POST",
      headers: { cookie: paired.cookie },
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "action_unavailable");

    response = await call(harness, "/api/session/flags/submit", {
      method: "POST",
      headers: { cookie: paired.cookie },
      json: { flag: "FLAG{never_cross_the_cloud}" },
    });
    assert.equal(response.status, 404);

    const pending = await poll(harness, created.body);
    assert.equal(pending.response.status, 200);
    assert.deepEqual(Object.keys(pending.body).sort(), [
      "actions",
      "pollAfterMs",
    ]);
    assert.equal(pending.body.actions.length, 2);
    assert.deepEqual(
      pending.body.actions.map((action) => action.type).sort(),
      ["selectHypothesis", "unlockHint"],
    );
    for (const action of pending.body.actions) {
      assert.deepEqual(Object.keys(action).sort(), [
        "createdAt",
        "id",
        "targetId",
        "type",
      ]);
      assert.ok(!Number.isNaN(Date.parse(action.createdAt)));
    }

    const ids = pending.body.actions.map((action) => action.id);
    response = await upload(harness, created.body, projection(), ids);
    assert.equal(response.status, 204);
    assert.deepEqual((await poll(harness, created.body)).body.actions, []);

    response = await upload(harness, created.body, projection(), ids);
    assert.equal(response.status, 204);
    assert.deepEqual((await poll(harness, created.body)).body.actions, []);
  });

  test("requires paired state and rejects arbitrary target identifiers or bodies", async () => {
    const harness = createHarness();
    const created = await createBridgeSession(harness);

    let response = await call(
      harness,
      "/api/session/hypotheses/hyp-web/select",
      { method: "POST" },
    );
    assert.equal(response.status, 401);

    const paired = await pairBrowser(harness, created.body.pairingCode);
    response = await call(
      harness,
      "/api/session/hypotheses/hyp-web/select",
      {
        method: "POST",
        headers: { cookie: paired.cookie },
      },
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "state_not_ready");

    assert.equal((await upload(harness, created.body, projection())).status, 204);
    response = await call(
      harness,
      "/api/session/hypotheses/not-present/select",
      {
        method: "POST",
        headers: { cookie: paired.cookie },
      },
    );
    assert.equal(response.status, 409);

    response = await call(
      harness,
      "/api/session/hypotheses/hyp-web/select",
      {
        method: "POST",
        headers: { cookie: paired.cookie },
        rawBody: "x",
      },
    );
    assert.equal(response.status, 400);
  });
});

describe("bounded paired SSE", () => {
  test("emits a state event and heartbeat, then closes", async () => {
    const harness = createHarness();
    const created = await createBridgeSession(harness);
    const paired = await pairBrowser(harness, created.body.pairingCode);
    await upload(harness, created.body, projection(7));

    let response = await call(harness, "/api/session/events", {
      headers: { cookie: paired.cookie },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.text();
    assert.match(body, /retry: 1000/);
    assert.match(body, /id: 7/);
    assert.match(body, /event: state/);
    assert.match(body, /event: heartbeat/);
    const data = /^data: (.+)$/m.exec(body);
    assert.equal(JSON.parse(data[1]).revision, 7);

    response = await call(harness, "/api/session/events");
    assert.equal(response.status, 401);
  });

  test("projects stale Bridge heartbeats as reconnecting without rollback", async () => {
    const harness = createHarness({ staleAfterMs: 5_000 });
    const created = await createBridgeSession(harness);
    const paired = await pairBrowser(harness, created.body.pairingCode);
    await upload(harness, created.body, projection(3));
    harness.advance(5_001);

    const response = await call(harness, "/api/session/state", {
      headers: { cookie: paired.cookie },
    });
    const state = await response.json();
    assert.equal(state.revision, 3);
    assert.equal(state.telemetry.status, "reconnecting");
  });
});
