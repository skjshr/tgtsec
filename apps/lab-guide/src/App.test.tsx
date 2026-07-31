import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ApiLabClient,
  normalizeProjection,
  resolveLabClient,
} from "./api";
import { App } from "./App";
import { createBrowseClient } from "./browse";
import { ExplorationMap } from "./components/ExplorationMap";
import {
  fallbackPositionFor,
  WORLD_POSITIONS,
  worldEdgeFor,
} from "./components/MapCanvas";
import { SituationConsultation } from "./components/SituationConsultation";
import { createFixtureClient } from "./fixtures";
import { THEME_STORAGE_KEY } from "./theme";
import type { LabClient, LabProjection } from "./types";

describe("Lab guide", () => {
  it("does not probe a target API on a normal public first visit", async () => {
    window.localStorage.removeItem("examserver.lab.live-session.v1");
    window.history.replaceState({}, "", "/");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const resolved = await resolveLabClient();

    expect(resolved.experience).toBe("browse");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("allows bounded SSE to reconnect before showing a connection error", async () => {
    const projection = await createFixtureClient("live").getState();
    vi.useFakeTimers();

    class FakeEventSource {
      static instance: FakeEventSource | undefined;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      private listeners = new Map<string, EventListener>();

      constructor(_url: string) {
        FakeEventSource.instance = this;
      }

      addEventListener(type: string, listener: EventListener) {
        this.listeners.set(type, listener);
      }

      emitState(value: LabProjection) {
        this.listeners.get("state")?.(
          new MessageEvent("state", { data: JSON.stringify(value) }),
        );
      }

      close() {}
    }

    vi.stubGlobal("EventSource", FakeEventSource);
    try {
      const onProjection = vi.fn();
      const onError = vi.fn();
      const unsubscribe = new ApiLabClient().subscribe(
        onProjection,
        onError,
      );
      const source = FakeEventSource.instance!;

      source.onerror?.(new Event("error"));
      await vi.advanceTimersByTimeAsync(3_499);
      expect(onError).not.toHaveBeenCalled();

      source.emitState(projection);
      await vi.advanceTimersByTimeAsync(4_000);
      expect(onProjection).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();

      source.onerror?.(new Event("error"));
      await vi.advanceTimersByTimeAsync(3_500);
      expect(onError).toHaveBeenCalledTimes(1);
      unsubscribe();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("stays useful as a public guide without a target session", async () => {
    const user = userEvent.setup();
    render(
      <App
        client={createBrowseClient()}
        initialExperience="browse"
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "風切モータースへ接続する",
      }),
    ).toBeVisible();
    expect(screen.queryByLabelText(/接続コード/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const pairingPull = screen.getByRole("button", {
      name: "探索ツールを開く",
    });
    expect(pairingPull).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("button", { name: /ツールを開く/ })).toHaveLength(
      1,
    );

    await user.click(pairingPull);
    const pairingDialog = screen.getByRole("dialog", { name: "探索ツール" });
    expect(
      within(pairingDialog).getByRole("button", { name: /^接続6文字$/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(within(pairingDialog).getByLabelText(/接続コード/)).toBeVisible();
    expect(
      within(pairingDialog).getByRole("button", { name: "ライブ接続" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "演習を終了" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("見つけたflag")).not.toBeInTheDocument();
  });

  it("applies guidance to the public state without creating a profile", async () => {
    const client = createBrowseClient();
    const easy = await client.getState();
    expect(easy.hints).toHaveLength(4);
    expect(easy.hints.every((hint) => hint.state === "unlocked")).toBe(true);
    expect(
      easy.graph.nodes.filter((node) => node.state === "undiscovered"),
    ).toHaveLength(3);

    const hard = await client.applyGuidance("preset.hard");
    expect(hard?.investigations).toEqual([]);
    expect(hard?.hints[0].state).toBe("available");
    expect(
      hard?.graph.nodes.some((node) => node.state === "undiscovered"),
    ).toBe(false);
    expect(hard?.telemetry.message).toBeUndefined();
    expect(JSON.stringify(hard)).not.toMatch(/profile|account/);

    const custom = await client.applyGuidance("showNextChoices.on");
    expect(custom?.investigations).toHaveLength(3);
    expect(custom?.hints[0].state).toBe("unlocked");
  });

  it("reprojects the live fixture when guidance changes", async () => {
    const client = createFixtureClient("live");
    const easy = await client.getState();
    expect(easy.heading).toBe("風切モータースの業務環境を調べる");
    expect(easy.facts.map((fact) => fact.label)).toEqual([
      "スタッフ用の診断画面",
      "引き継ぎ用の共有",
      "整備場のNFS共有",
    ]);
    expect(easy.graph.nodes.map((node) => node.id)).toEqual([
      "map-01",
      "map-02",
      "map-03",
      "map-04",
      "map-05",
      "map-06",
    ]);
    expect(JSON.stringify(easy)).toContain("10.13.37.10");
    expect(JSON.stringify(easy)).not.toContain("target.local");
    expect(easy.hints).toHaveLength(4);
    expect(easy.hints.every((hint) => hint.state === "unlocked")).toBe(true);
    expect(easy.investigations).toHaveLength(3);
    expect(
      easy.graph.nodes.filter((node) => node.state === "undiscovered"),
    ).toHaveLength(3);

    const hard = await client.applyGuidance("preset.hard");
    expect(hard?.investigations).toEqual([]);
    expect(hard?.hints[0].state).toBe("available");
    expect(
      hard?.graph.nodes.some((node) => node.state === "undiscovered"),
    ).toBe(false);
    expect(hard?.graph.edges).toEqual([]);

    const easyAgain = await client.applyGuidance("preset.easy");
    expect(easyAgain?.investigations).toHaveLength(3);
    expect(
      easyAgain?.hints.every((hint) => hint.state === "unlocked"),
    ).toBe(true);
    expect(
      easyAgain?.graph.nodes.filter(
        (node) => node.state === "undiscovered",
      ),
    ).toHaveLength(3);

    const backup = await client.selectHypothesis("hyp-backup-trust");
    expect(backup?.objective).toBe(
      "匿名共有のバックアップを運用上の手掛かりとして読む",
    );
    expect(backup?.hints.map((hint) => hint.id)).toEqual([
      "hyp-backup-trust:1",
      "hyp-backup-trust:2",
      "hyp-backup-trust:3",
      "hyp-backup-trust:4",
    ]);
  });

  it("traps focus in one requested drawer and returns it to its pull", async () => {
    const user = userEvent.setup();
    render(
      <App
        client={createBrowseClient()}
        initialExperience="browse"
      />,
    );

    const pairingPull = await screen.findByRole("button", {
      name: "探索ツールを開く",
    });
    pairingPull.focus();
    await user.click(pairingPull);

    const dialog = screen.getByRole("dialog", { name: "探索ツール" });
    const close = within(dialog).getByRole("button", {
      name: "探索ツールを閉じる",
    });
    const input = within(dialog).getByLabelText(/接続コード/);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(close).toHaveFocus();

    await user.tab({ shift: true });
    expect(input).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pairingPull).toHaveFocus();
  });

  it("keeps live counts stored until the user asks for the tool shelf", async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient("transition")} />);

    expect(
      await screen.findByRole("heading", {
        name: "風切モータースの業務環境を調べる",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("progressbar", { name: "13件中0件を発見" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "探索ツールを開く" }),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    expect(
      await screen.findByRole(
        "progressbar",
        { name: "13件中1件を発見" },
        { timeout: 2_000 },
      ),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "探索ツールを開く" }),
    );
    const toolDialog = screen.getByRole("dialog", { name: "探索ツール" });
    expect(
      within(toolDialog).getByRole("button", { name: /^事実1件$/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(toolDialog).getByRole("button", { name: /^履歴1件$/ }),
    ).toBeVisible();
  });

  it("defaults to PLAY and changes art direction without losing the active screen", async () => {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute("data-theme");
    const user = userEvent.setup();
    render(<App client={createFixtureClient("live")} />);

    await user.click(screen.getByLabelText("メニュー"));
    const themeGroup = screen.getByRole("group", { name: "表示テーマ" });
    expect(
      within(themeGroup).getByRole("button", {
        name: "PLAY ポップゲーム",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveAttribute("data-theme", "play");

    await user.click(
      screen.getByRole("button", { name: "次の手順" }),
    );
    await user.click(screen.getByLabelText("メニュー"));
    const reopenedThemeGroup = screen.getByRole("group", {
      name: "表示テーマ",
    });
    await user.click(
      within(reopenedThemeGroup).getByRole("button", {
        name: "OPS ハッカー",
      }),
    );

    expect(document.documentElement).toHaveAttribute("data-theme", "ops");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("ops");
    expect(
      screen.getByRole("heading", { name: "次に確かめることを選ぶ" }),
    ).toBeVisible();
    await user.click(screen.getByLabelText("メニュー"));
    expect(
      within(screen.getByRole("group", { name: "表示テーマ" })).getByRole(
        "button",
        { name: "OPS ハッカー" },
      ),
    ).toHaveAttribute("aria-pressed", "true");

    window.localStorage.removeItem(THEME_STORAGE_KEY);
  });

  it("restores a persisted visual mode", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "focus");
    const user = userEvent.setup();
    render(<App client={createFixtureClient("live")} />);

    await user.click(await screen.findByLabelText("メニュー"));
    expect(
      screen.getByRole("button", { name: "FOCUS シンプル" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveAttribute("data-theme", "focus");

    window.localStorage.removeItem(THEME_STORAGE_KEY);
  });

  it("starts in EASY and changes guidance mid-session without leaving the screen", async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient("live")} />);

    await user.click(
      await screen.findByTestId("next-action-map"),
    );
    await user.click(screen.getByLabelText("メニュー"));
    let guidanceGroup = screen.getByRole("group", {
      name: "難易度とヒント表示",
    });
    expect(
      within(guidanceGroup).getByRole("button", { name: "EASY" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      within(guidanceGroup).getByRole("button", { name: "HARD" }),
    );
    await waitFor(() =>
      expect(
        within(guidanceGroup).getByRole("button", { name: "HARD" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(
      screen.getByRole("heading", { name: "次に確かめることを選ぶ" }),
    ).toBeVisible();

    await user.click(screen.getByLabelText("メニュー"));
    guidanceGroup = screen.getByRole("group", {
      name: "難易度とヒント表示",
    });
    await user.click(
      within(guidanceGroup).getByText("表示を細かく選ぶ"),
    );
    await user.click(
      within(guidanceGroup).getByRole("switch", {
        name: /次の候補/,
      }),
    );
    await waitFor(() => {
      guidanceGroup = screen.getByRole("group", {
        name: "難易度とヒント表示",
      });
      expect(within(guidanceGroup).getByText("CUSTOM")).toBeVisible();
    });
  });

  it("maps telemetry edge states onto tentative and known routes", () => {
    const projection = normalizeProjection({
      graph: {
        nodes: [],
        edges: [
          { id: "available", from: "a", to: "b", state: "available" },
          { id: "discovered", from: "b", to: "c", state: "discovered" },
        ],
      },
    });

    expect(projection.graph.edges).toEqual([
      { id: "available", from: "a", to: "b", state: "possible" },
      { id: "discovered", from: "b", to: "c", state: "known" },
    ]);
  });

  it("gives every projected world node a unique fallback position", () => {
    expect(WORLD_POSITIONS.size).toBe(13);
    expect(
      new Set(
        [...WORLD_POSITIONS.values()].map(({ x, y }) => `${x}:${y}`),
      ).size,
    ).toBe(13);
  });

  it("keeps a subset on its stable topology rows", () => {
    const subset = ["map-01", "map-02", "map-03", "map-05"].map(
      fallbackPositionFor,
    );
    expect(subset[3]).toEqual({ x: 205, y: 155 });
    expect(subset[3]).not.toEqual(fallbackPositionFor("map-04"));
  });

  it("keeps desktop map selection keyboard-operable without focusable graph chrome", async () => {
    const user = userEvent.setup();
    render(
      <App
        client={createBrowseClient()}
        initialExperience="browse"
      />,
    );

    const desktopNode = (id: string) => {
      const node = screen
        .getByTestId(`rf__node-${id}`)
        .querySelector("button.world-node");
      if (!(node instanceof HTMLButtonElement)) {
        throw new Error(`desktop world node ${id} is not a button`);
      }
      return node;
    };

    const nodeWrapper = await screen.findByTestId("rf__node-browse-kali");
    const kaliNode = desktopNode("browse-kali");
    const targetNode = desktopNode("browse-target");
    const nextAction = screen.getByTestId("next-action-map");

    expect(kaliNode).toHaveAttribute(
      "aria-label",
      "Kali、観察と攻撃を行う側",
    );
    expect(kaliNode).toHaveAttribute("aria-pressed", "false");
    expect(targetNode).toHaveAttribute("aria-pressed", "true");
    expect(nodeWrapper).not.toHaveAttribute("tabindex");
    expect(nodeWrapper).not.toHaveAttribute("role");
    expect(kaliNode.querySelector("button")).toBeNull();
    expect(
      worldEdgeFor({
        id: "keyboard-route",
        from: "browse-kali",
        to: "browse-link",
        state: "known",
      }),
    ).toMatchObject({
      selectable: false,
      focusable: false,
      deletable: false,
    });
    expect(nextAction.closest("button")).toBe(nextAction);
    expect(nextAction.closest(".world-node")).toBeNull();

    kaliNode.focus();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(desktopNode("browse-kali")).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(desktopNode("browse-target")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("next-action-map").closest("button")).toBe(
      screen.getByTestId("next-action-map"),
    );
  });

  it("exercises all thirteen Debian telemetry map IDs in the success fixture", async () => {
    const projection = await createFixtureClient("success").getState();
    expect(projection.graph.nodes.map((node) => node.id)).toEqual(
      Array.from({ length: 13 }, (_, index) =>
        `map-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(
      projection.graph.nodes.every((node) => node.position === undefined),
    ).toBe(true);
  });

  it("shows only the route unlocked by the current completed session", async () => {
    render(<App client={createFixtureClient("success")} />);

    const achievement = await screen.findByRole("region", {
      name: "経路実績を解除",
    });
    expect(
      within(achievement).getByText("Web診断 × sudo保守hook"),
    ).toBeVisible();
    expect(within(achievement).getByText(/ROUTE UNLOCKED/)).toBeVisible();
    expect(screen.queryByText("整備場NFS × SUID PATH")).not.toBeInTheDocument();
    expect(JSON.stringify(await createFixtureClient("success").getState())).not.toMatch(
      /profile|account/,
    );
  });

  it("publishes a live discovery without reloading the client", async () => {
    vi.useFakeTimers();
    try {
      const client = createFixtureClient("transition");
      const initial = await client.getState();
      const listener = vi.fn();
      const unsubscribe = client.subscribe(listener, vi.fn());

      expect(initial.heading).toBe("風切モータースの業務環境を調べる");
      expect(initial.facts).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(900);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toMatchObject({
        heading: "風切モータースの業務環境を調べる",
        progress: { discovered: 1, total: 13 },
      });
      expect(listener.mock.calls[0][0].facts[0].label).toBe(
        "スタッフ用の診断画面",
      );
      unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves between the exploration map and situation consultation", async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient("live")} />);

    expect(
      await screen.findByRole("heading", {
        name: "風切モータースの業務環境を調べる",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("progressbar", { name: "13件中3件を発見" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("見つけたflag")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("next-action-map"));

    expect(
      screen.getByRole("heading", { name: "次に確かめることを選ぶ" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: /まず、直結先で応答するサービスを整理する/,
      }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "地図に戻る" }));
    expect(
      screen.getByRole("heading", { name: "探索地図" }),
    ).toBeVisible();
  });

  it("selects and commits a hypothesis", async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient("live")} />);

    await user.click(await screen.findByTestId("next-action-map"));
    await user.click(
      screen.getByRole("button", {
        name: /匿名共有のバックアップを運用上の手掛かりとして読む/,
      }),
    );

    expect(
      screen.getByText(
        "ファイル名だけでなく、いつ・何のために残されたかを確認する。",
      ),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "この仮説で進む" }),
    );

    expect(
      await screen.findByText("次に確かめる仮説を記録しました。"),
    ).toBeInTheDocument();
  });

  it("shows the four EASY explanation layers", async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient("live")} />);

    await user.click(await screen.findByTestId("next-action-map"));
    await user.click(
      screen.getByRole("button", { name: "手掛かりを開く" }),
    );
    const hintDialog = screen.getByRole("dialog", {
      name: "手掛かり",
    });
    expect(
      within(hintDialog).getByText(
        "Kali側の有線IPと、10.13.37.10が応答するTCPサービスを見る。",
      ),
    ).toBeVisible();
    await user.click(
      within(hintDialog).getByRole("button", { name: /^使う道具/ }),
    );
    expect(
      await within(hintDialog).findByText(
        "ip addr、ping、nmapの順で、接続とサービスを分けて確認する。",
      ),
    ).toBeVisible();

    await user.click(
      within(hintDialog).getByRole("button", { name: /^組み立て方/ }),
    );
    expect(
      await within(hintDialog).findByText(
        "対象IPを固定し、名前解決やping応答に依存せずサービス版を確認する。",
      ),
    ).toBeVisible();

    await user.click(
      within(hintDialog).getByRole("button", { name: /^操作例/ }),
    );
    expect(
      await within(hintDialog).findByText(
        "nmap -sV -Pn 10.13.37.10",
      ),
    ).toBeVisible();
  });

  it("requires confirmation before ending a session", async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient("live")} />);
    await screen.findByRole("heading", {
      name: "風切モータースの業務環境を調べる",
    });

    await user.click(screen.getByLabelText("メニュー"));
    const endSession = screen.getByRole("button", { name: "表示を終了" });
    await user.click(endSession);
    expect(
      screen.getByRole("dialog", { name: "調査の表示を終了しますか？" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "探索を続ける" }),
    ).toHaveFocus();

    const close = screen.getByRole("button", { name: "閉じる" });
    close.focus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "終了する" })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "探索を続ける" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("メニュー")).toHaveFocus();

    await user.click(screen.getByLabelText("メニュー"));
    await user.click(screen.getByRole("button", { name: "表示を終了" }));
    await user.click(screen.getByRole("button", { name: "終了する" }));
    expect(
      screen.getByRole("heading", { name: "調査の表示を終了しました" }),
    ).toBeVisible();
  });

  it("renders an honest empty state", async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient("empty")} />);
    await user.click(
      await screen.findByRole("button", { name: "探索ツールを開く" }),
    );
    const factsDialog = screen.getByRole("dialog", {
      name: "探索ツール",
    });
    expect(
      within(factsDialog).getByText("まだ発見はありません。"),
    ).toBeVisible();
    expect(
      within(factsDialog).getByText(
        "まず有線接続と標的の入口を確認しましょう。",
      ),
    ).toBeVisible();
  });

  it("does not roll the screen back when an older live revision arrives", async () => {
    const user = userEvent.setup();
    const initial = await createFixtureClient("live").getState();
    let publish: ((projection: LabProjection) => void) | undefined;
    const client: LabClient = {
      getState: async () => structuredClone(initial),
      subscribe: (onProjection) => {
        publish = onProjection;
        return () => {
          publish = undefined;
        };
      },
      selectHypothesis: async () => undefined,
      unlockHint: async () => undefined,
      applyGuidance: async () => undefined,
    };

    render(<App client={client} />);
    await screen.findByRole("heading", {
      name: "風切モータースの業務環境を調べる",
    });
    await waitFor(() => expect(publish).toBeTypeOf("function"));
    await user.click(
      screen.getByRole("button", { name: "探索ツールを開く" }),
    );
    const factsDialog = screen.getByRole("dialog", {
      name: "探索ツール",
    });
    expect(
      within(factsDialog).getByText("スタッフ用の診断画面"),
    ).toBeVisible();

    const newer = structuredClone(initial);
    newer.revision = initial.revision + 2;
    newer.facts.push({
      id: "fact-newer",
      label: "新しいrevisionの事実",
      icon: "file",
    });
    publish!(newer);
    expect(
      await within(factsDialog).findByText("新しいrevisionの事実"),
    ).toBeVisible();

    const older = structuredClone(initial);
    older.revision = initial.revision + 1;
    older.facts = [
      {
        id: "fact-rollback",
        label: "巻き戻された事実",
        icon: "file",
      },
    ];
    publish!(older);

    await waitFor(() =>
      expect(
        within(factsDialog).getByText("新しいrevisionの事実"),
      ).toBeVisible(),
    );
    expect(
      within(factsDialog).queryByText("巻き戻された事実"),
    ).not.toBeInTheDocument();
  });

  it("reconciles map selection after a live graph revision", async () => {
    const user = userEvent.setup();
    const projection = await createFixtureClient("live").getState();
    const sharedProps = {
      connectionStatus: "live" as const,
      pendingAction: null,
      onRefresh: () => undefined,
      onOpenConsultation: () => undefined,
      experience: "live" as const,
      pairingPending: false,
      onPairSession: async () => true,
    };
    const { rerender } = render(
      <ExplorationMap projection={projection} {...sharedProps} />,
    );

    const fileNode = screen
      .getAllByRole("button", { name: /引き継ぎ用の共有/ })
      .find((button) => button.hasAttribute("aria-pressed"))!;
    await user.click(fileNode);
    expect(fileNode).toHaveAttribute("aria-pressed", "true");

    const stillVisible = structuredClone(projection);
    stillVisible.revision += 1;
    rerender(<ExplorationMap projection={stillVisible} {...sharedProps} />);
    expect(
      screen
        .getAllByRole("button", { name: /引き継ぎ用の共有/ })
        .find((button) => button.hasAttribute("aria-pressed")),
    ).toHaveAttribute("aria-pressed", "true");

    const removedSelection = structuredClone(stillVisible);
    removedSelection.revision += 1;
    removedSelection.graph.nodes = removedSelection.graph.nodes.map((node) =>
      node.id === "map-02"
        ? { ...node, state: "undiscovered", label: "共有" }
        : node.id === "map-03"
          ? { ...node, state: "selected" }
          : { ...node, state: node.state === "selected" ? "discovered" : node.state },
    );
    rerender(
      <ExplorationMap projection={removedSelection} {...sharedProps} />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /整備場のNFS共有/ }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("reconciles consultation selection without discarding a valid user choice", async () => {
    const user = userEvent.setup();
    const projection = await createFixtureClient("live").getState();
    const sharedProps = {
      connectionStatus: "live" as const,
      pendingAction: null,
      onRefresh: () => undefined,
      onSelectHypothesis: async () => true,
      onUnlockHint: async () => true,
      onBackToMap: () => undefined,
    };
    const { rerender } = render(
      <SituationConsultation
        projection={projection}
        {...sharedProps}
      />,
    );

    const userChoice = screen.getByRole("button", {
      name: /匿名共有のバックアップを運用上の手掛かりとして読む/,
    });
    await user.click(userChoice);

    const refreshed = structuredClone(projection);
    refreshed.revision += 1;
    rerender(
      <SituationConsultation projection={refreshed} {...sharedProps} />,
    );
    expect(userChoice).toHaveAttribute("aria-pressed", "true");

    const removedChoice = structuredClone(refreshed);
    removedChoice.revision += 1;
    removedChoice.hypotheses = removedChoice.hypotheses
      .filter((hypothesis) => hypothesis.id !== "hyp-backup-trust")
      .map((hypothesis) => ({
        ...hypothesis,
        selected: hypothesis.id === "hyp-nfs-ownership",
      }));
    rerender(
      <SituationConsultation projection={removedChoice} {...sharedProps} />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: /NFS上の所有者と書き込み可能範囲を確かめる/,
        }),
      ).toHaveAttribute("aria-pressed", "true"),
    );

    rerender(
      <SituationConsultation
        projection={removedChoice}
        preferredHypothesisId="hyp-web-input-boundary"
        {...sharedProps}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: /診断入力がどこまでOSへ渡るか確かめる/,
        }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
  });

});

describe("projection boundary", () => {
  it("keeps the latest four events in chronological display order", () => {
    const projection = normalizeProjection({
      recentEvents: Array.from({ length: 6 }, (_, index) => ({
        id: `event-${index + 1}`,
        at: `10:0${index + 1}`,
        message: `発見 ${index + 1}`,
      })),
    });

    expect(projection.recentEvents.map((event) => event.id)).toEqual([
      "event-3",
      "event-4",
      "event-5",
      "event-6",
    ]);
  });

  it("removes hidden labels and locked hint bodies", () => {
    const projection = normalizeProjection({
      sessionId: "boundary-test",
      graph: {
        nodes: [
          {
            id: "map-opaque",
            state: "undiscovered",
            category: "権限昇格",
            label: "secret route name",
            detail: "secret route detail",
          },
        ],
        edges: [],
      },
      hints: [
        {
          id: "hint-locked",
          step: 2,
          title: "使う道具",
          state: "locked",
          body: "secret locked hint",
        },
      ],
      progress: { discovered: 0, total: 13 },
      telemetry: { status: "live" },
    });

    expect(projection.graph.nodes[0]).toMatchObject({
      id: "map-opaque",
      label: "権限昇格",
      category: "権限昇格",
      detail: undefined,
    });
    expect(JSON.stringify(projection.graph.nodes[0])).not.toContain(
      "secret route",
    );
    expect(projection.hints[0].body).toBeUndefined();
  });

  it("does not accept an arbitrary hidden label as a public category", () => {
    const projection = normalizeProjection({
      graph: {
        nodes: [
          {
            id: "map-hidden-category",
            state: "undiscovered",
            category: "秘密のroot経路名",
            label: "別の秘密",
          },
        ],
        edges: [],
      },
    });

    expect(projection.graph.nodes[0]).toMatchObject({
      label: "未発見",
      category: undefined,
    });
    expect(JSON.stringify(projection.graph.nodes[0])).not.toContain("秘密");
  });
});
