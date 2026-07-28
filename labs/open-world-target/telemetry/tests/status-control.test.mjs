import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { WORLD } from "../../world/world-definition.mjs";
import { SessionEngine } from "../src/session-engine.mjs";
import {
  DETECTOR_STATUS_SIGNALS,
  installDetectorStatusSignals,
} from "../src/status-control.mjs";

test("detector status signals are explicit, idempotent, and removable", () => {
  assert.deepEqual(DETECTOR_STATUS_SIGNALS, {
    SIGUSR1: "unavailable",
    SIGUSR2: "live",
  });
  const engine = new SessionEngine({ sessionId: "status-signals" });
  const signalTarget = new EventEmitter();
  const remove = installDetectorStatusSignals({ engine, signalTarget });

  signalTarget.emit("SIGUSR1");
  assert.equal(engine.getProjection().telemetry.status, "unavailable");
  const unavailableRevision = engine.getProjection().revision;
  const route = WORLD.eventRoutes.find(
    (candidate) => candidate.id === "event-entry-web",
  );
  const event = {
    sessionId: "status-signals",
    kind: route.kind,
    nodeId: route.nodeId,
    sourceId: route.sourceId,
    evidenceCode: route.evidenceCode,
    occurredAt: "2026-07-27T00:00:00.000Z",
  };
  assert.equal(engine.applyEvent(event).changed, false);
  assert.equal(engine.getProjection().progress.discovered, 0);
  signalTarget.emit("SIGUSR1");
  assert.equal(engine.getProjection().revision, unavailableRevision);

  signalTarget.emit("SIGUSR2");
  assert.equal(engine.getProjection().telemetry.status, "live");
  assert.equal(engine.applyEvent(event).changed, true);
  assert.equal(engine.getProjection().progress.discovered, 1);
  remove();
  assert.equal(signalTarget.listenerCount("SIGUSR1"), 0);
  assert.equal(signalTarget.listenerCount("SIGUSR2"), 0);
});
