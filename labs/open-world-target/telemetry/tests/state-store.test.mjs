import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SessionEngine } from "../src/session-engine.mjs";
import { JsonStateStore } from "../src/state-store.mjs";

test("state store round-trips derived state and blocks forbidden material", async (context) => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "open-world-state-"),
  );
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const statePath = path.join(temporaryRoot, "state.json");
  const store = new JsonStateStore(statePath);
  const engine = new SessionEngine({
    sessionId: "stored",
    telemetryStatus: "unavailable",
  });
  engine.unlockHint("hyp-service-inventory:1");
  await store.save(engine.exportState());

  const serialized = await readFile(statePath, "utf8");
  assert.ok(!serialized.includes("FLAG{"));
  assert.ok(!serialized.includes('"command"'));
  const restored = new SessionEngine({
    sessionId: "stored",
    telemetryStatus: "unavailable",
    storedState: await store.load(),
  });
  assert.deepEqual(restored.getProjection(), engine.getProjection());

  await assert.rejects(
    store.save({ sessionId: "stored", command: "sensitive" }),
    /forbidden telemetry material/,
  );
  await assert.rejects(
    store.save({ sessionId: "stored", value: "FLAG{secret}" }),
    /forbidden telemetry material/,
  );
  await assert.rejects(
    store.save({ sessionId: "stored", authTag: "a".repeat(64) }),
    /forbidden telemetry material/,
  );
});
