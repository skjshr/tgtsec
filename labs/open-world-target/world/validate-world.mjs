import { pathToFileURL } from "node:url";

import {
  getVerifierFlagIds,
} from "./flag-verifiers.mjs";
import { WORLD } from "./world-definition.mjs";

const EXPECTED_FLAG_COUNTS = Object.freeze({
  entry: 3,
  foothold: 3,
  "root-clue": 3,
  "root-route": 3,
  "common-root": 1,
  windows: 1,
});
const ALLOWED_ICONS = new Set([
  "browser",
  "calendar",
  "door",
  "file",
  "folder",
  "globe",
  "network",
  "server",
  "terminal",
  "user",
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertUnique(values, label) {
  assert(
    new Set(values).size === values.length,
    `${label} must contain unique values`,
  );
}

function isReachable(adjacency, from, to) {
  const queue = [from];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

export function validateWorld(world = WORLD) {
  assert(world.version === 1, "world version must be 1");
  assert(world.entranceIds.length === 3, "world must define 3 entrances");
  assert(world.footholdIds.length === 3, "world must define 3 footholds");
  assert(world.rootPathIds.length === 3, "world must define 3 root paths");
  assert(world.nodes.length === 14, "world must define 14 flag-bearing nodes");
  assert(world.flags.length === 14, "world must define 14 flags");

  const nodeIds = world.nodes.map((node) => node.id);
  const mapIds = world.nodes.map((node) => node.mapId);
  const flagIds = world.flags.map((flag) => flag.id);
  const hypothesisIds = world.hypotheses.map((hypothesis) => hypothesis.id);
  const eventRouteIds = world.eventRoutes.map((route) => route.id);

  assertUnique(nodeIds, "node ids");
  assertUnique(mapIds, "map ids");
  assertUnique(flagIds, "flag ids");
  assertUnique(
    world.flags.map((flag) => flag.nodeId),
    "flag node ids",
  );
  assertUnique(hypothesisIds, "hypothesis ids");
  assertUnique(eventRouteIds, "event route ids");

  const nodeIdSet = new Set(nodeIds);
  const flagIdSet = new Set(flagIds);
  const hypothesisIdSet = new Set(hypothesisIds);

  for (const node of world.nodes) {
    assert(
      ALLOWED_ICONS.has(node.icon),
      `node ${node.id} must use a guide-compatible icon`,
    );
    assert(flagIdSet.has(node.flagId), `node ${node.id} has an unknown flag`);
    for (const hypothesisId of node.unlockHypothesisIds) {
      assert(
        hypothesisIdSet.has(hypothesisId),
        `node ${node.id} unlocks an unknown hypothesis`,
      );
    }
  }

  for (const edge of world.edges) {
    assert(nodeIdSet.has(edge.from), `edge source ${edge.from} is unknown`);
    assert(nodeIdSet.has(edge.to), `edge target ${edge.to} is unknown`);
  }

  for (const flag of world.flags) {
    assert(nodeIdSet.has(flag.nodeId), `flag ${flag.id} has an unknown node`);
    assert(
      !flag.location.startsWith("/") && !flag.location.includes(".."),
      `flag ${flag.id} must have a safe relative location`,
    );
  }

  const verifierFlagIds = getVerifierFlagIds();
  assertUnique(verifierFlagIds, "verifier flag ids");
  assert(
    verifierFlagIds.length === flagIds.length &&
      verifierFlagIds.every((flagId) => flagIdSet.has(flagId)),
    "public verifiers must match the 14 logical flags exactly",
  );

  for (const [category, expectedCount] of Object.entries(
    EXPECTED_FLAG_COUNTS,
  )) {
    const actualCount = world.flags.filter(
      (flag) => flag.category === category,
    ).length;
    assert(
      actualCount === expectedCount,
      `${category} flags must total ${expectedCount}, got ${actualCount}`,
    );
  }

  for (const hypothesis of world.hypotheses) {
    assert(
      hypothesis.hints.length === 3,
      `hypothesis ${hypothesis.id} must have exactly 3 hint stages`,
    );
    assert(
      hypothesis.hints.map((hint) => hint.title).join("|") ===
        "見る場所|使う道具|操作例",
      `hypothesis ${hypothesis.id} must use the accepted hint order`,
    );
    if (hypothesis.anchorNodeId !== null) {
      assert(
        nodeIdSet.has(hypothesis.anchorNodeId),
        `hypothesis ${hypothesis.id} has an unknown anchor`,
      );
    }
  }

  const adjacency = new Map(
    nodeIds.map((nodeId) => [
      nodeId,
      world.edges
        .filter((edge) => edge.from === nodeId)
        .map((edge) => edge.to),
    ]),
  );

  const viableCombinations = [];
  for (const [index, entranceId] of world.entranceIds.entries()) {
    const footholdId = world.footholdIds[index];
    assert(
      isReachable(adjacency, entranceId, footholdId),
      `${entranceId} must reach ${footholdId}`,
    );
    for (const rootPathId of world.rootPathIds) {
      assert(
        isReachable(adjacency, footholdId, rootPathId),
        `${footholdId} must reach ${rootPathId}`,
      );
      viableCombinations.push({ entranceId, footholdId, rootPathId });
    }
  }
  assert(
    viableCombinations.length === 9,
    "world must have 9 entrance/root combinations",
  );

  const routeKeys = world.eventRoutes.map(
    ({ kind, nodeId, sourceId, evidenceCode }) =>
      `${kind}\u0000${nodeId}\u0000${sourceId}\u0000${evidenceCode}`,
  );
  assertUnique(routeKeys, "event source combinations");

  for (const route of world.eventRoutes) {
    assert(nodeIdSet.has(route.nodeId), `event ${route.id} has an unknown node`);
    assert(
      /^[a-z0-9_.-]+$/.test(route.kind) &&
        /^[a-z0-9_.-]+$/.test(route.sourceId) &&
        /^[a-z0-9_.-]+$/.test(route.evidenceCode),
      `event ${route.id} contains a non-allowlist identifier`,
    );
  }

  for (const flag of world.flags) {
    const eventCount = world.eventRoutes.filter(
      (route) => route.nodeId === flag.nodeId,
    ).length;
    if (flag.manualOnly) {
      assert(eventCount === 0, `${flag.id} must remain manual-only`);
    } else {
      assert(eventCount >= 1, `${flag.id} needs an automatic event route`);
    }
  }

  return Object.freeze({
    entrances: world.entranceIds.length,
    footholds: world.footholdIds.length,
    rootPaths: world.rootPathIds.length,
    flags: world.flags.length,
    viableCombinations,
  });
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;
if (invokedPath === import.meta.url) {
  const result = validateWorld();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
