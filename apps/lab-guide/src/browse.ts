import type {
  FlagSubmissionResult,
  LabClient,
  LabProjection,
} from "./types";

const browseProjection: LabProjection = {
  experience: "browse",
  sessionId: "public-guide",
  revision: 0,
  status: "active",
  heading: "風切モータースの世界を先に歩く",
  lede:
    "標的がなくても遊び方を確認できます。演習では発見に合わせて、この地図が変化します。",
  objective: "必要な機材と安全な接続範囲を理解する",
  consultationQuestion: "演習を始める前に、どこから確認しますか？",
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
        "Debian標的だけが演習範囲です。会社LANやインターネットは調査しません。",
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
        position: { x: 40, y: 260 },
      },
      {
        id: "browse-link",
        label: "直結Ethernet",
        detail: "演習専用の有線経路",
        icon: "network",
        state: "discovered",
        position: { x: 285, y: 260 },
      },
      {
        id: "browse-target",
        label: "Debian標的",
        detail: "風切モータースの業務環境",
        icon: "server",
        state: "selected",
        position: { x: 535, y: 260 },
      },
      {
        id: "browse-unknown-a",
        label: "未発見",
        icon: "file",
        state: "undiscovered",
        position: { x: 190, y: 70 },
      },
      {
        id: "browse-unknown-b",
        label: "未発見",
        icon: "file",
        state: "undiscovered",
        position: { x: 430, y: 70 },
      },
      {
        id: "browse-unknown-c",
        label: "未発見",
        icon: "file",
        state: "undiscovered",
        position: { x: 430, y: 455 },
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
      title: "見る場所",
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
      title: "操作例",
      state: "locked",
      body: "運営者が配布した接続確認だけを実行します。",
      condition: "「使う道具」を確認すると開けます",
    },
  ],
  progress: {
    discovered: 0,
    total: 14,
  },
  recentEvents: [],
  telemetry: {
    status: "browse",
    message: "公開ガイドを表示中。ライブセッションには未接続です",
  },
  capabilities: {
    manualFlagSubmission: false,
  },
};

function cloneProjection(value: LabProjection): LabProjection {
  return structuredClone(value);
}

class BrowseLabClient implements LabClient {
  private projection = cloneProjection(browseProjection);
  private listeners = new Set<(projection: LabProjection) => void>();

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

    this.projection.hints = this.projection.hints.map((hint) =>
      hint.id === id
        ? { ...hint, state: "unlocked", condition: undefined }
        : hint.id === ordered[targetIndex + 1]?.id && hint.state === "locked"
          ? { ...hint, state: "available" }
          : hint,
    );
    return this.publish();
  }

  async submitFlag(_flag: string): Promise<FlagSubmissionResult> {
    return {
      accepted: false,
      message: "公開ガイドではflagを送信しません。",
    };
  }
}

export function createBrowseClient(): LabClient {
  return new BrowseLabClient();
}
