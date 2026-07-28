function byId(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function recentEventMessage(world, item) {
  if (item.routeId === "manual.flag.accepted") {
    const node = world.nodes.find((candidate) => candidate.id === item.nodeId);
    return `${node?.label ?? "flag"}を手動提出で確認した。`;
  }
  return (
    world.eventRoutes.find((route) => route.id === item.routeId)?.message ??
    "新しい事実を確認した。"
  );
}

export function buildProjection(world, state) {
  const nodes = byId(world.nodes);
  const hypotheses = byId(world.hypotheses);
  const discovered = new Set(state.discoveredNodeIds);
  const selectedHypothesis = hypotheses.get(state.selectedHypothesisId) ?? null;

  const visibleNodeIds = new Set(discovered);
  for (const entranceId of world.entranceIds) {
    visibleNodeIds.add(entranceId);
  }
  if (discovered.size > 0) {
    for (const edge of world.edges) {
      if (discovered.has(edge.from)) visibleNodeIds.add(edge.to);
      if (discovered.has(edge.to)) visibleNodeIds.add(edge.from);
    }
  }

  const graphNodes = world.nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .map((node) => {
      const isDiscovered = discovered.has(node.id);
      const isSelected =
        selectedHypothesis?.anchorNodeId === node.id && visibleNodeIds.has(node.id);
      const projected = {
        id: node.mapId,
        state: isSelected
          ? "selected"
          : isDiscovered
            ? "discovered"
            : "undiscovered",
      };
      if (isDiscovered) {
        projected.label = node.label;
        projected.detail = node.detail;
        projected.kind = node.kind;
        projected.icon = node.icon;
        projected.progress = "発見済み";
      }
      return projected;
    });

  const visibleMapIds = new Set(graphNodes.map((node) => node.id));
  const graphEdges = world.edges
    .filter((edge) => {
      const from = nodes.get(edge.from);
      const to = nodes.get(edge.to);
      return (
        visibleMapIds.has(from.mapId) &&
        visibleMapIds.has(to.mapId) &&
        (discovered.has(edge.from) || discovered.has(edge.to))
      );
    })
    .map((edge) => ({
      from: nodes.get(edge.from).mapId,
      to: nodes.get(edge.to).mapId,
      state:
        discovered.has(edge.from) && discovered.has(edge.to)
          ? "discovered"
          : "available",
    }));

  const projectedHypotheses = state.unlockedHypothesisIds.map(
    (hypothesisId) => {
      const hypothesis = hypotheses.get(hypothesisId);
      return {
        id: hypothesis.id,
        label: hypothesis.label,
        summary: hypothesis.summary,
        selected: hypothesis.id === state.selectedHypothesisId,
        available: true,
      };
    },
  );

  const hintUnlockCount =
    state.hintUnlocks[state.selectedHypothesisId] ?? 0;
  const projectedHints = selectedHypothesis
    ? selectedHypothesis.hints.map((hint, index) => {
        const step = index + 1;
        const hintState =
          index < hintUnlockCount
            ? "unlocked"
            : index === hintUnlockCount
              ? "available"
              : "locked";
        const projected = {
          id: `${selectedHypothesis.id}:${step}`,
          step,
          title: hint.title,
          state: hintState,
        };
        if (hintState === "unlocked") projected.body = hint.body;
        return projected;
      })
    : [];

  return {
    experience: "live",
    sessionId: state.sessionId,
    status: state.capturedFlagIds.includes("flag-root-common")
      ? "complete"
      : "active",
    revision: state.revision,
    facts: state.discoveredNodeIds.map((nodeId) => {
      const node = nodes.get(nodeId);
      return {
        id: node.mapId,
        label: node.label,
        detail: node.detail,
        icon: node.icon,
      };
    }),
    hypotheses: projectedHypotheses,
    graph: {
      nodes: graphNodes,
      edges: graphEdges,
    },
    hints: projectedHints,
    progress: {
      discovered: state.capturedFlagIds.length,
      total: world.flags.length,
    },
    recentEvents: state.recentEvents.map((item) => ({
      id: item.id,
      at: item.at,
      message: recentEventMessage(world, item),
    })),
    telemetry: {
      status: state.telemetryStatus,
    },
    capabilities: {
      manualFlagSubmission: true,
    },
  };
}
