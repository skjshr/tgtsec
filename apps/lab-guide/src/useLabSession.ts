import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConnectionStatus,
  LabClient,
  LabProjection,
} from "./types";

interface LabSessionState {
  projection: LabProjection | null;
  connectionStatus: ConnectionStatus;
  pendingAction: string | null;
  announcement: string;
  refresh: () => Promise<void>;
  selectHypothesis: (id: string) => Promise<boolean>;
  unlockHint: (id: string) => Promise<boolean>;
  applyGuidance: (commandId: string) => Promise<boolean>;
  clearAnnouncement: () => void;
}

function messageForError(action: string): string {
  if (action === "hint") {
    return "このヒントはまだ開けません。上のヒントから確認してください。";
  }
  if (action === "guidance") {
    return "表示設定を変更できませんでした。接続を確認してください。";
  }
  if (action === "hypothesis") {
    return "仮説を記録できませんでした。状態を再読込して、もう一度試してください。";
  }
  return "状態を読み込めませんでした。接続を確認してください。";
}

export function useLabSession(client: LabClient | null): LabSessionState {
  const [projection, setProjection] = useState<LabProjection | null>(null);
  const projectionRef = useRef<LabProjection | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("loading");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const acceptProjection = useCallback((nextProjection: LabProjection) => {
    const currentProjection = projectionRef.current;
    if (
      currentProjection?.sessionId === nextProjection.sessionId &&
      nextProjection.revision < currentProjection.revision
    ) {
      return;
    }

    if (
      currentProjection?.experience === "live" &&
      nextProjection.experience === "live" &&
      currentProjection.sessionId === nextProjection.sessionId &&
      nextProjection.revision > currentProjection.revision
    ) {
      setAnnouncement("新しい発見を地図と選択肢へ反映しました。");
    }

    projectionRef.current = nextProjection;
    setProjection(nextProjection);
    setConnectionStatus(nextProjection.telemetry.status);
  }, []);

  useEffect(() => {
    if (!client) return;

    const controller = new AbortController();
    let unsubscribe: () => void = () => undefined;
    let disposed = false;

    setConnectionStatus("loading");
    client
      .getState(controller.signal)
      .then((initialProjection) => {
        if (disposed) return;
        acceptProjection(initialProjection);
        unsubscribe = client.subscribe(
          (nextProjection) => {
            if (!disposed) acceptProjection(nextProjection);
          },
          () => {
            if (disposed) return;
            setConnectionStatus(
              projectionRef.current ? "reconnecting" : "unavailable",
            );
          },
        );
      })
      .catch((error: unknown) => {
        if (disposed || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setConnectionStatus("unavailable");
        setAnnouncement(messageForError("load"));
      });

    return () => {
      disposed = true;
      controller.abort();
      unsubscribe();
    };
  }, [acceptProjection, client]);

  const refresh = useCallback(async () => {
    if (!client) return;
    setConnectionStatus("loading");
    setPendingAction("refresh");
    try {
      acceptProjection(await client.getState());
      setAnnouncement("最新の状態を読み込みました。");
    } catch {
      setConnectionStatus(
        projectionRef.current ? "reconnecting" : "unavailable",
      );
      setAnnouncement(messageForError("load"));
    } finally {
      setPendingAction(null);
    }
  }, [acceptProjection, client]);

  const runProjectionAction = useCallback(
    async (
      action: "hint" | "hypothesis" | "guidance",
      request: () => Promise<LabProjection | undefined>,
      successMessage: string,
    ): Promise<boolean> => {
      if (!client) return false;
      setPendingAction(action);
      try {
        const nextProjection = await request();
        if (nextProjection) {
          acceptProjection(nextProjection);
        } else {
          acceptProjection(await client.getState());
        }
        setAnnouncement(successMessage);
        return true;
      } catch {
        setAnnouncement(messageForError(action));
        return false;
      } finally {
        setPendingAction(null);
      }
    },
    [acceptProjection, client],
  );

  const selectHypothesis = useCallback(
    async (id: string) =>
      runProjectionAction(
        "hypothesis",
        () => client!.selectHypothesis(id),
        "次に確かめる仮説を記録しました。",
      ),
    [client, runProjectionAction],
  );

  const unlockHint = useCallback(
    async (id: string) =>
      runProjectionAction(
        "hint",
        () => client!.unlockHint(id),
        "ヒントを開きました。",
      ),
    [client, runProjectionAction],
  );

  const applyGuidance = useCallback(
    async (commandId: string) =>
      runProjectionAction(
        "guidance",
        () => client!.applyGuidance(commandId),
        "表示設定を変更しました。",
      ),
    [client, runProjectionAction],
  );

  return {
    projection,
    connectionStatus,
    pendingAction,
    announcement,
    refresh,
    selectHypothesis,
    unlockHint,
    applyGuidance,
    clearAnnouncement: () => setAnnouncement(""),
  };
}
