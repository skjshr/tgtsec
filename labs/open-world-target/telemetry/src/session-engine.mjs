import { EventEmitter } from "node:events";

import { WORLD } from "../../world/world-definition.mjs";
import {
  buildEventRouteIndex,
  validateEvent,
} from "./event-validator.mjs";
import { LabError } from "./errors.mjs";
import { buildProjection } from "./projection.mjs";

const TELEMETRY_STATUSES = new Set([
  "live",
  "reconnecting",
  "unavailable",
]);
const MAX_RECENT_EVENTS = 20;
const GUIDANCE_BOOLEAN_FIELDS = Object.freeze([
  "showNextChoices",
  "showToolNames",
  "showCommandSyntax",
  "showCommandExamples",
  "explainNoProgress",
]);

export const GUIDANCE_PRESETS = Object.freeze({
  easy: Object.freeze({
    showNextChoices: true,
    showToolNames: true,
    showCommandSyntax: true,
    showCommandExamples: true,
    explainNoProgress: true,
    explanationDepth: "full",
    silhouetteDepth: 1,
  }),
  normal: Object.freeze({
    showNextChoices: true,
    showToolNames: true,
    showCommandSyntax: true,
    showCommandExamples: false,
    explainNoProgress: true,
    explanationDepth: "full",
    silhouetteDepth: 1,
  }),
  hard: Object.freeze({
    showNextChoices: false,
    showToolNames: false,
    showCommandSyntax: false,
    showCommandExamples: false,
    explainNoProgress: false,
    explanationDepth: "brief",
    silhouetteDepth: 0,
  }),
});

export const GUIDANCE_COMMAND_IDS = Object.freeze([
  "preset.easy",
  "preset.normal",
  "preset.hard",
  ...GUIDANCE_BOOLEAN_FIELDS.flatMap((field) => [
    `${field}.on`,
    `${field}.off`,
  ]),
  "explanationDepth.brief",
  "explanationDepth.full",
  "silhouetteDepth.0",
  "silhouetteDepth.1",
]);

function cloneGuidance(value) {
  return {
    showNextChoices: value.showNextChoices,
    showToolNames: value.showToolNames,
    showCommandSyntax: value.showCommandSyntax,
    showCommandExamples: value.showCommandExamples,
    explainNoProgress: value.explainNoProgress,
    explanationDepth: value.explanationDepth,
    silhouetteDepth: value.silhouetteDepth,
  };
}

function exactObjectKeys(value, expected, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(`${label} contains unsupported fields`);
  }
}

function validateGuidance(value) {
  const keys = [
    ...GUIDANCE_BOOLEAN_FIELDS,
    "explanationDepth",
    "silhouetteDepth",
  ];
  exactObjectKeys(value, keys, "stored guidance");
  if (GUIDANCE_BOOLEAN_FIELDS.some((field) => typeof value[field] !== "boolean")) {
    throw new Error("stored guidance contains a non-boolean option");
  }
  if (!["brief", "full"].includes(value.explanationDepth)) {
    throw new Error("stored guidance explanation depth is invalid");
  }
  if (![0, 1].includes(value.silhouetteDepth)) {
    throw new Error("stored guidance silhouette depth is invalid");
  }
  return cloneGuidance(value);
}

export function guidancePresetFor(value) {
  const serialized = JSON.stringify(validateGuidance(value));
  for (const [preset, guidance] of Object.entries(GUIDANCE_PRESETS)) {
    if (JSON.stringify(guidance) === serialized) return preset;
  }
  return "custom";
}

export function applyGuidanceCommand(current, commandId) {
  if (
    typeof commandId !== "string" ||
    !GUIDANCE_COMMAND_IDS.includes(commandId)
  ) {
    throw new LabError(
      "invalid_guidance",
      "この表示設定は利用できません。",
      400,
    );
  }
  if (commandId.startsWith("preset.")) {
    return cloneGuidance(GUIDANCE_PRESETS[commandId.slice(7)]);
  }

  const [field, value] = commandId.split(".");
  const next = validateGuidance(current);
  if (GUIDANCE_BOOLEAN_FIELDS.includes(field)) {
    next[field] = value === "on";
  } else if (field === "explanationDepth") {
    next.explanationDepth = value;
  } else if (field === "silhouetteDepth") {
    next.silhouetteDepth = Number(value);
  }
  return validateGuidance(next);
}

function uniqueKnown(values, knownIds, label) {
  if (!Array.isArray(values) || values.some((value) => !knownIds.has(value))) {
    throw new Error(`stored ${label} contains unknown values`);
  }
  return [...new Set(values)];
}

function orderedKnown(values, orderedIds) {
  const selected = new Set(values);
  return orderedIds.filter((id) => selected.has(id));
}

function unlockedHypothesisIdsFor(world, discoveredNodeIds) {
  const unlocked = new Set(world.initialHypothesisIds);
  const discovered = new Set(discoveredNodeIds);
  for (const node of world.nodes) {
    if (!discovered.has(node.id)) continue;
    node.unlockHypothesisIds.forEach((id) => unlocked.add(id));
  }
  return world.hypotheses
    .map((hypothesis) => hypothesis.id)
    .filter((id) => unlocked.has(id));
}

function routeAchievementFor(world, footholdId, rootPathId) {
  return (
    world.routeAchievements.find(
      (route) =>
        route.footholdId === footholdId && route.rootPathId === rootPathId,
    )?.id ?? null
  );
}

function createInitialState(world, sessionId, telemetryStatus) {
  return {
    version: 2,
    sessionId,
    revision: 0,
    discoveredNodeIds: [],
    selectedHypothesisId: world.initialHypothesisIds[0] ?? null,
    hintUnlocks: Object.fromEntries(
      world.initialHypothesisIds.map((hypothesisId) => [hypothesisId, 0]),
    ),
    guidance: cloneGuidance(GUIDANCE_PRESETS.easy),
    activeFootholdId: null,
    completedRootPathId: null,
    completedRouteId: null,
    seenEventFingerprints: [],
    recentEvents: [],
    telemetryStatus,
  };
}

function validIso(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function restoreState(world, sessionId, telemetryStatus, storedState) {
  if (!storedState) return createInitialState(world, sessionId, telemetryStatus);
  if (
    ![1, 2].includes(storedState.version) ||
    storedState.sessionId !== sessionId ||
    !Number.isSafeInteger(storedState.revision) ||
    storedState.revision < 0
  ) {
    throw new Error("stored state does not match this session");
  }

  const orderedNodeIds = world.nodes.map((node) => node.id);
  const nodeIds = new Set(orderedNodeIds);
  const hypothesisIds = new Set(
    world.hypotheses.map((hypothesis) => hypothesis.id),
  );
  const routeIds = new Set(world.eventRoutes.map((route) => route.id));
  const discoveredInput = uniqueKnown(
    storedState.discoveredNodeIds,
    nodeIds,
    "nodes",
  );
  const discoveredNodeIds = orderedKnown(discoveredInput, orderedNodeIds);
  const unlockedHypothesisIds = unlockedHypothesisIdsFor(
    world,
    discoveredNodeIds,
  );
  const selectedHypothesisId = storedState.selectedHypothesisId;
  if (
    selectedHypothesisId !== null &&
    (!hypothesisIds.has(selectedHypothesisId) ||
      !unlockedHypothesisIds.includes(selectedHypothesisId))
  ) {
    throw new Error("stored selected hypothesis is not unlocked");
  }

  if (
    storedState.hintUnlocks === null ||
    typeof storedState.hintUnlocks !== "object" ||
    Array.isArray(storedState.hintUnlocks) ||
    Object.keys(storedState.hintUnlocks).some(
      (hypothesisId) => !hypothesisIds.has(hypothesisId),
    )
  ) {
    throw new Error("stored hint state is invalid");
  }
  const hintUnlocks = {};
  for (const hypothesisId of unlockedHypothesisIds) {
    const hypothesis = world.hypotheses.find(
      (candidate) => candidate.id === hypothesisId,
    );
    const value = storedState.hintUnlocks[hypothesisId] ?? 0;
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > hypothesis.hints.length
    ) {
      throw new Error("stored hint state is invalid");
    }
    hintUnlocks[hypothesisId] = value;
  }

  if (
    !Array.isArray(storedState.seenEventFingerprints) ||
    storedState.seenEventFingerprints.some(
      (value) => typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value),
    )
  ) {
    throw new Error("stored event fingerprints are invalid");
  }
  if (
    !Array.isArray(storedState.recentEvents) ||
    storedState.recentEvents.some(
      (event) =>
        event === null ||
        typeof event !== "object" ||
        !routeIds.has(event.routeId) ||
        !nodeIds.has(event.nodeId) ||
        typeof event.id !== "string" ||
        !/^event-\d+$/.test(event.id) ||
        !validIso(event.at),
    )
  ) {
    throw new Error("stored recent events are invalid");
  }

  const discoveredOrder = storedState.discoveredNodeIds;
  const migratedActiveFoothold =
    storedState.version === 1
      ? [...discoveredOrder]
          .reverse()
          .find((id) => world.footholdIds.includes(id)) ?? null
      : storedState.activeFootholdId;
  const migratedRootPath =
    storedState.version === 1
      ? [...discoveredOrder]
          .reverse()
          .find((id) => world.rootPathIds.includes(id)) ?? null
      : storedState.completedRootPathId;

  if (
    migratedActiveFoothold !== null &&
    !world.footholdIds.includes(migratedActiveFoothold)
  ) {
    throw new Error("stored active foothold is invalid");
  }
  if (
    migratedRootPath !== null &&
    !world.rootPathIds.includes(migratedRootPath)
  ) {
    throw new Error("stored completed root path is invalid");
  }
  const derivedRouteId = routeAchievementFor(
    world,
    migratedActiveFoothold,
    migratedRootPath,
  );
  if (
    storedState.version === 2 &&
    storedState.completedRouteId !== derivedRouteId
  ) {
    throw new Error("stored completed route does not match its path");
  }

  return {
    version: 2,
    sessionId,
    revision: storedState.revision,
    discoveredNodeIds,
    selectedHypothesisId,
    hintUnlocks,
    guidance:
      storedState.version === 2
        ? validateGuidance(storedState.guidance)
        : cloneGuidance(GUIDANCE_PRESETS.easy),
    activeFootholdId: migratedActiveFoothold,
    completedRootPathId: migratedRootPath,
    completedRouteId: derivedRouteId,
    seenEventFingerprints: [
      ...new Set(storedState.seenEventFingerprints),
    ].sort(),
    recentEvents: storedState.recentEvents.slice(-MAX_RECENT_EVENTS).map(
      ({ id, at, routeId, nodeId }) => ({ id, at, routeId, nodeId }),
    ),
    telemetryStatus,
  };
}

export class SessionEngine extends EventEmitter {
  constructor({
    world = WORLD,
    sessionId,
    telemetryStatus = "live",
    storedState = null,
    now = () => new Date().toISOString(),
  }) {
    super();
    if (
      typeof sessionId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(sessionId)
    ) {
      throw new Error("sessionId must be a safe non-empty identifier");
    }
    if (!TELEMETRY_STATUSES.has(telemetryStatus)) {
      throw new Error("unknown telemetry status");
    }
    this.world = world;
    this.now = now;
    this.routeIndex = buildEventRouteIndex(world);
    this.nodeIndex = new Map(world.nodes.map((node) => [node.id, node]));
    this.hypothesisIndex = new Map(
      world.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]),
    );
    this.state = restoreState(
      world,
      sessionId,
      telemetryStatus,
      storedState,
    );
  }

  getProjection() {
    return buildProjection(this.world, this.state);
  }

  exportState() {
    return structuredClone(this.state);
  }

  #announceChange() {
    this.emit("change", this.getProjection());
  }

  #commitEvent(route, at) {
    const nodesToDiscover = [route.nodeId];
    if (
      route.kind === "root_path.completed" &&
      !nodesToDiscover.includes("root-common")
    ) {
      nodesToDiscover.push("root-common");
    }

    let changed = false;
    for (const nodeId of nodesToDiscover) {
      if (!this.nodeIndex.has(nodeId)) {
        throw new Error(`unknown node: ${nodeId}`);
      }
      if (!this.state.discoveredNodeIds.includes(nodeId)) {
        this.state.discoveredNodeIds.push(nodeId);
        changed = true;
      }
    }
    this.state.discoveredNodeIds = orderedKnown(
      this.state.discoveredNodeIds,
      this.world.nodes.map((node) => node.id),
    );

    if (
      route.kind === "foothold.acquired" &&
      this.state.activeFootholdId !== route.nodeId
    ) {
      this.state.activeFootholdId = route.nodeId;
      changed = true;
    }
    if (
      route.kind === "root_path.completed" &&
      this.state.completedRootPathId !== route.nodeId
    ) {
      this.state.completedRootPathId = route.nodeId;
      changed = true;
    }

    const nextRouteId = routeAchievementFor(
      this.world,
      this.state.activeFootholdId,
      this.state.completedRootPathId,
    );
    if (this.state.completedRouteId !== nextRouteId) {
      this.state.completedRouteId = nextRouteId;
      changed = true;
    }

    const unlocked = unlockedHypothesisIdsFor(
      this.world,
      this.state.discoveredNodeIds,
    );
    for (const hypothesisId of unlocked) {
      if (!Object.hasOwn(this.state.hintUnlocks, hypothesisId)) {
        this.state.hintUnlocks[hypothesisId] = 0;
        changed = true;
      }
    }

    if (!changed) return false;
    this.state.revision += 1;
    this.state.recentEvents.push({
      id: `event-${this.state.revision}`,
      at,
      routeId: route.id,
      nodeId: route.nodeId,
    });
    this.state.recentEvents = this.state.recentEvents.slice(
      -MAX_RECENT_EVENTS,
    );
    this.#announceChange();
    return true;
  }

  applyEvent(input) {
    const { event, route, fingerprint } = validateEvent(input, {
      world: this.world,
      sessionId: this.state.sessionId,
      routeIndex: this.routeIndex,
    });
    if (this.state.telemetryStatus === "unavailable") {
      return { accepted: true, changed: false, projection: this.getProjection() };
    }
    if (this.state.discoveredNodeIds.includes("root-common")) {
      return { accepted: true, changed: false, projection: this.getProjection() };
    }
    if (this.state.seenEventFingerprints.includes(fingerprint)) {
      return { accepted: true, changed: false, projection: this.getProjection() };
    }

    this.state.seenEventFingerprints.push(fingerprint);
    this.state.seenEventFingerprints.sort();
    const changed = this.#commitEvent(route, event.occurredAt);
    if (!changed) {
      this.state.seenEventFingerprints =
        this.state.seenEventFingerprints.filter(
          (storedFingerprint) => storedFingerprint !== fingerprint,
        );
    }
    return { accepted: true, changed, projection: this.getProjection() };
  }

  selectHypothesis(hypothesisId) {
    const unlocked = unlockedHypothesisIdsFor(
      this.world,
      this.state.discoveredNodeIds,
    );
    if (!unlocked.includes(hypothesisId)) {
      throw new LabError(
        "hypothesis_locked",
        "この仮説は、現在の事実からはまだ選べません。",
        409,
      );
    }
    if (this.state.selectedHypothesisId === hypothesisId) {
      return { changed: false, projection: this.getProjection() };
    }
    this.state.selectedHypothesisId = hypothesisId;
    this.state.revision += 1;
    this.#announceChange();
    return { changed: true, projection: this.getProjection() };
  }

  unlockHint(hintId) {
    if (typeof hintId !== "string") {
      throw new LabError("invalid_hint", "hint idが不正です。");
    }
    const selectedId = this.state.selectedHypothesisId;
    const hypothesis = this.hypothesisIndex.get(selectedId);
    const hintIndex = hypothesis?.hints.findIndex(
      (_hint, index) => `${selectedId}:${index + 1}` === hintId,
    );
    if (!hypothesis || hintIndex === -1) {
      throw new LabError(
        "hint_not_available",
        "現在選択している仮説のhintではありません。",
        409,
      );
    }

    const currentCount = this.state.hintUnlocks[selectedId] ?? 0;
    if (hintIndex < currentCount) {
      return { changed: false, projection: this.getProjection() };
    }
    if (hintIndex !== currentCount) {
      throw new LabError(
        "hint_order",
        "hintは目的、道具、組み立て方、操作例の順で開きます。",
        409,
      );
    }

    this.state.hintUnlocks[selectedId] = currentCount + 1;
    this.state.revision += 1;
    this.#announceChange();
    return { changed: true, projection: this.getProjection() };
  }

  applyGuidance(commandId) {
    const next = applyGuidanceCommand(this.state.guidance, commandId);
    if (JSON.stringify(next) === JSON.stringify(this.state.guidance)) {
      return { changed: false, projection: this.getProjection() };
    }
    this.state.guidance = next;
    this.state.revision += 1;
    this.#announceChange();
    return { changed: true, projection: this.getProjection() };
  }

  setTelemetryStatus(status) {
    if (!TELEMETRY_STATUSES.has(status)) {
      throw new Error("unknown telemetry status");
    }
    if (this.state.telemetryStatus === status) return false;
    this.state.telemetryStatus = status;
    this.state.revision += 1;
    this.#announceChange();
    return true;
  }
}
