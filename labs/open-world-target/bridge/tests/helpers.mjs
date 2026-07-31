export function projection(overrides = {}) {
  return {
    sessionId: "exercise-test-001",
    revision: 0,
    status: "active",
    facts: [],
    hypotheses: [
      {
        id: "hyp-service-inventory",
        label: "応答するサービスを整理する",
        summary: "見えている面を事実として並べる。",
        selected: true,
        available: true,
      },
    ],
    graph: {
      nodes: [
        { id: "map-01", state: "undiscovered", category: "Web" },
        { id: "map-02", state: "undiscovered", category: "共有" },
        { id: "map-03", state: "undiscovered", category: "整備" },
      ],
      edges: [],
    },
    hints: [
      {
        id: "hyp-service-inventory:1",
        step: 1,
        title: "見る場所",
        state: "available",
      },
      {
        id: "hyp-service-inventory:2",
        step: 2,
        title: "使う道具",
        state: "locked",
      },
      {
        id: "hyp-service-inventory:3",
        step: 3,
        title: "組み立て方",
        state: "locked",
      },
      {
        id: "hyp-service-inventory:4",
        step: 4,
        title: "操作例",
        state: "locked",
      },
    ],
    guidance: {
      showNextChoices: true,
      showToolNames: true,
      showCommandSyntax: true,
      showCommandExamples: true,
      explainNoProgress: true,
      explanationDepth: "full",
      silhouetteDepth: 1,
    },
    progress: {
      discovered: 0,
      total: 13,
    },
    recentEvents: [],
    telemetry: {
      status: "live",
    },
    ...overrides,
  };
}

export function jsonResponse(value, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function action(overrides = {}) {
  return {
    id: "action-001",
    type: "selectHypothesis",
    targetId: "hyp-service-inventory",
    createdAt: "2026-07-28T00:00:00.000Z",
    ...overrides,
  };
}
