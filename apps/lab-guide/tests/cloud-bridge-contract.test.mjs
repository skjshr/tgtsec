import assert from "node:assert/strict";
import test from "node:test";

import { CloudClient } from "../../../labs/open-world-target/bridge/src/http.mjs";
import {
  call,
  createHarness,
  DEPLOYMENT_SECRET,
  ORIGIN,
  pairBrowser,
  projection,
} from "./cloud-test-helpers.mjs";

test("Bridge and browser complete one paired live action through the cloud contract", async () => {
  const harness = createHarness({ publicOrigin: ORIGIN });
  const fetchImpl = (url, init) =>
    harness.handler.fetch(new Request(url, init));
  const bridgeClient = new CloudClient({
    origin: ORIGIN,
    deploymentToken: DEPLOYMENT_SECRET,
    requestTimeoutMs: 1_000,
    fetchImpl,
  });

  const bridgeSession = await bridgeClient.createSession("target-session-1");
  await bridgeClient.uploadSnapshot(projection(1));

  const paired = await pairBrowser(harness, bridgeSession.pairingCode);
  assert.equal(paired.response.status, 200);
  assert.equal(paired.body.experience, "live");
  assert.equal(paired.body.capabilities.manualFlagSubmission, false);

  const queued = await call(
    harness,
    "/api/session/hypotheses/hyp-web/select",
    {
      method: "POST",
      headers: { cookie: paired.cookie },
    },
  );
  assert.equal(queued.status, 202);

  const pending = await bridgeClient.pollActions();
  assert.equal(pending.actions.length, 1);
  assert.deepEqual(
    {
      type: pending.actions[0].type,
      targetId: pending.actions[0].targetId,
    },
    {
      type: "selectHypothesis",
      targetId: "hyp-web",
    },
  );

  const afterAction = projection(2);
  afterAction.hypotheses[0].selected = true;
  await bridgeClient.uploadSnapshot(afterAction, {
    ackActionIds: [pending.actions[0].id],
  });

  const state = await call(harness, "/api/session/state", {
    headers: { cookie: paired.cookie },
  });
  assert.equal(state.status, 200);
  const visible = await state.json();
  assert.equal(visible.revision, 2);
  assert.equal(visible.hypotheses[0].selected, true);
  assert.deepEqual((await bridgeClient.pollActions()).actions, []);
});
