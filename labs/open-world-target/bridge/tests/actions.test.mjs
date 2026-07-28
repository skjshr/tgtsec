import assert from "node:assert/strict";
import test from "node:test";

import {
  targetPathForAction,
  validateAction,
} from "../src/actions.mjs";
import { TargetClient } from "../src/http.mjs";
import { action } from "./helpers.mjs";

const TARGET_TOKEN = "target-secret-".padEnd(40, "t");

test("allowlisted actions map only to fixed target paths", () => {
  assert.equal(
    targetPathForAction(action()),
    "/api/session/hypotheses/hyp-service-inventory/select",
  );
  assert.equal(
    targetPathForAction(
      action({
        id: "action-002",
        type: "unlockHint",
        targetId: "hyp-service-inventory:1",
      }),
    ),
    "/api/session/hints/hyp-service-inventory%3A1/unlock",
  );
});

test("manual flags, arbitrary paths, and extra action fields are rejected", () => {
  assert.throws(
    () => validateAction(action({ type: "submitFlag" })),
    /not allowed/,
  );
  assert.throws(
    () => validateAction({ ...action(), command: "id" }),
    /unsupported fields/,
  );

  const target = new TargetClient({
    origin: "http://10.13.37.10:8787",
    targetToken: TARGET_TOKEN,
    requestTimeoutMs: 1_000,
    fetchImpl: async () => {
      throw new Error("must not fetch");
    },
  });
  assert.throws(
    () => target.applyAction("/api/session/flags/submit"),
    /not fixed/,
  );
  assert.throws(
    () => target.applyAction("https://example.test/api/session/hints/x/unlock"),
    /not fixed/,
  );
});
