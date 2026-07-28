import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { WORLD } from "../../world/world-definition.mjs";
import {
  authenticateWireEvent,
  EVENT_SOURCE_SCOPES,
  signEvent,
  sourceScope,
} from "../src/event-auth.mjs";
import { SessionEngine } from "../src/session-engine.mjs";
import { JsonStateStore } from "../src/state-store.mjs";

const keys = Object.freeze({
  low: Buffer.from("low-auth-test-key-at-least-32-bytes", "utf8"),
  root: Buffer.from("root-auth-test-key-at-least-32-bytes", "utf8"),
});

function eventFor(routeId, sessionId = "auth") {
  const route = WORLD.eventRoutes.find((candidate) => candidate.id === routeId);
  assert.ok(route);
  return {
    sessionId,
    kind: route.kind,
    nodeId: route.nodeId,
    sourceId: route.sourceId,
    evidenceCode: route.evidenceCode,
    occurredAt: "2026-07-27T00:00:00.000Z",
  };
}

function wire(event, key) {
  return { ...event, authTag: signEvent(event, key) };
}

test("every world event source has an explicit low or root trust scope", () => {
  for (const route of WORLD.eventRoutes) {
    assert.ok(
      ["low", "root"].includes(sourceScope(route.sourceId)),
      `missing source scope for ${route.sourceId}`,
    );
  }
  assert.equal(EVENT_SOURCE_SCOPES["apache2.service"], "low");
  assert.equal(EVENT_SOURCE_SCOPES["smbd.service"], "low");
  assert.equal(EVENT_SOURCE_SCOPES["ssh.service"], "root");
  assert.equal(EVENT_SOURCE_SCOPES["open-world-file-watch.service"], "root");
  assert.equal(EVENT_SOURCE_SCOPES["auditd.service"], undefined);
});

test("valid low-trust and root-trust wire events authenticate and strip the tag", () => {
  const lowEvent = eventFor("event-entry-web");
  const rootEvent = eventFor("event-foothold-sales");
  const authenticatedLow = authenticateWireEvent(wire(lowEvent, keys.low), keys);
  const authenticatedRoot = authenticateWireEvent(
    wire(rootEvent, keys.root),
    keys,
  );
  assert.deepEqual(authenticatedLow, lowEvent);
  assert.deepEqual(authenticatedRoot, rootEvent);
  assert.ok(!Object.hasOwn(authenticatedLow, "authTag"));
  assert.ok(!Object.hasOwn(authenticatedRoot, "authTag"));
});

test("missing, wrong, and low-key-for-root tags are rejected identically", () => {
  const rootRoutes = WORLD.eventRoutes.filter(
    (route) => sourceScope(route.sourceId) === "root",
  );
  assert.ok(rootRoutes.length >= 6);
  for (const route of rootRoutes) {
    const event = eventFor(route.id);
    assert.throws(
      () => authenticateWireEvent(wire(event, keys.low), keys),
      (error) => error.code === "event_auth_failed" && error.status === 403,
    );
  }

  const lowEvent = eventFor("event-entry-web");
  assert.throws(
    () => authenticateWireEvent(lowEvent, keys),
    (error) => error.code === "event_auth_failed",
  );
  assert.throws(
    () =>
      authenticateWireEvent(
        { ...lowEvent, authTag: "0".repeat(64) },
        keys,
      ),
    (error) => error.code === "event_auth_failed",
  );
});

test("authentication tags never enter projection or persisted state", async (context) => {
  const event = eventFor("event-entry-smb", "auth-persistence");
  const tag = signEvent(event, keys.low);
  const authenticated = authenticateWireEvent(
    { ...event, authTag: tag },
    keys,
  );
  const engine = new SessionEngine({ sessionId: "auth-persistence" });
  engine.applyEvent(authenticated);

  const forbiddenMaterial = [
    tag,
    keys.low.toString("utf8"),
    keys.root.toString("utf8"),
  ];
  for (const material of forbiddenMaterial) {
    assert.ok(!JSON.stringify(engine.getProjection()).includes(material));
    assert.ok(!JSON.stringify(engine.exportState()).includes(material));
  }

  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "open-world-auth-state-"),
  );
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const statePath = path.join(temporaryRoot, "state.json");
  const store = new JsonStateStore(statePath);
  await store.save(engine.exportState());
  const persisted = await readFile(statePath, "utf8");
  for (const material of forbiddenMaterial) {
    assert.ok(!persisted.includes(material));
  }
  await assert.rejects(
    store.save({ sessionId: "bad", authTag: tag }),
    /forbidden telemetry material/,
  );
});
