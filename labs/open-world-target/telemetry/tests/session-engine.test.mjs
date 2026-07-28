import assert from "node:assert/strict";
import test from "node:test";

import {
  getPrivateFlagAnswer,
} from "../../world/private-answers.mjs";
import { WORLD } from "../../world/world-definition.mjs";
import { SessionEngine } from "../src/session-engine.mjs";

function eventFor(routeId, sessionId, occurredAt = "2026-07-27T00:00:00.000Z") {
  const route = WORLD.eventRoutes.find((candidate) => candidate.id === routeId);
  assert.ok(route, `unknown route ${routeId}`);
  return {
    sessionId,
    kind: route.kind,
    nodeId: route.nodeId,
    sourceId: route.sourceId,
    evidenceCode: route.evidenceCode,
    occurredAt,
  };
}

test("initial projection reveals silhouettes but no hidden labels, answers, or hint bodies", () => {
  const engine = new SessionEngine({ sessionId: "privacy" });
  const projectionText = JSON.stringify(engine.getProjection());

  assert.equal(engine.getProjection().facts.length, 0);
  assert.deepEqual(
    engine.getProjection().graph.nodes.map((node) => Object.keys(node).sort()),
    [
      ["id", "state"],
      ["id", "state"],
      ["id", "state"],
    ],
  );
  assert.ok(
    engine
      .getProjection()
      .hints.every((hint) => !Object.hasOwn(hint, "body")),
  );
  for (const flag of WORLD.flags) {
    assert.ok(!projectionText.includes(getPrivateFlagAnswer(flag.id)));
    assert.ok(!projectionText.includes(flag.id));
  }
  for (const node of WORLD.nodes) {
    assert.ok(!projectionText.includes(node.id));
  }
});

test("event input is an exact allowlist and state transitions are idempotent", () => {
  const engine = new SessionEngine({ sessionId: "allowlist" });
  const event = eventFor("event-entry-web", "allowlist");

  const first = engine.applyEvent(event);
  assert.equal(first.changed, true);
  assert.equal(first.projection.progress.discovered, 1);
  assert.equal(first.projection.facts[0].label, "スタッフ用の診断画面");
  const remainingEntrances = first.projection.graph.nodes.filter(
    (node) => node.state === "undiscovered" && ["map-02", "map-03"].includes(node.id),
  );
  assert.equal(remainingEntrances.length, 2);

  const duplicate = engine.applyEvent(event);
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.projection.revision, first.projection.revision);

  const sameTransitionLater = engine.applyEvent({
    ...event,
    occurredAt: "2026-07-27T00:00:01.000Z",
  });
  assert.equal(sameTransitionLater.changed, false);
  assert.equal(
    sameTransitionLater.projection.revision,
    first.projection.revision,
  );

  assert.throws(
    () => engine.applyEvent({ ...event, command: "cat /etc/shadow" }),
    (error) => error.code === "invalid_event_fields",
  );
  assert.throws(
    () =>
      engine.applyEvent({
        ...event,
        sourceId: "ssh.service",
      }),
    (error) => error.code === "event_not_allowlisted",
  );
  assert.throws(
    () =>
      engine.applyEvent({
        ...event,
        sessionId: "another-session",
      }),
    (error) => error.code === "session_mismatch",
  );
});

test("independent discoveries are accepted without a strict walkthrough gate", () => {
  const engine = new SessionEngine({ sessionId: "open-world-order" });
  const result = engine.applyEvent(
    eventFor("event-clue-timer", "open-world-order"),
  );
  assert.equal(result.changed, true);
  assert.equal(result.projection.progress.discovered, 1);
  assert.ok(
    result.projection.facts.some(
      (fact) => fact.label === "定期処理の手掛かり",
    ),
  );
});

const ENTRANCE_ROUTES = [
  ["event-entry-web", "event-foothold-web"],
  ["event-entry-smb", "event-foothold-sales"],
  ["event-entry-nfs", "event-foothold-mechanic"],
];
const ROOT_ROUTES = [
  ["event-clue-sudo", "event-route-sudo", "event-root-common"],
  ["event-clue-timer", "event-route-timer", "event-root-common"],
  ["event-clue-suid", "event-route-suid", "event-root-common"],
];

for (const [entranceIndex, entranceRoute] of ENTRANCE_ROUTES.entries()) {
  for (const [rootIndex, rootRoute] of ROOT_ROUTES.entries()) {
    test(`fresh route combination ${entranceIndex + 1}x${rootIndex + 1} reaches root`, () => {
      const sessionId = `route-${entranceIndex + 1}-${rootIndex + 1}`;
      const engine = new SessionEngine({ sessionId });
      [...entranceRoute, ...rootRoute].forEach((routeId, index) => {
        engine.applyEvent(
          eventFor(
            routeId,
            sessionId,
            `2026-07-27T00:00:0${index}.000Z`,
          ),
        );
      });

      const projection = engine.getProjection();
      assert.equal(projection.status, "complete");
      assert.equal(projection.progress.discovered, 5);
      assert.ok(
        projection.facts.some((fact) => fact.label === "Debian root"),
      );
    });
  }
}

test("all automatic flags plus post-root manual Windows flag reach 14 of 14", () => {
  const sessionId = "all-flags";
  const engine = new SessionEngine({ sessionId });
  const routes = [
    "event-entry-web",
    "event-entry-smb",
    "event-entry-nfs",
    "event-foothold-web",
    "event-foothold-sales",
    "event-foothold-mechanic",
    "event-clue-sudo",
    "event-clue-timer",
    "event-clue-suid",
    "event-route-sudo",
    "event-route-timer",
    "event-route-suid",
    "event-root-common",
  ];
  routes.forEach((routeId, index) => {
    engine.applyEvent(
      eventFor(
        routeId,
        sessionId,
        `2026-07-27T00:00:${String(index).padStart(2, "0")}.000Z`,
      ),
    );
  });
  assert.equal(engine.getProjection().progress.discovered, 13);

  const result = engine.submitManualFlag(
    getPrivateFlagAnswer("flag-windows"),
  );
  assert.equal(result.accepted, true);
  assert.equal(result.changed, true);
  assert.equal(result.projection.progress.discovered, 14);
  const projectionText = JSON.stringify(result.projection);
  for (const flag of WORLD.flags) {
    assert.ok(!projectionText.includes(flag.id));
    assert.ok(!projectionText.includes(getPrivateFlagAnswer(flag.id)));
  }
});

test("root completion is the final accepted automatic state transition", () => {
  const sessionId = "root-final-event";
  const engine = new SessionEngine({ sessionId });
  engine.applyEvent(eventFor("event-root-common", sessionId));
  const rootRevision = engine.getProjection().revision;

  const afterRoot = engine.applyEvent(
    eventFor(
      "event-entry-web",
      sessionId,
      "2026-07-27T00:00:01.000Z",
    ),
  );
  assert.equal(afterRoot.changed, false);
  assert.equal(afterRoot.projection.revision, rootRevision);
  assert.equal(afterRoot.projection.progress.discovered, 1);
});

test("manual fallback never stores the submitted answer and is gated while live", () => {
  const answer = getPrivateFlagAnswer("flag-entry-smb");
  const liveEngine = new SessionEngine({ sessionId: "manual-live" });
  assert.throws(
    () => liveEngine.submitManualFlag(answer),
    (error) => error.code === "manual_fallback_inactive",
  );
  assert.throws(
    () => liveEngine.submitManualFlag("FLAG{not-valid}"),
    (error) => error.code === "manual_fallback_inactive",
  );

  const engine = new SessionEngine({
    sessionId: "manual-down",
    telemetryStatus: "unavailable",
    now: () => "2026-07-27T02:00:00.000Z",
  });
  assert.equal(engine.submitManualFlag("FLAG{not-valid}").accepted, false);
  assert.equal(
    engine.submitManualFlag(getPrivateFlagAnswer("flag-windows")).accepted,
    false,
  );
  const result = engine.submitManualFlag(answer);
  assert.equal(result.accepted, true);
  assert.equal(result.projection.progress.discovered, 1);
  assert.ok(!JSON.stringify(engine.exportState()).includes(answer));
  assert.ok(!JSON.stringify(result.projection).includes(answer));
});

test("hypotheses and hints unlock in the accepted order without early bodies", () => {
  const engine = new SessionEngine({ sessionId: "hints" });
  let projection = engine.getProjection();
  assert.equal(projection.hints[0].state, "available");
  assert.equal(projection.hints[1].state, "locked");

  projection = engine.unlockHint("hyp-service-inventory:1").projection;
  assert.equal(projection.hints[0].state, "unlocked");
  assert.ok(projection.hints[0].body);
  assert.ok(!Object.hasOwn(projection.hints[1], "body"));
  assert.throws(
    () => engine.unlockHint("hyp-service-inventory:3"),
    (error) => error.code === "hint_order",
  );

  engine.applyEvent(eventFor("event-entry-web", "hints"));
  projection = engine.selectHypothesis("hyp-web-input-boundary").projection;
  assert.equal(
    projection.hypotheses.find(
      (hypothesis) => hypothesis.id === "hyp-web-input-boundary",
    ).selected,
    true,
  );
  assert.equal(projection.hints[0].title, "見る場所");
  assert.ok(projection.hints.every((hint) => !Object.hasOwn(hint, "body")));
});
