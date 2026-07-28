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
import { ManualFlagForm } from "./components/ManualFlagForm";
import {
  fallbackPositionFor,
  WORLD_POSITIONS,
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
        name: "風切モータースの世界を先に歩く",
      }),
    ).toBeVisible();
    expect(screen.getByText("公開ガイド")).toBeVisible();
    expect(screen.queryByLabelText(/接続コード/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const pairingPull = screen.getByRole("button", {
      name: /^ライブ接続、6文字を開く$/,
    });
    expect(pairingPull).toHaveAttribute("aria-expanded", "false");

    await user.click(pairingPull);
    const pairingDialog = screen.getByRole("dialog", { name: "ライブ接続" });
    expect(within(pairingDialog).getByLabelText(/接続コード/)).toBeVisible();
    expect(
      within(pairingDialog).getByRole("button", { name: "ライブ接続" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "演習を終了" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("見つけたflag")).not.toBeInTheDocument();
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
      name: /^ライブ接続、6文字を開く$/,
    });
    pairingPull.focus();
    await user.click(pairingPull);

    const dialog = screen.getByRole("dialog", { name: "ライブ接続" });
    const close = within(dialog).getByRole("button", {
      name: "ライブ接続を閉じる",
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

  it("updates pull counts without opening a drawer on a live discovery", async () => {
    render(<App client={createFixtureClient("transition")} />);

    expect(
      await screen.findByRole("heading", {
        name: "標的との接続を確かめる",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /^事実、0件を開く$/ }),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    expect(
      await screen.findByRole(
        "heading",
        { name: "Webの入口を発見" },
        { timeout: 2_000 },
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /^事実、1件を開く$/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /^最近の発見、1件を開く$/ }),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("defaults to PLAY and changes art direction without losing the active screen", async () => {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute("data-theme");
    const user = userEvent.setup();
    render(<App client={createFixtureClient("live")} />);

    await user.click(screen.getByLabelText("見た目 PLAY"));
    const themeGroup = screen.getByRole("group", { name: "表示テーマ" });
    expect(
      within(themeGroup).getByRole("button", {
        name: "PLAY ポップゲーム",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveAttribute("data-theme", "play");

    await user.click(
      screen.getByRole("button", { name: "状況相談" }),
    );
    await user.click(
      within(themeGroup).getByRole("button", {
        name: "OPS ハッカー",
      }),
    );

    expect(document.documentElement).toHaveAttribute("data-theme", "ops");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("ops");
    expect(
      screen.getByRole("heading", { name: "次に確かめることを選ぶ" }),
    ).toBeVisible();
    await user.click(screen.getByLabelText("見た目 OPS"));
    expect(
      within(themeGroup).getByRole("button", {
        name: "OPS ハッカー",
      }),
    ).toHaveAttribute("aria-pressed", "true");

    window.localStorage.removeItem(THEME_STORAGE_KEY);
  });

  it("restores a persisted visual mode", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "focus");
    const user = userEvent.setup();
    render(<App client={createFixtureClient("live")} />);

    expect(await screen.findByLabelText("見た目 FOCUS")).toBeVisible();
    await user.click(screen.getByLabelText("見た目 FOCUS"));
    expect(
      screen.getByRole("button", { name: "FOCUS シンプル" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveAttribute("data-theme", "focus");

    window.localStorage.removeItem(THEME_STORAGE_KEY);
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
    expect(WORLD_POSITIONS.size).toBe(14);
    expect(
      new Set(
        [...WORLD_POSITIONS.values()].map(({ x, y }) => `${x}:${y}`),
      ).size,
    ).toBe(14);
  });

  it("keeps a subset on its stable topology rows", () => {
    const subset = ["map-01", "map-02", "map-03", "map-05"].map(
      fallbackPositionFor,
    );
    expect(subset[3]).toEqual({ x: 205, y: 155 });
    expect(subset[3]).not.toEqual(fallbackPositionFor("map-04"));
  });

  it("exercises all fourteen telemetry map IDs in the success fixture", async () => {
    const projection = await createFixtureClient("success").getState();
    expect(projection.graph.nodes.map((node) => node.id)).toEqual(
      Array.from({ length: 14 }, (_, index) =>
        `map-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(
      projection.graph.nodes.every((node) => node.position === undefined),
    ).toBe(true);
  });

  it("publishes a live discovery without reloading the client", async () => {
    vi.useFakeTimers();
    try {
      const client = createFixtureClient("transition");
      const initial = await client.getState();
      const listener = vi.fn();
      const unsubscribe = client.subscribe(listener, vi.fn());

      expect(initial.heading).toBe("標的との接続を確かめる");
      expect(initial.facts).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(900);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toMatchObject({
        heading: "Webの入口を発見",
        progress: { discovered: 1, total: 14 },
      });
      expect(listener.mock.calls[0][0].facts[0].label).toBe(
        "Webサイトが見える",
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
        name: "中古バイク店の業務サーバを調べる",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("progressbar", { name: "14件中3件を発見" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("見つけたflag")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "状況相談" }));

    expect(
      screen.getByRole("heading", { name: "次に確かめることを選ぶ" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: /スタッフ向け画面の入力を試す/,
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

    await user.click(await screen.findByRole("button", { name: "状況相談" }));
    await user.click(
      screen.getByRole("button", {
        name: /公開ファイルに別の手掛かりがないか探す/,
      }),
    );

    expect(
      screen.getByText("公開範囲に置かれたファイル名と更新時刻を見比べます。"),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "この仮説で進む" }),
    );

    expect(
      await screen.findByText("次に確かめる仮説を記録しました。"),
    ).toBeInTheDocument();
  });

  it("unlocks hints in order", async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient("live")} />);

    await user.click(await screen.findByRole("button", { name: "状況相談" }));
    await user.click(
      screen.getByRole("button", { name: /^ヒント、3段階を開く$/ }),
    );
    const hintDialog = screen.getByRole("dialog", {
      name: "必要ならヒント",
    });
    expect(
      within(hintDialog).getByText(
        "入力した文字と、画面に返る結果の関係を見ます。",
      ),
    ).toBeVisible();
    const operationHint = within(hintDialog).getByRole("button", {
      name: /^操作例/,
    });
    expect(operationHint).toBeDisabled();
    expect(
      within(hintDialog).getByText("「使う道具」を確認すると開けます"),
    ).toBeVisible();

    await user.click(
      within(hintDialog).getByRole("button", { name: /^使う道具/ }),
    );
    expect(
      await within(hintDialog).findByText(
        "ブラウザの開発者ツールで、送信された項目を確認します。",
      ),
    ).toBeVisible();

    expect(operationHint).toBeEnabled();
    await user.click(operationHint);
    expect(
      await within(hintDialog).findByText(
        "無害な入力を一つずつ変え、返り方の差を記録します。",
      ),
    ).toBeVisible();
  });

  it("offers manual flag submission only when telemetry is unavailable", async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient("unavailable")} />);

    await user.click(
      await screen.findByRole("button", { name: /^次の調査、/ }),
    );
    const investigationDialog = screen.getByRole("dialog", {
      name: "次の調査",
    });
    const input = within(investigationDialog).getByLabelText("見つけたflag");
    await user.type(input, "manual-proof");
    await user.click(
      within(investigationDialog).getByRole("button", { name: "提出" }),
    );

    expect(
      await within(input.closest("form")!).findByText(
        "提出を受け付けました。状態をもう一度確認します。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "提出を受け付けました。状態をもう一度確認します。",
      ),
    ).toHaveLength(1);
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("always offers the post-root Windows bonus flag manually", async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient("success")} />);

    await user.click(
      await screen.findByRole("button", { name: /^次の調査、/ }),
    );
    const investigationDialog = screen.getByRole("dialog", {
      name: "次の調査",
    });
    expect(
      within(investigationDialog).getByLabelText("Windowsで見つけたflag"),
    ).toBeVisible();
    expect(
      within(investigationDialog).getByText(
        "root取得後のWindows追加flagは手動で確認します。",
      ),
    ).toBeVisible();
  });

  it("requires confirmation before ending a session", async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient("live")} />);
    await screen.findByRole("heading", {
      name: "中古バイク店の業務サーバを調べる",
    });

    const endSession = screen.getByRole("button", { name: "演習を終了" });
    await user.click(endSession);
    expect(
      screen.getByRole("dialog", { name: "演習を終了しますか？" }),
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
    expect(endSession).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "演習を終了" }));
    await user.click(screen.getByRole("button", { name: "終了する" }));
    expect(
      screen.getByRole("heading", { name: "演習の表示を終了しました" }),
    ).toBeVisible();
  });

  it("renders an honest empty state", async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient("empty")} />);
    await user.click(
      await screen.findByRole("button", { name: /^事実、0件を開く$/ }),
    );
    const factsDialog = screen.getByRole("dialog", {
      name: "分かっていること",
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
      submitFlag: async () => ({
        accepted: false,
        message: "not used",
      }),
    };

    render(<App client={client} />);
    await screen.findByRole("heading", {
      name: "中古バイク店の業務サーバを調べる",
    });
    await waitFor(() => expect(publish).toBeTypeOf("function"));
    await user.click(
      screen.getByRole("button", { name: /^事実、3件を開く$/ }),
    );
    const factsDialog = screen.getByRole("dialog", {
      name: "分かっていること",
    });
    expect(within(factsDialog).getByText("Webサイトが見える")).toBeVisible();

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
      onSubmitFlag: async () => undefined,
      experience: "live" as const,
      pairingPending: false,
      onPairSession: async () => true,
    };
    const { rerender } = render(
      <ExplorationMap projection={projection} {...sharedProps} />,
    );

    const fileNode = screen
      .getAllByRole("button", { name: /ファイル置き場/ })
      .find((button) => button.hasAttribute("aria-pressed"))!;
    await user.click(fileNode);
    expect(fileNode).toHaveAttribute("aria-pressed", "true");

    const stillVisible = structuredClone(projection);
    stillVisible.revision += 1;
    rerender(<ExplorationMap projection={stillVisible} {...sharedProps} />);
    expect(
      screen
        .getAllByRole("button", { name: /ファイル置き場/ })
        .find((button) => button.hasAttribute("aria-pressed")),
    ).toHaveAttribute("aria-pressed", "true");

    const removedSelection = structuredClone(stillVisible);
    removedSelection.revision += 1;
    removedSelection.graph.nodes = removedSelection.graph.nodes.map((node) =>
      node.id === "file-drop"
        ? { ...node, state: "undiscovered", label: "未発見" }
        : node.id === "admin"
          ? { ...node, state: "selected" }
          : { ...node, state: node.state === "selected" ? "discovered" : node.state },
    );
    rerender(
      <ExplorationMap projection={removedSelection} {...sharedProps} />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Linux管理者/ }),
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
      onSubmitFlag: async () => undefined,
      onBackToMap: () => undefined,
    };
    const { rerender } = render(
      <SituationConsultation
        projection={projection}
        {...sharedProps}
      />,
    );

    const userChoice = screen.getByRole("button", {
      name: /公開ファイルに別の手掛かりがないか探す/,
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
      .filter((hypothesis) => hypothesis.id !== "hypothesis-public-files")
      .map((hypothesis) => ({
        ...hypothesis,
        selected: hypothesis.id === "hypothesis-login",
      }));
    rerender(
      <SituationConsultation projection={removedChoice} {...sharedProps} />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: /ログイン用の情報が残っていないか調べる/,
        }),
      ).toHaveAttribute("aria-pressed", "true"),
    );

    rerender(
      <SituationConsultation
        projection={removedChoice}
        preferredHypothesisId="hypothesis-input"
        {...sharedProps}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: /スタッフ向け画面の入力を試す/,
        }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("shows rejected and accepted manual flag results beside the form", async () => {
    const user = userEvent.setup();
    const submit = vi
      .fn()
      .mockResolvedValueOnce({
        accepted: false,
        message: "flagを確認できませんでした。",
      })
      .mockResolvedValueOnce({
        accepted: true,
        message: "flagを確認しました。",
      });
    render(
      <ManualFlagForm
        pending={false}
        onSubmit={submit}
        mode="fallback"
      />,
    );

    const input = screen.getByLabelText("見つけたflag");
    await user.type(input, "LAB-wrong");
    await user.click(screen.getByRole("button", { name: "提出" }));
    expect(
      await screen.findByText("flagを確認できませんでした。"),
    ).toBeVisible();
    expect(input).toHaveValue("LAB-wrong");
    expect(input).toHaveAttribute("aria-invalid", "true");

    await user.clear(input);
    await user.type(input, "LAB-correct");
    await user.click(screen.getByRole("button", { name: "提出" }));
    expect(await screen.findByText("flagを確認しました。")).toBeVisible();
    await waitFor(() => expect(input).toHaveValue(""));
    expect(submit).toHaveBeenCalledTimes(2);
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
      progress: { discovered: 0, total: 14 },
      telemetry: { status: "live" },
    });

    expect(projection.graph.nodes[0]).toMatchObject({
      id: "map-opaque",
      label: "未発見",
      detail: undefined,
    });
    expect(projection.hints[0].body).toBeUndefined();
  });
});
