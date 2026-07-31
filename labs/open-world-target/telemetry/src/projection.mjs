function byId(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function recentEventMessage(world, item) {
  return (
    world.eventRoutes.find((route) => route.id === item.routeId)?.message ??
    "新しい事実を確認した。"
  );
}

function unlockedHypothesisIds(world, discovered) {
  const unlocked = new Set(world.initialHypothesisIds);
  for (const node of world.nodes) {
    if (!discovered.has(node.id)) continue;
    node.unlockHypothesisIds.forEach((id) => unlocked.add(id));
  }
  return world.hypotheses
    .map((hypothesis) => hypothesis.id)
    .filter((id) => unlocked.has(id));
}

function automaticHintDepth(guidance) {
  let depth = guidance.showNextChoices ? 1 : 0;
  if (guidance.showToolNames) depth = Math.max(depth, 2);
  if (guidance.showCommandSyntax) depth = Math.max(depth, 3);
  if (guidance.showCommandExamples) depth = Math.max(depth, 4);
  return depth;
}

function iconForInvestigation(node) {
  if (!node) return "terminal";
  if (node.kind === "entrance") return node.icon;
  if (node.kind === "root-clue") return "terminal";
  return node.icon ?? "terminal";
}

export function buildProjection(world, state) {
  const nodes = byId(world.nodes);
  const hypotheses = byId(world.hypotheses);
  const discovered = new Set(state.discoveredNodeIds);
  const selectedHypothesis = hypotheses.get(state.selectedHypothesisId) ?? null;
  const unlockedIds = unlockedHypothesisIds(world, discovered);
  const fullExplanation = state.guidance.explanationDepth === "full";

  const visibleNodeIds = new Set([
    ...world.entranceIds,
    ...state.discoveredNodeIds,
  ]);
  if (state.guidance.silhouetteDepth > 0) {
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
        isDiscovered && selectedHypothesis?.anchorNodeId === node.id;
      const projected = {
        id: node.mapId,
        state: isSelected
          ? "selected"
          : isDiscovered
            ? "discovered"
            : "undiscovered",
        category: node.publicCategory,
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
    .map((edge, index) => ({
      id: `edge-${index + 1}`,
      from: nodes.get(edge.from).mapId,
      to: nodes.get(edge.to).mapId,
      state:
        discovered.has(edge.from) && discovered.has(edge.to)
          ? "known"
          : "possible",
    }));

  const projectedHypotheses = unlockedIds.map((hypothesisId) => {
    const hypothesis = hypotheses.get(hypothesisId);
    return {
      id: hypothesis.id,
      label: hypothesis.label,
      summary: fullExplanation
        ? hypothesis.summary
        : "この仮説を確かめます。",
      selected: hypothesis.id === state.selectedHypothesisId,
      available: true,
    };
  });

  const projectedInvestigations = state.guidance.showNextChoices
    ? projectedHypotheses.slice(0, 3).map((hypothesis) => {
        const definition = hypotheses.get(hypothesis.id);
        const anchor = nodes.get(definition.anchorNodeId);
        return {
          id: `investigation-${hypothesis.id}`,
          label: hypothesis.label,
          summary: fullExplanation
            ? hypothesis.summary
            : "この方向を確かめます。",
          icon: iconForInvestigation(anchor),
          hypothesisId: hypothesis.id,
        };
      })
    : [];

  const hintUnlockCount =
    state.hintUnlocks[state.selectedHypothesisId] ?? 0;
  const effectiveHintDepth = Math.max(
    hintUnlockCount,
    automaticHintDepth(state.guidance),
  );
  const projectedHints = selectedHypothesis
    ? selectedHypothesis.hints.map((hint, index) => {
        const step = index + 1;
        const hintState =
          index < effectiveHintDepth
            ? "unlocked"
            : index === effectiveHintDepth
              ? "available"
              : "locked";
        const projected = {
          id: `${selectedHypothesis.id}:${step}`,
          step,
          title: hint.title,
          state: hintState,
        };
        if (hintState === "unlocked") projected.body = hint.body;
        if (hintState !== "unlocked") {
          projected.condition =
            step === 1
              ? "必要な時に開けます"
              : "前の説明を確認すると開けます";
        }
        return projected;
      })
    : [];

  const completed = discovered.has("root-common");
  const objective = completed
    ? "入口からrootまでの因果を振り返る"
    : selectedHypothesis?.label ?? "見えている入口を一つ確かめる";

  return {
    experience: "live",
    sessionId: state.sessionId,
    status: completed ? "complete" : "active",
    revision: state.revision,
    heading: "風切モータースの業務環境を調べる",
    lede: fullExplanation
      ? "確定した事実をつなぎ、次に確かめることを選びます。"
      : "確定した事実から次を選びます。",
    objective,
    consultationQuestion: completed
      ? fullExplanation
        ? "どの事実と権限変化がrootへつながりましたか？"
        : "rootまでの道を振り返ります。"
      : fullExplanation
        ? "現在の事実から、次に何を確かめますか？"
        : "次は何を確かめますか？",
    facts: world.nodes
      .filter((node) => discovered.has(node.id))
      .map((node) => ({
        id: node.mapId,
        label: node.label,
        ...(fullExplanation ? { detail: node.detail } : {}),
        icon: node.icon,
      })),
    hypotheses: projectedHypotheses,
    investigations: projectedInvestigations,
    graph: {
      nodes: graphNodes,
      edges: graphEdges,
    },
    hints: projectedHints,
    guidance: { ...state.guidance },
    progress: {
      discovered: state.discoveredNodeIds.length,
      total: world.nodes.length,
    },
    ...(completed && state.completedRouteId
      ? { completion: { routeId: state.completedRouteId } }
      : {}),
    recentEvents: state.recentEvents.map((item) => ({
      id: item.id,
      at: item.at,
      message: recentEventMessage(world, item),
    })),
    telemetry: {
      status: state.telemetryStatus,
      ...(state.guidance.explainNoProgress &&
      state.telemetryStatus === "unavailable"
        ? {
            message:
              "自動検出が停止しているため、新しい発見は反映されません。",
          }
        : state.guidance.explainNoProgress &&
            state.telemetryStatus === "reconnecting"
          ? { message: "自動検出との接続を戻しています。" }
          : {}),
    },
    capabilities: {
      manualFlagSubmission: false,
    },
  };
}
