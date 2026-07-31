import { createHash } from "node:crypto";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalProjectionJson(projection) {
  return JSON.stringify(canonicalize(projection));
}

export function projectionHash(projection) {
  return createHash("sha256")
    .update(canonicalProjectionJson(projection), "utf8")
    .digest("hex");
}

export function waitingProjection(targetSessionId) {
  return {
    experience: "live",
    sessionId: targetSessionId,
    revision: 0,
    status: "active",
    heading: "標的の状態を待っています",
    lede: "Kali Bridge が安全な進行情報を送ると、ここに反映されます。",
    objective: "Kali Bridge と標的の接続を確認する",
    consultationQuestion: "まだ観察結果は届いていません。",
    facts: [],
    hypotheses: [],
    investigations: [],
    graph: { nodes: [], edges: [] },
    hints: [],
    guidance: {
      showNextChoices: true,
      showToolNames: true,
      showCommandSyntax: true,
      showCommandExamples: true,
      explainNoProgress: true,
      explanationDepth: "full",
      silhouetteDepth: 1,
    },
    progress: { discovered: 0, total: 13 },
    recentEvents: [],
    telemetry: {
      status: "waiting",
      message: "最初の進行情報を待っています。",
    },
    capabilities: { manualFlagSubmission: false },
  };
}
