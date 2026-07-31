import {
  applyGuidanceCommand,
  EASY_GUIDANCE,
} from "./guidance";
import type { LabClient, LabProjection } from "./types";

const browseProjection: LabProjection = {
  experience: "browse",
  sessionId: "public-guide",
  revision: 0,
  status: "active",
  heading: "風切モータースへ接続する",
  lede:
    "接続後は、確定した発見に合わせてこの地図が変化します。",
  objective: "必要な機材と安全な接続範囲を理解する",
  consultationQuestion: "接続する前に、どこから確認しますか？",
  facts: [
    {
      id: "public-story",
      label: "舞台は架空の業務サーバ",
      detail: "実在する企業やデータは使いません。",
      icon: "server",
    },
    {
      id: "public-link",
      label: "KaliとDebianを有線で直結",
      detail: "許可された標的ノートだけを調査します。",
      icon: "network",
    },
    {
      id: "public-routes",
      label: "正解の経路は一つではない",
      detail: "観察した事実から次の仮説を選びます。",
      icon: "door",
    },
  ],
  hypotheses: [
    {
      id: "browse-safety",
      label: "最初に調査できる範囲を確認する",
      summary:
        "許可されたDebian標的だけを調べ、会社LANやインターネットは対象にしません。",
      selected: true,
      available: true,
    },
    {
      id: "browse-observe",
      label: "見えている入口を事実として並べる",
      summary:
        "すぐに正解を探さず、応答するサービスと画面の違いを記録します。",
      available: true,
    },
    {
      id: "browse-live",
      label: "ライブ表示が扱う情報を確認する",
      summary:
        "発見した地点と権限変化だけを反映し、生コマンドや秘密は記録しません。",
      available: true,
    },
  ],
  investigations: [
    {
      id: "browse-equipment",
      label: "必要な機材を確認する",
      summary: "Debianノート、Kali、有線LANの役割を見ます。",
      icon: "network",
      hypothesisId: "browse-safety",
    },
    {
      id: "browse-method",
      label: "探索の進め方を知る",
      summary: "観察、仮説、試行、説明の順で進めます。",
      icon: "browser",
      hypothesisId: "browse-observe",
    },
    {
      id: "browse-privacy",
      label: "記録される情報を知る",
      summary: "教材イベントと端末監視の違いを確認します。",
      icon: "file",
      hypothesisId: "browse-live",
    },
  ],
  graph: {
    nodes: [
      {
        id: "browse-kali",
        label: "Kali",
        detail: "観察と攻撃を行う側",
        icon: "terminal",
        state: "discovered",
        position: { x: 30, y: 205 },
      },
      {
        id: "browse-link",
        label: "直結Ethernet",
        detail: "Debian標的だけにつながる有線経路",
        icon: "network",
        state: "discovered",
        position: { x: 300, y: 205 },
      },
      {
        id: "browse-target",
        label: "Debian標的",
        detail: "風切モータースの業務環境",
        icon: "server",
        state: "selected",
        position: { x: 590, y: 205 },
      },
      {
        id: "browse-unknown-a",
        label: "未発見",
        category: "Web",
        icon: "file",
        state: "undiscovered",
        position: { x: 980, y: 35 },
      },
      {
        id: "browse-unknown-b",
        label: "未発見",
        category: "共有",
        icon: "file",
        state: "undiscovered",
        position: { x: 980, y: 205 },
      },
      {
        id: "browse-unknown-c",
        label: "未発見",
        category: "整備",
        icon: "file",
        state: "undiscovered",
        position: { x: 980, y: 375 },
      },
    ],
    edges: [
      {
        id: "browse-kali-link",
        from: "browse-kali",
        to: "browse-link",
        state: "known",
      },
      {
        id: "browse-link-target",
        from: "browse-link",
        to: "browse-target",
        state: "known",
      },
      {
        id: "browse-target-a",
        from: "browse-target",
        to: "browse-unknown-a",
        state: "possible",
      },
      {
        id: "browse-target-b",
        from: "browse-target",
        to: "browse-unknown-b",
        state: "possible",
      },
      {
        id: "browse-target-c",
        from: "browse-target",
        to: "browse-unknown-c",
        state: "possible",
      },
    ],
  },
  hints: [
    {
      id: "browse-safety:1",
      step: 1,
      title: "確かめること",
      state: "unlocked",
      body: "有線接続の両端がKaliとDebian標的だけであることを確認します。",
    },
    {
      id: "browse-safety:2",
      step: 2,
      title: "使う道具",
      state: "available",
      body: "Kaliのネットワーク設定で、有線側の接続先を確認します。",
      condition: "「見る場所」を確認すると開けます",
    },
    {
      id: "browse-safety:3",
      step: 3,
      title: "組み立て方",
      state: "locked",
      body: "有線側の接続先と対象IPを一つずつ照合します。",
      condition: "「使う道具」を確認すると開けます",
    },
    {
      id: "browse-safety:4",
      step: 4,
      title: "操作例",
      state: "locked",
      body: "運営者が配布した接続確認だけを実行します。",
      condition: "「組み立て方」を確認すると開けます",
    },
  ],
  guidance: { ...EASY_GUIDANCE },
  progress: {
    discovered: 0,
    total: 13,
  },
  recentEvents: [],
  telemetry: {
    status: "browse",
    message: "接続前の案内を表示しています",
  },
  capabilities: {
    manualFlagSubmission: false,
  },
};

function cloneProjection(value: LabProjection): LabProjection {
  return structuredClone(value);
}

function automaticHintDepth(
  guidance: LabProjection["guidance"],
): number {
  let depth = guidance.showNextChoices ? 1 : 0;
  if (guidance.showToolNames) depth = Math.max(depth, 2);
  if (guidance.showCommandSyntax) depth = Math.max(depth, 3);
  if (guidance.showCommandExamples) depth = Math.max(depth, 4);
  return depth;
}

class BrowseLabClient implements LabClient {
  private readonly baseProjection = cloneProjection(browseProjection);
  private projection = cloneProjection(browseProjection);
  private manualHintDepth = 0;
  private listeners = new Set<(projection: LabProjection) => void>();

  constructor() {
    this.applyGuidanceView();
  }

  private applyGuidanceView(): void {
    const guidance = this.projection.guidance;
    const fullExplanation = guidance.explanationDepth === "full";
    const hintDepth = Math.max(
      this.manualHintDepth,
      automaticHintDepth(guidance),
    );

    this.projection.lede = fullExplanation
      ? this.baseProjection.lede
      : "接続後は発見に合わせて地図が変わります。";
    this.projection.consultationQuestion = fullExplanation
      ? this.baseProjection.consultationQuestion
      : "次は何を確認しますか？";
    this.projection.facts = this.baseProjection.facts.map((fact) => ({
      ...fact,
      ...(fullExplanation ? {} : { detail: undefined }),
    }));
    this.projection.hypotheses = this.projection.hypotheses.map(
      (hypothesis) => ({
        ...hypothesis,
        summary: fullExplanation
          ? this.baseProjection.hypotheses.find(
              (item) => item.id === hypothesis.id,
            )?.summary ?? hypothesis.summary
          : "この項目を確認します。",
      }),
    );
    this.projection.investigations = guidance.showNextChoices
      ? cloneProjection(this.baseProjection).investigations
      : [];

    const graph = cloneProjection(this.baseProjection).graph;
    this.projection.graph.nodes =
      guidance.silhouetteDepth === 1
        ? graph.nodes
        : graph.nodes.filter((node) => node.state !== "undiscovered");
    const visibleNodeIds = new Set(
      this.projection.graph.nodes.map((node) => node.id),
    );
    this.projection.graph.edges = graph.edges.filter(
      (edge) =>
        visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to),
    );

    this.projection.hints = this.baseProjection.hints.map((hint, index) => ({
      ...hint,
      state:
        index < hintDepth
          ? "unlocked"
          : index === hintDepth
            ? "available"
            : "locked",
      ...(index < hintDepth
        ? { condition: undefined }
        : {
            body: undefined,
            condition:
              index === 0
                ? "必要な時に開けます"
                : "前の説明を確認すると開けます",
          }),
    }));
    this.projection.telemetry = {
      status: "browse",
      ...(guidance.explainNoProgress
        ? { message: "標的へ接続するまでは公開案内を表示します" }
        : {}),
    };
  }

  async getState(): Promise<LabProjection> {
    return cloneProjection(this.projection);
  }

  subscribe(onProjection: (projection: LabProjection) => void): () => void {
    this.listeners.add(onProjection);
    return () => this.listeners.delete(onProjection);
  }

  private publish(): LabProjection {
    this.projection.revision += 1;
    const snapshot = cloneProjection(this.projection);
    this.listeners.forEach((listener) => listener(snapshot));
    return snapshot;
  }

  async selectHypothesis(id: string): Promise<LabProjection> {
    const selected = this.projection.hypotheses.find(
      (hypothesis) => hypothesis.id === id,
    );
    if (!selected) throw new Error("unknown_public_hypothesis");

    this.projection.hypotheses = this.projection.hypotheses.map(
      (hypothesis) => ({
        ...hypothesis,
        selected: hypothesis.id === id,
      }),
    );
    return this.publish();
  }

  async unlockHint(id: string): Promise<LabProjection> {
    const ordered = [...this.projection.hints].sort(
      (left, right) => left.step - right.step,
    );
    const targetIndex = ordered.findIndex((hint) => hint.id === id);
    if (
      targetIndex < 0 ||
      ordered
        .slice(0, targetIndex)
        .some((hint) => hint.state !== "unlocked")
    ) {
      throw new Error("public_hint_locked");
    }

    this.manualHintDepth = Math.max(this.manualHintDepth, targetIndex + 1);
    this.applyGuidanceView();
    return this.publish();
  }

  async applyGuidance(commandId: string): Promise<LabProjection> {
    this.projection.guidance = applyGuidanceCommand(
      this.projection.guidance,
      commandId,
    );
    this.applyGuidanceView();
    return this.publish();
  }
}

export function createBrowseClient(): LabClient {
  return new BrowseLabClient();
}
