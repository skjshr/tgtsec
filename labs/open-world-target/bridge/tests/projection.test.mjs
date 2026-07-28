import assert from "node:assert/strict";
import test from "node:test";

import {
  ProjectionBoundaryError,
  validateProjection,
} from "../src/projection.mjs";
import {
  ProjectionConflictError,
  ProjectionRollbackError,
  ProjectionTracker,
  projectionHash,
} from "../src/projection-state.mjs";
import { projection } from "./helpers.mjs";

test("projection boundary keeps public fields and disables cloud flags", () => {
  const value = projection({
    capabilities: { manualFlagSubmission: true },
  });
  const validated = validateProjection(value);

  assert.equal(validated.experience, "live");
  assert.equal(validated.sessionId, value.sessionId);
  assert.equal(validated.progress.total, 14);
  assert.deepEqual(validated.capabilities, {
    manualFlagSubmission: false,
  });
  assert.match(projectionHash(validated), /^[a-f0-9]{64}$/);
});

test("projection boundary rejects hidden, arbitrary, and flag material", () => {
  const hidden = projection();
  hidden.graph.nodes[0].label = "秘密の入口";
  assert.throws(
    () => validateProjection(hidden),
    ProjectionBoundaryError,
  );

  const lockedBody = projection();
  lockedBody.hints[1].body = "まだ見せない操作例";
  assert.throws(
    () => validateProjection(lockedBody),
    /must not reveal a locked hint/,
  );

  const arbitrary = projection({ command: "cat /etc/shadow" });
  assert.throws(
    () => validateProjection(arbitrary),
    /command is not allowed/,
  );

  const flag = projection();
  flag.telemetry.message = "FLAG{must-not-leave-target}";
  assert.throws(() => validateProjection(flag), ProjectionBoundaryError);

  for (const secret of [
    "password=supersecret",
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "authorization: bearer topsecret",
  ]) {
    const leakedSecret = projection();
    leakedSecret.telemetry.message = secret;
    assert.throws(
      () => validateProjection(leakedSecret),
      ProjectionBoundaryError,
    );
  }
});

test("projection tracker is monotonic and same-revision idempotent", () => {
  const tracker = new ProjectionTracker();
  const first = tracker.accept(projection());
  assert.equal(first.changed, true);

  const duplicate = tracker.accept(projection());
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.hash, first.hash);

  const changed = projection({
    revision: 1,
    facts: [
      {
        id: "map-01",
        label: "診断画面",
        detail: "スタッフ向けの入口を確認した。",
        icon: "browser",
      },
    ],
    graph: {
      nodes: [
        {
          id: "map-01",
          state: "discovered",
          label: "診断画面",
          detail: "スタッフ向けの入口を確認した。",
          icon: "browser",
          kind: "entrance",
          progress: "発見済み",
        },
        { id: "map-02", state: "undiscovered" },
        { id: "map-03", state: "undiscovered" },
      ],
      edges: [],
    },
    progress: { discovered: 1, total: 14 },
  });
  assert.equal(tracker.accept(changed).changed, true);
  assert.equal(tracker.current.revision, 1);

  assert.throws(
    () => tracker.accept(projection()),
    ProjectionRollbackError,
  );
});

test("projection tracker rejects changed payload or session at one revision", () => {
  const tracker = new ProjectionTracker();
  tracker.accept(projection());

  const conflict = projection();
  conflict.hypotheses[0].summary = "同じrevisionなのに内容が違う。";
  assert.throws(
    () => tracker.accept(conflict),
    ProjectionConflictError,
  );

  const otherSession = projection({ sessionId: "exercise-other-002" });
  assert.throws(
    () => tracker.accept(otherSession),
    ProjectionConflictError,
  );
});
