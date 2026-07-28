import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEPLOYMENT_SECRET,
  ORIGIN,
  call,
  createBridgeSession,
  createHarness,
  pairBrowser,
  projection,
  upload,
} from "./cloud-test-helpers.mjs";

describe("cloud relay authentication and pairing", () => {
  test("requires the deployment bearer and returns the exact Bridge contract", async () => {
    const harness = createHarness();
    let response = await call(harness, "/api/bridge/session", {
      method: "POST",
      json: { targetSessionId: "target-session-1" },
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "invalid_bridge_secret");

    response = await call(harness, "/api/bridge/session", {
      method: "POST",
      headers: { authorization: "Bearer definitely-wrong" },
      json: { targetSessionId: "target-session-1" },
    });
    assert.equal(response.status, 401);

    const created = await createBridgeSession(harness);
    assert.equal(created.response.status, 200);
    assert.equal(created.response.headers.get("cache-control"), "no-store");
    assert.deepEqual(Object.keys(created.body).sort(), [
      "expiresAt",
      "pairingCode",
      "sessionId",
      "uploadToken",
      "viewerUrl",
    ]);
    assert.match(created.body.sessionId, /^session-[A-Za-z0-9_-]{20,}$/);
    assert.match(created.body.pairingCode, /^[A-Z2-9]{6}$/);
    assert.match(created.body.uploadToken, /^[A-Za-z0-9_-]{32,}$/);
    assert.equal(created.body.viewerUrl, `${ORIGIN}/`);
    assert.ok(Date.parse(created.body.expiresAt) > harness.now());
  });

  test("prefers configured public origin over the incoming request origin", async () => {
    const harness = createHarness({
      publicOrigin: "https://labs.examserver.example",
      viewerPath: "/lab",
    });
    const created = await createBridgeSession(harness);
    assert.equal(created.body.viewerUrl, "https://labs.examserver.example/lab");
  });

  test("accepts the ExamServer /api/lab namespace", async () => {
    const harness = createHarness({ viewerPath: "/lab" });
    const response = await call(harness, "/api/lab/bridge/session", {
      method: "POST",
      headers: { authorization: `Bearer ${DEPLOYMENT_SECRET}` },
      json: { targetSessionId: "target-session-prefixed" },
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).viewerUrl, `${ORIGIN}/lab`);
  });

  test("sets a hardened single-use pairing cookie and rejects tampering", async () => {
    const harness = createHarness();
    const created = await createBridgeSession(harness);

    let response = await call(harness, "/api/session/pair", {
      method: "POST",
      json: { code: "AAAAAA" },
    });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "pairing_unavailable");

    const paired = await pairBrowser(harness, created.body.pairingCode);
    assert.equal(paired.response.status, 200);
    assert.equal(paired.body.telemetry.status, "waiting");
    assert.match(paired.setCookie, /Path=\//);
    assert.match(paired.setCookie, /HttpOnly/i);
    assert.match(paired.setCookie, /Secure/i);
    assert.match(paired.setCookie, /SameSite=Strict/i);
    assert.doesNotMatch(paired.setCookie, /Domain=/i);

    response = await call(harness, "/api/session/state", {
      headers: { cookie: paired.cookie },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sessionId, "target-session-1");

    const last = paired.cookieValue.at(-1);
    const tampered = `${paired.cookie.slice(0, -1)}${last === "A" ? "B" : "A"}`;
    response = await call(harness, "/api/session/state", {
      headers: { cookie: tampered },
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "invalid_session");

    response = await call(harness, "/api/session/pair", {
      method: "POST",
      json: { code: created.body.pairingCode },
    });
    assert.equal(response.status, 404);
  });

  test("expires pairing codes and paired sessions independently", async () => {
    let harness = createHarness();
    let created = await createBridgeSession(harness);
    harness.advance(30_001);
    let response = await call(harness, "/api/session/pair", {
      method: "POST",
      json: { code: created.body.pairingCode },
    });
    assert.equal(response.status, 404);

    harness = createHarness();
    created = await createBridgeSession(harness);
    const paired = await pairBrowser(harness, created.body.pairingCode);
    harness.advance(120_001);
    response = await call(harness, "/api/session/state", {
      headers: { cookie: paired.cookie },
    });
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error.code, "session_expired");
  });
});

describe("cloud projection boundary", () => {
  test("rejects forbidden fields, locked bodies, flag strings, and wrapper extras", async () => {
    const harness = createHarness();
    const created = await createBridgeSession(harness);

    let unsafe = projection();
    unsafe.command = "cat /etc/shadow";
    let response = await upload(harness, created.body, unsafe);
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, "invalid_projection");

    unsafe = projection();
    unsafe.hints[1].body = "まだ公開してはいけない本文";
    response = await upload(harness, created.body, unsafe);
    assert.equal(response.status, 422);

    unsafe = projection();
    unsafe.facts[0].detail = "FLAG{must_never_reach_redis}";
    response = await upload(harness, created.body, unsafe);
    assert.equal(response.status, 422);

    response = await call(harness, "/api/bridge/snapshot", {
      method: "POST",
      headers: {
        authorization: `Bearer ${created.body.uploadToken}`,
        "x-lab-session": created.body.sessionId,
      },
      json: { projection: projection(), rawOutput: "sensitive" },
    });
    assert.equal(response.status, 400);
  });

  test("persists only the sanitized public projection", async () => {
    const harness = createHarness();
    const created = await createBridgeSession(harness);
    const paired = await pairBrowser(harness, created.body.pairingCode);
    const response = await upload(harness, created.body, projection());
    assert.equal(response.status, 204);

    const stateResponse = await call(harness, "/api/session/state", {
      headers: { cookie: paired.cookie },
    });
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.experience, "live");
    assert.equal(state.capabilities.manualFlagSubmission, false);
    assert.equal(state.revision, 1);
    assert.equal(state.objective, "最初の入口を確認する");
    assert.doesNotMatch(JSON.stringify(state), /uploadToken|pairingCode/);
  });

  test("enforces media type and bounded request bodies with safe errors", async () => {
    const harness = createHarness();
    let response = await call(harness, "/api/bridge/session", {
      method: "POST",
      headers: {
        authorization: `Bearer ${DEPLOYMENT_SECRET}`,
        "content-type": "text/plain",
      },
      rawBody: "{}",
    });
    assert.equal(response.status, 415);

    response = await call(harness, "/api/session/pair", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "2000",
      },
      rawBody: "{}",
    });
    assert.equal(response.status, 413);
    assert.deepEqual(Object.keys(await response.json()), ["error"]);
  });
});
