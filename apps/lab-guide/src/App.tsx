import {
  IconCircleCheck,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import {
  LabRequestError,
  pairLabSession,
  resolveLabClient,
} from "./api";
import { AppHeader } from "./components/AppHeader";
import { EndSessionDialog } from "./components/EndSessionDialog";
import { ExplorationMap } from "./components/ExplorationMap";
import { SituationConsultation } from "./components/SituationConsultation";
import {
  applyTheme,
  persistTheme,
  readStoredTheme,
  type ThemeMode,
} from "./theme";
import type {
  ExperienceMode,
  LabClient,
  ScreenId,
} from "./types";
import { useLabSession } from "./useLabSession";

interface AppProps {
  client?: LabClient;
  initialExperience?: ExperienceMode;
}

export function App({
  client: injectedClient,
  initialExperience = "live",
}: AppProps) {
  const [client, setClient] = useState<LabClient | null>(
    injectedClient ?? null,
  );
  const [clientResolutionFailed, setClientResolutionFailed] = useState(false);
  const [experience, setExperience] = useState<ExperienceMode>(
    injectedClient ? initialExperience : "browse",
  );
  const [pairingPending, setPairingPending] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [activeScreen, setActiveScreen] = useState<ScreenId>("map");
  const [preferredHypothesisId, setPreferredHypothesisId] = useState<
    string | undefined
  >();
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme());
  const session = useLabSession(client);

  const loadClient = useCallback(async () => {
    if (injectedClient) {
      setClient(injectedClient);
      return;
    }
    setClientResolutionFailed(false);
    try {
      const resolved = await resolveLabClient();
      setClient(resolved.client);
      setExperience(resolved.experience);
    } catch {
      setClientResolutionFailed(true);
    }
  }, [injectedClient]);

  useEffect(() => {
    if (!client) void loadClient();
  }, [client, loadClient]);

  useEffect(() => {
    if (!session.announcement) return;
    const timer = window.setTimeout(session.clearAnnouncement, 5500);
    return () => window.clearTimeout(timer);
  }, [session.announcement, session.clearAnnouncement]);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const openConsultation = (hypothesisId?: string) => {
    setPreferredHypothesisId(hypothesisId);
    setActiveScreen("consultation");
  };

  const pairSession = async (code: string): Promise<boolean> => {
    setPairingPending(true);
    setPairingError("");
    try {
      const pairedClient = await pairLabSession(code);
      setClient(pairedClient);
      setExperience("live");
      setActiveScreen("map");
      setSessionEnded(false);
      return true;
    } catch (error) {
      setPairingError(
        error instanceof LabRequestError
          ? error.message
          : "ライブセッションへ接続できませんでした。コードと通信を確認してください。",
      );
      return false;
    } finally {
      setPairingPending(false);
    }
  };

  const closeEndDialog = useCallback(() => setEndDialogOpen(false), []);
  const confirmEndSession = () => {
    setSessionEnded(true);
    setEndDialogOpen(false);
  };

  return (
    <div className="app-root" data-theme={theme}>
      <AppHeader
        activeScreen={activeScreen}
        onScreenChange={setActiveScreen}
        onEnd={() => setEndDialogOpen(true)}
        sessionEnded={sessionEnded}
        experience={experience}
        theme={theme}
        onThemeChange={setTheme}
      />

      {sessionEnded ? (
        <main className="session-ended-state">
          <IconCircleCheck aria-hidden="true" />
          <h1>演習の表示を終了しました</h1>
          <p>
            標的ノートはまだ初期化されていません。機材には触れず、運営者へ復旧を依頼してください。
          </p>
        </main>
      ) : session.projection ? (
        activeScreen === "map" ? (
          <ExplorationMap
            projection={session.projection}
            connectionStatus={session.connectionStatus}
            pendingAction={session.pendingAction}
            onRefresh={() => void session.refresh()}
            onOpenConsultation={openConsultation}
            onSubmitFlag={session.submitFlag}
            experience={experience}
            pairingPending={pairingPending}
            pairingError={pairingError}
            onPairSession={pairSession}
          />
        ) : (
          <SituationConsultation
            projection={session.projection}
            connectionStatus={session.connectionStatus}
            pendingAction={session.pendingAction}
            preferredHypothesisId={preferredHypothesisId}
            onRefresh={() => void session.refresh()}
            onSelectHypothesis={session.selectHypothesis}
            onUnlockHint={session.unlockHint}
            onSubmitFlag={session.submitFlag}
            onBackToMap={() => setActiveScreen("map")}
          />
        )
      ) : (
        <main className="initial-state" aria-live="polite">
          {session.connectionStatus === "unavailable" ||
          clientResolutionFailed ? (
            <>
              <IconRefresh aria-hidden="true" />
              <h1>学習サイトに接続できません</h1>
              <p>有線接続を確認して、状態をもう一度読み込んでください。</p>
              <button
                type="button"
                className="primary-action"
                onClick={() =>
                  clientResolutionFailed
                    ? void loadClient()
                    : void session.refresh()
                }
              >
                <IconRefresh aria-hidden="true" />
                再読込
              </button>
            </>
          ) : (
            <>
              <IconLoader2 className="spin" aria-hidden="true" />
              <h1>標的の状態を確認しています</h1>
              <p>接続できると、見つけた事実から探索地図を組み立てます。</p>
            </>
          )}
        </main>
      )}

      <div className="sr-only" role="status" aria-live="polite">
        {session.announcement}
      </div>

      <EndSessionDialog
        open={experience === "live" && endDialogOpen}
        onCancel={closeEndDialog}
        onConfirm={confirmEndSession}
      />
    </div>
  );
}
