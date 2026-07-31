import {
  applyGuidanceCommand,
  EASY_GUIDANCE,
} from "./guidance";
import type { LabClient, LabProjection } from "./types";

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
  heading: "風切モータースの業務環境を調べる",
  lede: "確定した事実をつなぎ、次に確かめることを選びます。",
  objective: "まず、直結先で応答するサービスを整理する",
  consultationQuestion: "現在の事実から、次に何を確かめますか？",
  facts: [
    {
      id: "map-01",
      label: "スタッフ用の診断画面",
      detail: "公開Webの奥に、入力値をOSコマンドへ渡す診断機能がある。",
      icon: "browser",
    },
    {
      id: "map-02",
      label: "引き継ぎ用の共有",
      detail: "匿名で読める共有に、古いバックアップと運用メモが残っている。",
      icon: "folder",
    },
    {
      id: "map-03",
      label: "整備場のNFS共有",
      detail: "書き込み権限と所有者の対応が、利用者の想定より広い。",
      icon: "network",
    },
  ],
  hypotheses: [
    {
      id: "hyp-service-inventory",
      label: "まず、直結先で応答するサービスを整理する",
      summary: "入口を決める前に、見えている面を事実として並べる。",
      selected: true,
      available: true,
    },
    {
      id: "hyp-web-input-boundary",
      label: "診断入力がどこまでOSへ渡るか確かめる",
      summary: "画面の用途と、入力値が処理される境界を分けて観察する。",
      available: true,
    },
    {
      id: "hyp-backup-trust",
      label: "匿名共有のバックアップを運用上の手掛かりとして読む",
      summary: "ファイル名だけでなく、いつ・何のために残されたかを確認する。",
      available: true,
    },
    {
      id: "hyp-nfs-ownership",
      label: "NFS上の所有者と書き込み可能範囲を確かめる",
      summary: "共有名ではなく、Debian側で誰の領域として扱われるかを見る。",
      available: true,
    },
  ],
  investigations: [
    {
      id: "investigation-hyp-service-inventory",
      label: "まず、直結先で応答するサービスを整理する",
      summary: "入口を決める前に、見えている面を事実として並べる。",
      icon: "terminal",
      hypothesisId: "hyp-service-inventory",
    },
    {
      id: "investigation-hyp-web-input-boundary",
      label: "診断入力がどこまでOSへ渡るか確かめる",
      summary: "画面の用途と、入力値が処理される境界を分けて観察する。",
      icon: "browser",
      hypothesisId: "hyp-web-input-boundary",
    },
    {
      id: "investigation-hyp-backup-trust",
      label: "匿名共有のバックアップを運用上の手掛かりとして読む",
      summary: "ファイル名だけでなく、いつ・何のために残されたかを確認する。",
      icon: "folder",
      hypothesisId: "hyp-backup-trust",
    },
  ],
  graph: {
    nodes: [
      {
        id: "map-01",
        label: "スタッフ用の診断画面",
        category: "Web",
        detail: "公開Webの奥に、入力値をOSコマンドへ渡す診断機能がある。",
        icon: "browser",
        state: "discovered",
        progress: "発見済み",
      },
      {
        id: "map-02",
        label: "引き継ぎ用の共有",
        category: "共有",
        detail: "匿名で読める共有に、古いバックアップと運用メモが残っている。",
        icon: "folder",
        state: "discovered",
        progress: "発見済み",
      },
      {
        id: "map-03",
        label: "整備場のNFS共有",
        category: "整備",
        detail: "書き込み権限と所有者の対応が、利用者の想定より広い。",
        icon: "network",
        state: "discovered",
        progress: "発見済み",
      },
      {
        id: "map-04",
        label: "権限獲得",
        category: "権限獲得",
        icon: "file",
        state: "undiscovered",
      },
      {
        id: "map-05",
        label: "権限獲得",
        category: "権限獲得",
        icon: "file",
        state: "undiscovered",
      },
      {
        id: "map-06",
        label: "権限獲得",
        category: "権限獲得",
        icon: "file",
        state: "undiscovered",
      },
    ],
    edges: [
      {
        id: "edge-1",
        from: "map-01",
        to: "map-04",
        state: "possible",
      },
      {
        id: "edge-2",
        from: "map-02",
        to: "map-05",
        state: "possible",
      },
      {
        id: "edge-3",
        from: "map-03",
        to: "map-06",
        state: "possible",
      },
    ],
  },
  hints: [
    {
      id: "hyp-service-inventory:1",
      step: 1,
      title: "確かめること",
      state: "unlocked",
      body: "Kali側の有線IPと、10.13.37.10が応答するTCPサービスを見る。",
    },
    {
      id: "hyp-service-inventory:2",
      step: 2,
      title: "使う道具",
      state: "unlocked",
      body: "ip addr、ping、nmapの順で、接続とサービスを分けて確認する。",
    },
    {
      id: "hyp-service-inventory:3",
      step: 3,
      title: "組み立て方",
      state: "unlocked",
      body: "対象IPを固定し、名前解決やping応答に依存せずサービス版を確認する。",
    },
    {
      id: "hyp-service-inventory:4",
      step: 4,
      title: "操作例",
      state: "unlocked",
      body: "nmap -sV -Pn 10.13.37.10",
    },
  ],
  guidance: { ...EASY_GUIDANCE },
  progress: {
    discovered: 3,
    total: 13,
  },
  recentEvents: [
    {
      id: "event-1",
      at: "2026-07-31T00:00:00.000Z",
      message: "スタッフ用の診断画面を確認した。",
    },
    {
      id: "event-2",
      at: "2026-07-31T00:01:00.000Z",
      message: "匿名で読める引き継ぎ共有を確認した。",
    },
    {
      id: "event-3",
      at: "2026-07-31T00:02:00.000Z",
      message: "整備場のNFS共有内を確認した。",
    },
  ],
  telemetry: {
    status: "live",
  },
  capabilities: {
    manualFlagSubmission: false,
  },
};

const hypothesisHints: Record<string, LabProjection["hints"]> = {
  "hyp-service-inventory": liveProjection.hints,
  "hyp-web-input-boundary": [
    {
      id: "hyp-web-input-boundary:1",
      step: 1,
      title: "確かめること",
      state: "unlocked",
      body: "診断対象を入力したとき、結果欄へ何が返るかを見る。",
    },
    {
      id: "hyp-web-input-boundary:2",
      step: 2,
      title: "使う道具",
      state: "unlocked",
      body: "まずブラウザで通常入力と区切り記号を含む入力の差を比べる。",
    },
    {
      id: "hyp-web-input-boundary:3",
      step: 3,
      title: "組み立て方",
      state: "unlocked",
      body: "正常な診断対象の後ろへ区切り記号と、結果を確認できる短いコマンドを続ける。",
    },
    {
      id: "hyp-web-input-boundary:4",
      step: 4,
      title: "操作例",
      state: "unlocked",
      body: "127.0.0.1; id",
    },
  ],
  "hyp-backup-trust": [
    {
      id: "hyp-backup-trust:1",
      step: 1,
      title: "確かめること",
      state: "unlocked",
      body: "handover共有にある引き継ぎ文書とバックアップ一覧を見る。",
    },
    {
      id: "hyp-backup-trust:2",
      step: 2,
      title: "使う道具",
      state: "unlocked",
      body: "smbclientで共有一覧を確認し、匿名で読める範囲だけ調べる。",
    },
    {
      id: "hyp-backup-trust:3",
      step: 3,
      title: "組み立て方",
      state: "unlocked",
      body: "対象、共有名、匿名接続の順に指定し、まず一覧だけを確認する。",
    },
    {
      id: "hyp-backup-trust:4",
      step: 4,
      title: "操作例",
      state: "unlocked",
      body: "smbclient //10.13.37.10/handover -N",
    },
  ],
  "hyp-nfs-ownership": [
    {
      id: "hyp-nfs-ownership:1",
      step: 1,
      title: "確かめること",
      state: "unlocked",
      body: "NFSv4の公開rootと、mount後の所有者・権限・隠しファイルを見る。",
    },
    {
      id: "hyp-nfs-ownership:2",
      step: 2,
      title: "使う道具",
      state: "unlocked",
      body: "NFSv4を直接mountし、ls -laで所有者と書き込み範囲を観察する。",
    },
    {
      id: "hyp-nfs-ownership:3",
      step: 3,
      title: "組み立て方",
      state: "unlocked",
      body: "sudo mount -t nfs4 -o vers=4,proto=tcp 10.13.37.10:/ <ローカルの空ディレクトリ>",
    },
    {
      id: "hyp-nfs-ownership:4",
      step: 4,
      title: "操作例",
      state: "unlocked",
      body: "sudo mount -t nfs4 -o vers=4,proto=tcp 10.13.37.10:/ /mnt/workshop",
    },
  ],
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
      message: "自動検出を利用できません。最後の確定状態を表示しています。",
    };
  }

  if (scenario === "empty" || scenario === "transition") {
    projection.revision = 0;
    projection.facts = [];
    projection.hypotheses = projection.hypotheses.slice(0, 1);
    projection.investigations = projection.investigations.slice(0, 1);
    projection.graph = {
      nodes: [
        {
          id: "map-01",
          label: "Web",
          category: "Web",
          icon: "file",
          state: "undiscovered",
        },
        {
          id: "map-02",
          label: "共有",
          category: "共有",
          icon: "file",
          state: "undiscovered",
        },
        {
          id: "map-03",
          label: "整備",
          category: "整備",
          icon: "file",
          state: "undiscovered",
        },
      ],
      edges: [],
    };
    projection.progress = { discovered: 0, total: 13 };
    projection.recentEvents = [];
  }

  if (scenario === "success") {
    projection.status = "complete";
    projection.heading = "管理者権限までの道がつながりました";
    projection.lede =
      "入口から権限の変化まで、見つけた事実を順に振り返りましょう。";
    projection.objective = "取得した経路の因果を説明する";
    projection.progress = { discovered: 13, total: 13 };
    projection.completion = { routeId: "web-sudo" };
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

function automaticHintDepth(
  guidance: LabProjection["guidance"],
): number {
  let depth = guidance.showNextChoices ? 1 : 0;
  if (guidance.showToolNames) depth = Math.max(depth, 2);
  if (guidance.showCommandSyntax) depth = Math.max(depth, 3);
  if (guidance.showCommandExamples) depth = Math.max(depth, 4);
  return depth;
}

class FixtureLabClient implements LabClient {
  private baseProjection: LabProjection;
  private projection: LabProjection;
  private manualHintDepth = 0;
  private listeners = new Set<(projection: LabProjection) => void>();
  private transitionTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly scenario: FixtureScenario) {
    this.baseProjection = createProjection(scenario);
    this.projection = copyProjection(this.baseProjection);
    this.applyGuidanceView();
  }

  private applyGuidanceView(): void {
    const guidance = this.projection.guidance;
    const fullExplanation = guidance.explanationDepth === "full";
    const hintDepth = Math.max(
      this.manualHintDepth,
      automaticHintDepth(guidance),
    );
    const selectedId =
      this.projection.hypotheses.find((hypothesis) => hypothesis.selected)?.id ??
      this.baseProjection.hypotheses.find((hypothesis) => hypothesis.selected)
        ?.id;

    this.projection.lede = fullExplanation
      ? this.baseProjection.lede
      : "確定した事実から次を選びます。";
    this.projection.consultationQuestion = fullExplanation
      ? this.baseProjection.consultationQuestion
      : "次は何を確かめますか？";
    this.projection.facts = this.baseProjection.facts.map((fact) => ({
      ...fact,
      ...(fullExplanation ? {} : { detail: undefined }),
    }));
    this.projection.hypotheses = this.baseProjection.hypotheses.map(
      (hypothesis) => ({
        ...hypothesis,
        selected: hypothesis.id === selectedId,
        summary: fullExplanation
          ? hypothesis.summary
          : "この仮説を確かめます。",
      }),
    );
    this.projection.investigations = guidance.showNextChoices
      ? this.baseProjection.investigations.map((investigation) => ({
          ...investigation,
          summary: fullExplanation
            ? investigation.summary
            : "この方向を確かめます。",
        }))
      : [];

    const graph = copyProjection(this.baseProjection).graph;
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
      status: this.baseProjection.telemetry.status,
      ...(guidance.explainNoProgress &&
      this.baseProjection.telemetry.message
        ? { message: this.baseProjection.telemetry.message }
        : {}),
    };
  }

  private replaceBaseProjection(next: LabProjection): void {
    const guidance = this.projection.guidance;
    this.baseProjection = copyProjection(next);
    this.projection = copyProjection(next);
    this.projection.guidance = guidance;
    this.applyGuidanceView();
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
        nextProjection.facts = [copyProjection(liveProjection).facts[0]];
        nextProjection.hypotheses =
          copyProjection(liveProjection).hypotheses.slice(0, 2);
        nextProjection.investigations = [
          ...copyProjection(liveProjection).investigations.slice(0, 2),
        ];
        nextProjection.graph = {
          nodes: copyProjection(liveProjection).graph.nodes.slice(0, 4),
          edges: [copyProjection(liveProjection).graph.edges[0]],
        };
        nextProjection.progress = { discovered: 1, total: 13 };
        nextProjection.recentEvents = [
          {
            id: "event-1",
            at: "2026-07-31T00:00:00.000Z",
            message: "スタッフ用の診断画面を確認した。",
          },
        ];
        this.replaceBaseProjection(nextProjection);
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
    const selected = this.baseProjection.hypotheses.find(
      (hypothesis) => hypothesis.id === id,
    );
    const selectedHints = hypothesisHints[id];
    if (!selected || !selectedHints) {
      throw new Error("unknown_fixture_hypothesis");
    }

    this.projection.hypotheses = this.projection.hypotheses.map(
      (hypothesis) => ({
        ...hypothesis,
        selected: hypothesis.id === id,
      }),
    );
    this.baseProjection.objective = selected.label;
    this.baseProjection.hints = structuredClone(selectedHints);
    this.projection.objective = selected.label;
    this.manualHintDepth = 0;
    this.applyGuidanceView();
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

    this.manualHintDepth = Math.max(
      this.manualHintDepth,
      targetIndex + 1,
    );
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

export function createFixtureClient(scenario = "live"): LabClient {
  return new FixtureLabClient(normalizeScenario(scenario));
}
