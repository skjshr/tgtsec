import assert from "node:assert/strict";
import test from "node:test";

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

test("initial projection reveals public categories without hidden node material", () => {
  const engine = new SessionEngine({ sessionId: "privacy" });
  const projection = engine.getProjection();
  const projectionText = JSON.stringify(projection);

  assert.equal(projection.facts.length, 0);
  assert.deepEqual(
    projection.graph.nodes,
    [
      { id: "map-01", state: "undiscovered", category: "Web" },
      { id: "map-02", state: "undiscovered", category: "共有" },
      { id: "map-03", state: "undiscovered", category: "整備" },
    ],
  );
  assert.equal(projection.guidance.showCommandExamples, true);
  assert.ok(projection.hints.every((hint) => hint.state === "unlocked"));
  assert.ok(
    WORLD.nodes.every((node) =>
      [
        "Web",
        "共有",
        "整備",
        "権限獲得",
        "権限昇格",
        "root経路",
        "最終地点",
      ].includes(node.publicCategory),
    ),
  );
  for (const flag of WORLD.flags) {
    assert.ok(!projectionText.includes(flag.id));
  }
  assert.ok(!projectionText.includes("FLAG{"));
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
  assert.equal(engine.exportState().seenEventFingerprints.length, 1);

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
      const routePrefix = ["web", "smb", "nfs"][entranceIndex];
      const routeSuffix = ["sudo", "timer", "suid"][rootIndex];
      assert.equal(
        projection.completion.routeId,
        `${routePrefix}-${routeSuffix}`,
      );
      assert.ok(
        projection.facts.some((fact) => fact.label === "Debian root"),
      );
    });
  }
}

test("thirteen Debian flags remain optional and root completion is event-based", () => {
  assert.equal(WORLD.flags.length, 13);
  assert.ok(WORLD.flags.every((flag) => !flag.manualOnly));

  const sessionId = "optional-flags";
  const engine = new SessionEngine({ sessionId });
  const routes = ["event-foothold-web", "event-route-sudo"];
  routes.forEach((routeId, index) => {
    engine.applyEvent(
      eventFor(
        routeId,
        sessionId,
        `2026-07-27T00:00:${String(index).padStart(2, "0")}.000Z`,
      ),
    );
  });
  const projection = engine.getProjection();
  assert.equal(projection.status, "complete");
  assert.equal(projection.progress.discovered, 3);
  assert.equal(projection.completion.routeId, "web-sudo");
  const projectionText = JSON.stringify(projection);
  for (const flag of WORLD.flags) {
    assert.ok(!projectionText.includes(flag.id));
  }
  assert.ok(!projectionText.includes("FLAG{"));
});

test("root completion is the final accepted automatic state transition", () => {
  const sessionId = "root-final-event";
  const engine = new SessionEngine({ sessionId });
  engine.applyEvent(eventFor("event-foothold-web", sessionId));
  engine.applyEvent(eventFor("event-route-sudo", sessionId));
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
  assert.equal(afterRoot.projection.progress.discovered, 3);
});

test("unavailable detector preserves the last state without a flag fallback", () => {
  const engine = new SessionEngine({
    sessionId: "detector-down",
    telemetryStatus: "unavailable",
  });
  const result = engine.applyEvent(
    eventFor("event-entry-smb", "detector-down"),
  );
  assert.equal(result.changed, false);
  assert.equal(result.projection.progress.discovered, 0);
  assert.equal(result.projection.capabilities.manualFlagSubmission, false);
  assert.match(result.projection.telemetry.message, /自動検出が停止/);
  const hiddenReason = engine.applyGuidance(
    "explainNoProgress.off",
  ).projection;
  assert.ok(!Object.hasOwn(hiddenReason.telemetry, "message"));
});

test("guidance defaults to EASY and remains changeable mid-session", () => {
  const engine = new SessionEngine({ sessionId: "hints" });
  let projection = engine.getProjection();
  assert.ok(projection.hints.every((hint) => hint.state === "unlocked"));
  assert.equal(projection.hints.length, 4);

  projection = engine.applyGuidance("preset.hard").projection;
  assert.equal(projection.hints[0].state, "available");
  assert.equal(projection.hints[1].state, "locked");
  assert.equal(projection.lede, "確定した事実から次を選びます。");
  assert.equal(
    projection.hypotheses[0].summary,
    "この仮説を確かめます。",
  );

  projection = engine.unlockHint("hyp-service-inventory:1").projection;
  assert.equal(projection.hints[0].state, "unlocked");
  assert.ok(projection.hints[0].body);
  assert.ok(!Object.hasOwn(projection.hints[1], "body"));
  assert.throws(
    () => engine.unlockHint("hyp-service-inventory:4"),
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
  assert.equal(projection.hints[0].title, "確かめること");
  assert.ok(projection.hints.every((hint) => !Object.hasOwn(hint, "body")));

  projection = engine.applyGuidance("preset.easy").projection;
  assert.ok(projection.hints.every((hint) => hint.state === "unlocked"));
  assert.ok(projection.hints.every((hint) => hint.body));
  assert.ok(
    projection.facts.some(
      (fact) => fact.label === "スタッフ用の診断画面",
    ),
  );
});

test("visible location is deterministic when discoveries arrive in another order", () => {
  const left = new SessionEngine({ sessionId: "same-state" });
  const right = new SessionEngine({ sessionId: "same-state" });
  left.applyEvent(eventFor("event-entry-web", "same-state"));
  left.applyEvent(
    eventFor(
      "event-entry-smb",
      "same-state",
      "2026-07-27T00:00:01.000Z",
    ),
  );
  right.applyEvent(eventFor("event-entry-smb", "same-state"));
  right.applyEvent(
    eventFor(
      "event-entry-web",
      "same-state",
      "2026-07-27T00:00:01.000Z",
    ),
  );

  const visible = (projection) => ({
    ...projection,
    recentEvents: [],
  });
  assert.deepEqual(
    visible(left.getProjection()),
    visible(right.getProjection()),
  );
});
