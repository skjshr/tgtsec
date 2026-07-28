import {
  IconArrowRight,
  IconBulb,
  IconChevronDown,
  IconChevronUp,
  IconCircle,
  IconCircleDotFilled,
  IconCircleNumber1,
  IconCircleNumber2,
  IconCircleNumber3,
  IconInfoCircle,
  IconListCheck,
  IconListDetails,
  IconLock,
  IconMap2,
  IconMessageCircleQuestion,
  IconTargetArrow,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConnectionStatus,
  FlagSubmissionResult,
  Hint,
  LabProjection,
} from "../types";
import { ConnectionBanner } from "./ConnectionBanner";
import {
  DisclosureDrawer,
  DisclosurePull,
  ToolShelf,
  type ToolShelfItem,
} from "./DisclosureDrawer";
import { EventStrip } from "./EventStrip";
import { KnownFacts } from "./KnownFacts";
import { ManualFlagForm } from "./ManualFlagForm";

interface SituationConsultationProps {
  projection: LabProjection;
  connectionStatus: ConnectionStatus;
  pendingAction: string | null;
  preferredHypothesisId?: string;
  onRefresh: () => void;
  onSelectHypothesis: (id: string) => Promise<boolean>;
  onUnlockHint: (id: string) => Promise<boolean>;
  onSubmitFlag: (
    flag: string,
  ) => Promise<FlagSubmissionResult | undefined>;
  onBackToMap: () => void;
}

function stepIcon(step: Hint["step"]) {
  if (step === 2) return <IconCircleNumber2 aria-hidden="true" />;
  if (step === 3) return <IconCircleNumber3 aria-hidden="true" />;
  return <IconCircleNumber1 aria-hidden="true" />;
}

interface HintRailProps {
  hints: Hint[];
  pending: boolean;
  manualFlagMode: false | "fallback" | "bonus";
  onUnlock: (id: string) => Promise<boolean>;
  onSubmitFlag: (
    flag: string,
  ) => Promise<FlagSubmissionResult | undefined>;
  flagPending: boolean;
  showTitle?: boolean;
}

function HintRail({
  hints,
  pending,
  manualFlagMode,
  onUnlock,
  onSubmitFlag,
  flagPending,
  showTitle = true,
}: HintRailProps) {
  const firstUnlocked = hints.find((hint) => hint.state === "unlocked")?.id;
  const [openHintId, setOpenHintId] = useState<string | undefined>(
    firstUnlocked,
  );

  const handleHint = async (hint: Hint) => {
    if (hint.state === "unlocked") {
      setOpenHintId((current) => (current === hint.id ? undefined : hint.id));
      return;
    }
    const unlocked = await onUnlock(hint.id);
    if (unlocked) setOpenHintId(hint.id);
  };

  return (
    <aside className="hint-rail">
      {showTitle ? <h2>必要ならヒント</h2> : null}
      <div className="hint-list">
        {hints.map((hint) => {
          const open = hint.state === "unlocked" && openHintId === hint.id;
          return (
            <section
              className={`hint-step hint-step--${hint.state}`}
              key={hint.id}
            >
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`hint-content-${hint.id}`}
                onClick={() => void handleHint(hint)}
                disabled={pending || hint.state === "locked"}
              >
                {stepIcon(hint.step)}
                <span>
                  <strong>{hint.title}</strong>
                  {hint.state !== "unlocked" && hint.condition ? (
                    <small>{hint.condition}</small>
                  ) : null}
                </span>
                {hint.state === "locked" ? (
                  <IconLock aria-hidden="true" />
                ) : open ? (
                  <IconChevronUp aria-hidden="true" />
                ) : (
                  <IconChevronDown aria-hidden="true" />
                )}
              </button>
              {open ? (
                <div id={`hint-content-${hint.id}`} className="hint-content">
                  <p>{hint.body}</p>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      <p className="hint-order-note">
        <IconInfoCircle aria-hidden="true" />
        ヒントは上から順に開放されます
      </p>

      {manualFlagMode ? (
        <ManualFlagForm
          pending={flagPending}
          onSubmit={onSubmitFlag}
          mode={manualFlagMode}
        />
      ) : null}
    </aside>
  );
}

type ConsultationDisclosure = "facts" | "hints" | "events";

export function SituationConsultation({
  projection,
  connectionStatus,
  pendingAction,
  preferredHypothesisId,
  onRefresh,
  onSelectHypothesis,
  onUnlockHint,
  onSubmitFlag,
  onBackToMap,
}: SituationConsultationProps) {
  const defaultHypothesisId = useMemo(
    () =>
      preferredHypothesisId ??
      projection.hypotheses.find((hypothesis) => hypothesis.selected)?.id ??
      projection.hypotheses[0]?.id,
    [preferredHypothesisId, projection.hypotheses],
  );
  const [selectedHypothesisId, setSelectedHypothesisId] = useState(
    defaultHypothesisId,
  );
  const [activeDisclosure, setActiveDisclosure] =
    useState<ConsultationDisclosure | null>(null);
  const previousPreferredId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const availableHypotheses = projection.hypotheses.filter(
      (hypothesis) => hypothesis.available !== false,
    );
    const preferredChanged =
      previousPreferredId.current !== preferredHypothesisId;
    previousPreferredId.current = preferredHypothesisId;

    setSelectedHypothesisId((currentSelection) => {
      if (
        preferredChanged &&
        preferredHypothesisId &&
        availableHypotheses.some(
          (hypothesis) => hypothesis.id === preferredHypothesisId,
        )
      ) {
        return preferredHypothesisId;
      }
      if (
        currentSelection &&
        availableHypotheses.some(
          (hypothesis) => hypothesis.id === currentSelection,
        )
      ) {
        return currentSelection;
      }
      return (
        availableHypotheses.find((hypothesis) => hypothesis.selected)?.id ??
        availableHypotheses[0]?.id
      );
    });
  }, [
    preferredHypothesisId,
    projection.hypotheses,
    projection.revision,
  ]);

  const selectedHypothesis =
    projection.hypotheses.find(
      (hypothesis) => hypothesis.id === selectedHypothesisId,
    ) ?? projection.hypotheses[0];

  const commitHypothesis = async () => {
    if (!selectedHypothesisId) return;
    await onSelectHypothesis(selectedHypothesisId);
  };

  const manualFlagMode: false | "fallback" | "bonus" =
    projection.capabilities.manualFlagSubmission
      ? projection.status === "complete"
        ? "bonus"
        : connectionStatus === "unavailable"
          ? "fallback"
          : false
      : false;
  const drawerId = "consultation-disclosure-drawer";
  const shelfItems: ToolShelfItem<ConsultationDisclosure>[] = [
    {
      id: "facts",
      label: "事実",
      meta: `${projection.facts.length}件`,
      icon: <IconListCheck />,
    },
    {
      id: "hints",
      label: "ヒント",
      meta: `${projection.hints.length}段階`,
      icon: <IconBulb />,
    },
    {
      id: "events",
      label: "履歴",
      meta: `${projection.recentEvents.length}件`,
      icon: <IconListDetails />,
    },
  ];

  return (
    <main className="lab-screen consultation-screen">
      <section className="consultation-stage">
        {connectionStatus !== "browse" ? (
          <ConnectionBanner
            status={connectionStatus}
            message={projection.telemetry.message}
            refreshing={pendingAction === "refresh"}
            onRefresh={onRefresh}
          />
        ) : null}
        <div className="stage-heading-row">
          <header className="consultation-intro">
            <span className="stage-eyebrow">状況相談</span>
            <h1>次に確かめることを選ぶ</h1>
          </header>
          <nav className="disclosure-pulls" aria-label="必要な情報を開く">
            <DisclosurePull
              label="相談ツール"
              icon={<IconBulb />}
              controls={drawerId}
              open={activeDisclosure !== null}
              onClick={() => setActiveDisclosure("hints")}
            />
          </nav>
        </div>

        <section className="stage-context" aria-label="現在の目標">
          <IconTargetArrow aria-hidden="true" />
          <div>
            <small>現在の目標</small>
            <strong>{projection.objective}</strong>
          </div>
        </section>

        {projection.hypotheses.length > 0 ? (
          <>
            <fieldset className="hypothesis-fieldset">
              <legend>
                {projection.consultationQuestion}
              </legend>
              <div className="hypothesis-options">
                {projection.hypotheses.slice(0, 3).map((hypothesis) => {
                  const selected = hypothesis.id === selectedHypothesisId;
                  return (
                    <button
                      type="button"
                      className={`hypothesis-option ${selected ? "is-selected" : ""}`}
                      aria-pressed={selected}
                      disabled={hypothesis.available === false}
                      key={hypothesis.id}
                      onClick={() => setSelectedHypothesisId(hypothesis.id)}
                    >
                      {selected ? (
                        <IconCircleDotFilled aria-hidden="true" />
                      ) : (
                        <IconCircle aria-hidden="true" />
                      )}
                      <span>{hypothesis.label}</span>
                      <IconArrowRight aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {selectedHypothesis ? (
              <section
                className="hypothesis-explanation"
                aria-labelledby="hypothesis-explanation-title"
              >
                <IconBulb aria-hidden="true" />
                <div>
                  <h2 id="hypothesis-explanation-title">
                    この仮説で確かめること
                  </h2>
                  <p>{selectedHypothesis.summary}</p>
                </div>
              </section>
            ) : null}

            <div className="consultation-actions">
              <button
                type="button"
                className="primary-action"
                onClick={() => void commitHypothesis()}
                disabled={!selectedHypothesisId || pendingAction === "hypothesis"}
              >
                <IconArrowRight aria-hidden="true" />
                {pendingAction === "hypothesis"
                  ? "記録しています"
                  : "この仮説で進む"}
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={onBackToMap}
              >
                <IconMap2 aria-hidden="true" />
                地図に戻る
              </button>
            </div>
          </>
        ) : (
          <section className="consultation-empty">
            <IconInfoCircle aria-hidden="true" />
            <h2>まず接続を確認しましょう</h2>
            <p>事実が1つ見つかると、ここに選べる仮説が表示されます。</p>
            <button type="button" className="secondary-action" onClick={onBackToMap}>
              <IconMap2 aria-hidden="true" />
              地図に戻る
            </button>
          </section>
        )}
      </section>

      <DisclosureDrawer
        id={drawerId}
        open={activeDisclosure !== null}
        title="相談ツール"
        onClose={() => setActiveDisclosure(null)}
      >
        {activeDisclosure ? (
          <ToolShelf
            items={shelfItems}
            active={activeDisclosure}
            onSelect={setActiveDisclosure}
          />
        ) : null}

        {activeDisclosure === "facts" ? (
          <KnownFacts
            facts={projection.facts}
            title="いま分かっていること"
            detailed
            showHeading={false}
            showContextCards={false}
          />
        ) : null}

        {activeDisclosure === "hints" ? (
          <HintRail
            hints={projection.hints}
            pending={pendingAction === "hint"}
            manualFlagMode={manualFlagMode}
            onUnlock={onUnlockHint}
            onSubmitFlag={onSubmitFlag}
            flagPending={pendingAction === "flag"}
            showTitle={false}
          />
        ) : null}

        {activeDisclosure === "events" ? (
          <EventStrip
            events={projection.recentEvents}
            connectionStatus={connectionStatus}
            connectionMessage={projection.telemetry.message}
            showHeading={false}
          />
        ) : null}
      </DisclosureDrawer>
    </main>
  );
}
