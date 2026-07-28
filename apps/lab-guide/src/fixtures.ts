import type {
  FlagSubmissionResult,
  LabClient,
  LabProjection,
} from "./types";

type FixtureScenario =
  | "empty"
  | "live"
  | "loading"
  | "reconnecting"
  | "success"
  | "transition"
  | "unavailable";

function copyProjection(projection: LabProjection): LabProjection {
  return structuredClone(projection);
}

const liveProjection: LabProjection = {
  experience: "live",
  sessionId: "fixture-session",
  revision: 3,
  status: "active",
  heading: "中古バイク店の業務サーバを調べる",
  lede: "見つけた事実をつなぎ、管理者権限までの道を探します。",
  objective: "まず1つの入口を確かめる",
  consultationQuestion:
    "staff が見つかったことから、次に何を確かめますか？",
  facts: [
    {
      id: "fact-web",
      label: "Webサイトが見える",
      detail: "target.local を確認しました。",
      icon: "globe",
    },
    {
      id: "fact-port",
      label: "80番の入口が開いている",
      detail: "Webの入口を確認しました。",
      icon: "door",
    },
    {
      id: "fact-staff",
      label: "staff という場所を発見",
      detail: "共有の可能性があります。",
      icon: "folder",
    },
  ],
  hypotheses: [
    {
      id: "hypothesis-input",
      label: "スタッフ向け画面の入力を試す",
      summary: "画面の入力が、相手PCの処理へどう渡るかを観察します。",
      selected: true,
      available: true,
    },
    {
      id: "hypothesis-public-files",
      label: "公開ファイルに別の手掛かりがないか探す",
      summary: "公開範囲に置かれたファイル名と更新時刻を見比べます。",
      available: true,
    },
    {
      id: "hypothesis-login",
      label: "ログイン用の情報が残っていないか調べる",
      summary: "見つけた情報同士に再利用の関係がないか確かめます。",
      available: true,
    },
  ],
  investigations: [
    {
      id: "investigation-web",
      label: "Webサイトの裏側を調べる",
      summary: "在庫サイトの仕組みや、隠れたページを確認します。",
      icon: "globe",
      hypothesisId: "hypothesis-input",
    },
    {
      id: "investigation-files",
      label: "共有されたファイルを確認する",
      summary: "ファイル置き場にアクセスし、公開範囲を調べます。",
      icon: "folder",
      hypothesisId: "hypothesis-public-files",
    },
    {
      id: "investigation-login",
      label: "ログインできる入口を探す",
      summary: "見つけた事実から認証の可能性を確かめます。",
      icon: "user",
      hypothesisId: "hypothesis-login",
    },
  ],
  graph: {
    nodes: [
      {
        id: "external-entry",
        label: "外から見える入口",
        detail: "ポート80（HTTP）",
        icon: "globe",
        state: "discovered",
        position: { x: 20, y: 70 },
      },
      {
        id: "inventory-site",
        label: "在庫サイト",
        detail: "バイク在庫の一覧",
        icon: "browser",
        state: "selected",
        progress: "発見 2/4",
        position: { x: 300, y: 70 },
      },
      {
        id: "unknown-web",
        label: "未発見",
        icon: "file",
        state: "undiscovered",
        position: { x: 590, y: 74 },
      },
      {
        id: "service-booking",
        label: "整備予約",
        detail: "予約フォーム",
        icon: "calendar",
        state: "discovered",
        progress: "発見 1/3",
        position: { x: 180, y: 230 },
      },
      {
        id: "unknown-service",
        label: "未発見",
        icon: "file",
        state: "undiscovered",
        position: { x: 480, y: 235 },
      },
      {
        id: "file-drop",
        label: "ファイル置き場",
        detail: "共有ディレクトリ",
        icon: "folder",
        state: "discovered",
        progress: "発見 1/3",
        position: { x: 60, y: 400 },
      },
      {
        id: "staff-area",
        label: "スタッフ環境",
        detail: "社内端末へのアクセス",
        icon: "terminal",
        state: "discovered",
        progress: "発見 0/2",
        position: { x: 360, y: 400 },
      },
      {
        id: "admin",
        label: "Linux管理者",
        detail: "管理者権限の取得",
        icon: "server",
        state: "discovered",
        progress: "発見 0/3",
        position: { x: 690, y: 300 },
      },
      {
        id: "unknown-file-a",
        label: "未発見",
        icon: "file",
        state: "undiscovered",
        position: { x: 20, y: 565 },
      },
      {
        id: "unknown-file-b",
        label: "未発見",
        icon: "file",
        state: "undiscovered",
        position: { x: 215, y: 565 },
      },
      {
        id: "unknown-staff-a",
        label: "未発見",
        icon: "file",
        state: "undiscovered",
        position: { x: 445, y: 565 },
      },
      {
        id: "unknown-staff-b",
        label: "未発見",
        icon: "file",
        state: "undiscovered",
        position: { x: 635, y: 565 },
      },
    ],
    edges: [
      {
        id: "edge-entry-inventory",
        from: "external-entry",
        to: "inventory-site",
        state: "known",
      },
      {
        id: "edge-inventory-unknown",
        from: "inventory-site",
        to: "unknown-web",
        state: "known",
      },
      {
        id: "edge-entry-booking",
        from: "external-entry",
        to: "service-booking",
        state: "possible",
      },
      {
        id: "edge-booking-unknown",
        from: "service-booking",
        to: "unknown-service",
        state: "known",
      },
      {
        id: "edge-unknown-admin",
        from: "unknown-service",
        to: "admin",
        state: "possible",
      },
      {
        id: "edge-file-staff",
        from: "file-drop",
        to: "staff-area",
        state: "known",
      },
      {
        id: "edge-staff-admin",
        from: "staff-area",
        to: "admin",
        state: "possible",
      },
      {
        id: "edge-file-a",
        from: "file-drop",
        to: "unknown-file-a",
        state: "possible",
      },
      {
        id: "edge-file-b",
        from: "file-drop",
        to: "unknown-file-b",
        state: "possible",
      },
      {
        id: "edge-staff-a",
        from: "staff-area",
        to: "unknown-staff-a",
        state: "possible",
      },
      {
        id: "edge-staff-b",
        from: "staff-area",
        to: "unknown-staff-b",
        state: "possible",
      },
    ],
  },
  hints: [
    {
      id: "hint-observe",
      step: 1,
      title: "見る場所",
      state: "unlocked",
      body: "入力した文字と、画面に返る結果の関係を見ます。",
    },
    {
      id: "hint-tool",
      step: 2,
      title: "使う道具",
      state: "available",
      body: "ブラウザの開発者ツールで、送信された項目を確認します。",
      condition: "「見る場所」を確認すると開けます",
    },
    {
      id: "hint-example",
      step: 3,
      title: "操作例",
      state: "locked",
      body: "無害な入力を一つずつ変え、返り方の差を記録します。",
      condition: "「使う道具」を確認すると開けます",
    },
  ],
  progress: {
    discovered: 3,
    total: 14,
  },
  recentEvents: [
    {
      id: "event-web",
      at: "10:24",
      message: "Webサイトが見えることを確認しました。",
    },
    {
      id: "event-port",
      at: "10:26",
      message: "80番の入口が開いていることを確認しました。",
    },
    {
      id: "event-staff",
      at: "10:29",
      message: "staff という場所を発見しました。",
    },
  ],
  telemetry: {
    status: "live",
    message: "教材イベントを自動検出しています",
  },
  capabilities: {
    manualFlagSubmission: true,
  },
};

function createProjection(scenario: FixtureScenario): LabProjection {
  const projection = copyProjection(liveProjection);

  if (scenario === "loading") {
    projection.telemetry = {
      status: "loading",
      message: "新しい状態を確認しています",
    };
  }

  if (scenario === "reconnecting") {
    projection.telemetry = {
      status: "reconnecting",
      message: "接続を戻しています。操作内容は失われません。",
    };
  }

  if (scenario === "unavailable") {
    projection.telemetry = {
      status: "unavailable",
      message: "自動検出を利用できません。flagを手動で提出できます。",
    };
  }

  if (scenario === "empty" || scenario === "transition") {
    projection.heading = "標的との接続を確かめる";
    projection.lede =
      "まずKaliと標的ノートが直結されていることを確認します。";
    projection.objective = "有線接続と target.local を確認する";
    projection.consultationQuestion =
      "標的へ届くことを確かめるには、何から見ますか？";
    projection.facts = [];
    projection.investigations = [
      {
        id: "investigation-connect",
        label: "接続を確認する",
        summary: "有線接続と標的のアドレスから確かめます。",
        icon: "network",
      },
    ];
    projection.graph = {
      nodes: [
        {
          id: "connection",
          label: "接続確認",
          detail: "ここから探索を始めます",
          icon: "network",
          state: "selected",
          position: { x: 300, y: 220 },
        },
      ],
      edges: [],
    };
    projection.progress = { discovered: 0, total: 14 };
    projection.recentEvents = [];
  }

  if (scenario === "success") {
    projection.status = "complete";
    projection.heading = "管理者権限までの道がつながりました";
    projection.lede =
      "入口から権限の変化まで、見つけた事実を順に振り返りましょう。";
    projection.objective = "取得した経路の因果を説明する";
    projection.progress = { discovered: 14, total: 14 };
    projection.hints = projection.hints.map((hint) => ({
      ...hint,
      state: "unlocked",
      condition: undefined,
    }));
    projection.graph = {
      nodes: [
        ["map-01", "診断画面", "Webの診断入力", "browser"],
        ["map-02", "引き継ぎ共有", "匿名SMB共有", "folder"],
        ["map-03", "整備場のNFS", "書き込み可能な共有", "network"],
        ["map-04", "www-data", "Webサービスの権限", "server"],
        ["map-05", "sales", "販売担当のログイン", "user"],
        ["map-06", "mechanic", "整備担当のログイン", "user"],
        ["map-07", "sudo hook", "保守処理の手掛かり", "file"],
        ["map-08", "root timer", "定期処理の手掛かり", "calendar"],
        ["map-09", "SUID PATH", "PATH解決の手掛かり", "terminal"],
        ["map-10", "sudo経路", "保守hookから昇格", "terminal"],
        ["map-11", "timer経路", "定期処理から昇格", "calendar"],
        ["map-12", "SUID経路", "PATH解決から昇格", "terminal"],
        ["map-13", "Debian root", "管理者権限へ到達", "door"],
        ["map-14", "Windows保管記録", "オフラインの追加flag", "folder"],
      ].map(([id, label, detail, icon]) => ({
        id,
        label,
        detail,
        icon: icon as LabProjection["graph"]["nodes"][number]["icon"],
        state:
          id === "map-13"
            ? ("selected" as const)
            : ("discovered" as const),
        progress: "発見済み",
      })),
      edges: [
        ["map-01", "map-04"],
        ["map-02", "map-05"],
        ["map-03", "map-06"],
        ["map-04", "map-07"],
        ["map-04", "map-08"],
        ["map-04", "map-09"],
        ["map-05", "map-07"],
        ["map-05", "map-08"],
        ["map-05", "map-09"],
        ["map-06", "map-07"],
        ["map-06", "map-08"],
        ["map-06", "map-09"],
        ["map-07", "map-10"],
        ["map-08", "map-11"],
        ["map-09", "map-12"],
        ["map-10", "map-13"],
        ["map-11", "map-13"],
        ["map-12", "map-13"],
        ["map-13", "map-14"],
      ].map(([from, to], index) => ({
        id: `success-edge-${index + 1}`,
        from,
        to,
        state: "known" as const,
      })),
    };
  }

  return projection;
}

function normalizeScenario(value: string): FixtureScenario {
  return value === "empty" ||
    value === "loading" ||
    value === "reconnecting" ||
    value === "success" ||
    value === "transition" ||
    value === "unavailable"
    ? value
    : "live";
}

class FixtureLabClient implements LabClient {
  private projection: LabProjection;
  private listeners = new Set<(projection: LabProjection) => void>();
  private transitionTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly scenario: FixtureScenario) {
    this.projection = createProjection(scenario);
  }

  async getState(): Promise<LabProjection> {
    return copyProjection(this.projection);
  }

  subscribe(
    onProjection: (projection: LabProjection) => void,
    _onError: () => void,
  ): () => void {
    this.listeners.add(onProjection);

    if (this.scenario === "transition" && !this.transitionTimer) {
      this.transitionTimer = setTimeout(() => {
        const nextProjection = createProjection("empty");
        nextProjection.revision = this.projection.revision;
        nextProjection.heading = "Webの入口を発見";
        nextProjection.lede =
          "Kali Bridgeが標的の変化を検出し、安全な事実だけを同期しました。";
        nextProjection.objective = "見つかったWebサイトの構成を確かめる";
        nextProjection.consultationQuestion =
          "Webサイトが見えたことから、次は何を調べますか？";
        nextProjection.facts = [copyProjection(liveProjection).facts[0]];
        nextProjection.investigations = [
          copyProjection(liveProjection).investigations[0],
        ];
        nextProjection.graph = {
          nodes: copyProjection(liveProjection).graph.nodes.slice(0, 2),
          edges: [copyProjection(liveProjection).graph.edges[0]],
        };
        nextProjection.progress = { discovered: 1, total: 14 };
        nextProjection.recentEvents = [
          {
            id: "event-transition-web",
            at: "いま",
            message: "Webサイトへの到達を自動で確認しました。",
          },
        ];
        this.projection = nextProjection;
        this.transitionTimer = undefined;
        this.publish();
      }, 900);
    }

    return () => {
      this.listeners.delete(onProjection);
      if (this.listeners.size === 0 && this.transitionTimer) {
        clearTimeout(this.transitionTimer);
        this.transitionTimer = undefined;
      }
    };
  }

  private publish(): LabProjection {
    this.projection.revision += 1;
    const snapshot = copyProjection(this.projection);
    this.listeners.forEach((listener) => listener(snapshot));
    return snapshot;
  }

  async selectHypothesis(id: string): Promise<LabProjection> {
    this.projection.hypotheses = this.projection.hypotheses.map(
      (hypothesis) => ({
        ...hypothesis,
        selected: hypothesis.id === id,
      }),
    );
    return this.publish();
  }

  async unlockHint(id: string): Promise<LabProjection> {
    const orderedHints = [...this.projection.hints].sort(
      (left, right) => left.step - right.step,
    );
    const targetIndex = orderedHints.findIndex((hint) => hint.id === id);
    const prerequisiteMet =
      targetIndex >= 0 &&
      orderedHints
        .slice(0, targetIndex)
        .every((hint) => hint.state === "unlocked");

    if (!prerequisiteMet) {
      throw new Error("hint_prerequisite_not_met");
    }

    this.projection.hints = this.projection.hints.map((hint) =>
      hint.id === id
        ? { ...hint, state: "unlocked", condition: undefined }
        : hint.id === orderedHints[targetIndex + 1]?.id &&
            hint.state === "locked"
          ? { ...hint, state: "available" }
        : hint,
    );
    return this.publish();
  }

  async submitFlag(flag: string): Promise<FlagSubmissionResult> {
    const accepted = flag.trim().length >= 6;
    return {
      accepted,
      message: accepted
        ? "提出を受け付けました。状態をもう一度確認します。"
        : "入力内容を確認できませんでした。flag全体を入力してください。",
    };
  }
}

export function createFixtureClient(scenario = "live"): LabClient {
  return new FixtureLabClient(normalizeScenario(scenario));
}
