import { EventEmitter } from "node:events";

import {
  verifyFlagAnswer,
} from "../../world/flag-verifiers.mjs";
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

function uniqueKnown(values, knownIds, label) {
  if (!Array.isArray(values) || values.some((value) => !knownIds.has(value))) {
    throw new Error(`stored ${label} contains unknown values`);
  }
  return [...new Set(values)];
}

function createInitialState(world, sessionId, telemetryStatus) {
  return {
    version: 1,
    sessionId,
    revision: 0,
    discoveredNodeIds: [],
    capturedFlagIds: [],
    unlockedHypothesisIds: [...world.initialHypothesisIds],
    selectedHypothesisId: world.initialHypothesisIds[0] ?? null,
    hintUnlocks: Object.fromEntries(
      world.initialHypothesisIds.map((hypothesisId) => [hypothesisId, 0]),
    ),
    seenEventFingerprints: [],
    recentEvents: [],
    telemetryStatus,
  };
}

function restoreState(world, sessionId, telemetryStatus, storedState) {
  if (!storedState) return createInitialState(world, sessionId, telemetryStatus);
  if (
    storedState.version !== 1 ||
    storedState.sessionId !== sessionId ||
    !Number.isSafeInteger(storedState.revision) ||
    storedState.revision < 0
  ) {
    throw new Error("stored state does not match this session");
  }

  const nodeIds = new Set(world.nodes.map((node) => node.id));
  const flagIds = new Set(world.flags.map((flag) => flag.id));
  const hypothesisIds = new Set(
    world.hypotheses.map((hypothesis) => hypothesis.id),
  );
  const routeIds = new Set([
    ...world.eventRoutes.map((route) => route.id),
    "manual.flag.accepted",
  ]);
  const unlockedHypothesisIds = uniqueKnown(
    storedState.unlockedHypothesisIds,
    hypothesisIds,
    "hypotheses",
  );
  const selectedHypothesisId = storedState.selectedHypothesisId;
  if (
    selectedHypothesisId !== null &&
    !unlockedHypothesisIds.includes(selectedHypothesisId)
  ) {
    throw new Error("stored selected hypothesis is not unlocked");
  }

  const hintUnlocks = {};
  for (const hypothesisId of unlockedHypothesisIds) {
    const value = storedState.hintUnlocks?.[hypothesisId] ?? 0;
    if (!Number.isInteger(value) || value < 0 || value > 3) {
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
        typeof event.at !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
          event.at,
        ) ||
        Number.isNaN(Date.parse(event.at)),
    )
  ) {
    throw new Error("stored recent events are invalid");
  }

  return {
    version: 1,
    sessionId,
    revision: storedState.revision,
    discoveredNodeIds: uniqueKnown(
      storedState.discoveredNodeIds,
      nodeIds,
      "nodes",
    ),
    capturedFlagIds: uniqueKnown(
      storedState.capturedFlagIds,
      flagIds,
      "flags",
    ),
    unlockedHypothesisIds,
    selectedHypothesisId,
    hintUnlocks,
    seenEventFingerprints: [...new Set(storedState.seenEventFingerprints)],
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
    this.flagIndex = new Map(world.flags.map((flag) => [flag.id, flag]));
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

  #captureNode(nodeId, { at, routeId }) {
    const node = this.nodeIndex.get(nodeId);
    if (!node) throw new Error(`unknown node: ${nodeId}`);
    let changed = false;

    if (!this.state.discoveredNodeIds.includes(nodeId)) {
      this.state.discoveredNodeIds.push(nodeId);
      changed = true;
    }
    if (!this.state.capturedFlagIds.includes(node.flagId)) {
      this.state.capturedFlagIds.push(node.flagId);
      changed = true;
    }
    for (const hypothesisId of node.unlockHypothesisIds) {
      if (!this.state.unlockedHypothesisIds.includes(hypothesisId)) {
        this.state.unlockedHypothesisIds.push(hypothesisId);
        this.state.hintUnlocks[hypothesisId] = 0;
        changed = true;
      }
    }

    if (changed) {
      this.state.revision += 1;
      this.state.recentEvents.push({
        id: `event-${this.state.revision}`,
        at,
        routeId,
        nodeId,
      });
      this.state.recentEvents = this.state.recentEvents.slice(
        -MAX_RECENT_EVENTS,
      );
      this.#announceChange();
    }
    return changed;
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
    if (this.state.capturedFlagIds.includes("flag-root-common")) {
      return { accepted: true, changed: false, projection: this.getProjection() };
    }
    if (this.state.seenEventFingerprints.includes(fingerprint)) {
      return { accepted: true, changed: false, projection: this.getProjection() };
    }
    if (this.state.discoveredNodeIds.includes(route.nodeId)) {
      return { accepted: true, changed: false, projection: this.getProjection() };
    }

    this.state.seenEventFingerprints.push(fingerprint);
    const changed = this.#captureNode(route.nodeId, {
      at: event.occurredAt,
      routeId: route.id,
    });
    return { accepted: true, changed, projection: this.getProjection() };
  }

  selectHypothesis(hypothesisId) {
    if (!this.state.unlockedHypothesisIds.includes(hypothesisId)) {
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
        "hintは見る場所、使う道具、操作例の順で開きます。",
        409,
      );
    }

    this.state.hintUnlocks[selectedId] = currentCount + 1;
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

  submitManualFlag(candidate) {
    const rootWasCaptured =
      this.state.capturedFlagIds.includes("flag-root-common");
    if (
      this.state.telemetryStatus !== "unavailable" &&
      !rootWasCaptured
    ) {
      throw new LabError(
        "manual_fallback_inactive",
        "自動検出が利用できるため、手動提出は現在使いません。",
        409,
      );
    }

    const flagId = verifyFlagAnswer(candidate);
    if (!flagId) {
      return {
        accepted: false,
        changed: false,
        projection: this.getProjection(),
      };
    }

    const flag = this.flagIndex.get(flagId);
    if (
      this.state.telemetryStatus !== "unavailable" &&
      flag.manualOnly !== true
    ) {
      return {
        accepted: false,
        changed: false,
        projection: this.getProjection(),
      };
    }
    if (
      flag.manualOnly === true &&
      !rootWasCaptured
    ) {
      return {
        accepted: false,
        changed: false,
        projection: this.getProjection(),
      };
    }

    const changed = this.#captureNode(flag.nodeId, {
      at: this.now(),
      routeId: "manual.flag.accepted",
    });
    return { accepted: true, changed, projection: this.getProjection() };
  }
}
