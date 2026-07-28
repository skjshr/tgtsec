import {
  IconBulb,
  IconChevronRight,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleDot,
  IconCompass,
  IconListCheck,
  IconListDetails,
  IconPlugConnected,
  IconRoute,
  IconTargetArrow,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConnectionStatus,
  ExperienceMode,
  FlagSubmissionResult,
  LabProjection,
} from "../types";
import { AppIcon } from "./AppIcon";
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
import { MapCanvas } from "./MapCanvas";
import { SessionPairingPanel } from "./SessionPairingPanel";

interface ExplorationMapProps {
  projection: LabProjection;
  connectionStatus: ConnectionStatus;
  pendingAction: string | null;
  onRefresh: () => void;
  onOpenConsultation: (hypothesisId?: string) => void;
  onSubmitFlag: (
    flag: string,
  ) => Promise<FlagSubmissionResult | undefined>;
  experience: ExperienceMode;
  pairingPending: boolean;
  pairingError?: string;
  onPairSession: (code: string) => Promise<boolean>;
}

type MapDisclosure = "pairing" | "facts" | "investigations" | "events";

export function ExplorationMap({
  projection,
  connectionStatus,
  pendingAction,
  onRefresh,
  onOpenConsultation,
  onSubmitFlag,
  experience,
  pairingPending,
  pairingError,
  onPairSession,
}: ExplorationMapProps) {
  const initiallySelected = useMemo(
    () =>
      projection.graph.nodes.find((node) => node.state === "selected")?.id ??
      projection.graph.nodes.find((node) => node.state === "discovered")?.id,
    [projection.graph.nodes],
  );
  const [selectedNodeId, setSelectedNodeId] = useState(initiallySelected);
  const [liveUpdate, setLiveUpdate] = useState(false);
  const [activeDisclosure, setActiveDisclosure] =
    useState<MapDisclosure | null>(null);
  const previousRevision = useRef(projection.revision);

  useEffect(() => {
    setSelectedNodeId((currentSelection) => {
      const selectableNodes = projection.graph.nodes.filter(
        (node) => node.state !== "undiscovered",
      );
      if (
        currentSelection &&
        selectableNodes.some((node) => node.id === currentSelection)
      ) {
        return currentSelection;
      }
      return (
        selectableNodes.find((node) => node.state === "selected")?.id ??
        selectableNodes[0]?.id
      );
    });
  }, [projection.graph.nodes, projection.revision]);

  useEffect(() => {
    if (
      experience === "live" &&
      projection.revision > previousRevision.current
    ) {
      setLiveUpdate(true);
      const timer = window.setTimeout(() => setLiveUpdate(false), 420);
      previousRevision.current = projection.revision;
      return () => window.clearTimeout(timer);
    }
    previousRevision.current = projection.revision;
  }, [experience, projection.revision]);

  useEffect(() => {
    if (experience === "live" && activeDisclosure === "pairing") {
      setActiveDisclosure(null);
    }
  }, [activeDisclosure, experience]);

  const drawerId = "map-disclosure-drawer";
  const defaultDisclosure: MapDisclosure =
    experience === "browse" ? "pairing" : "facts";
  const shelfItems: ToolShelfItem<MapDisclosure>[] = [
    ...(experience === "browse"
      ? [
          {
            id: "pairing" as const,
            label: "接続",
            meta: "6文字",
            icon: <IconPlugConnected />,
          },
        ]
      : []),
    {
      id: "facts",
      label: "事実",
      meta: `${projection.facts.length}件`,
      icon: <IconListCheck />,
    },
    {
      id: "investigations",
      label: "次の調査",
      meta: `${projection.investigations.slice(0, 3).length}件`,
      icon: <IconCompass />,
    },
    {
      id: "events",
      label: "履歴",
      meta: `${projection.recentEvents.length}件`,
      icon: <IconListDetails />,
    },
  ];

  const openConsultation = (hypothesisId?: string) => {
    setActiveDisclosure(null);
    onOpenConsultation(hypothesisId);
  };

  return (
    <main
      className={`lab-screen map-screen map-screen--${experience} ${liveUpdate ? "is-live-update" : ""}`}
    >
      <section className="mission-stage">
        {experience === "live" ? (
          <ConnectionBanner
            status={connectionStatus}
            message={projection.telemetry.message}
            refreshing={pendingAction === "refresh"}
            onRefresh={onRefresh}
          />
        ) : null}
        <div className="mission-header">
          <header className="mission-heading">
            <span className="mission-kicker">
              <span>{experience === "browse" ? "MISSION 00" : "LIVE MISSION"}</span>
              <span aria-hidden="true">/</span>
              <span>探索地図</span>
            </span>
            <h1>{projection.heading}</h1>

            <section className="mission-objective" aria-label="現在の目標">
              <IconTargetArrow aria-hidden="true" />
              <div>
                <small>現在の目標</small>
                <strong>{projection.objective}</strong>
              </div>
              {experience === "live" ? (
                <span
                  role="progressbar"
                  aria-label={`${projection.progress.total}件中${projection.progress.discovered}件を発見`}
                  aria-valuemin={0}
                  aria-valuemax={projection.progress.total}
                  aria-valuenow={projection.progress.discovered}
                >
                  {projection.progress.discovered}
                  <small aria-hidden="true"> / </small>
                  {projection.progress.total}
                  <span className="sr-only">件中を発見</span>
                </span>
              ) : null}
            </section>
          </header>

          <nav className="mission-tools" aria-label="必要な情報を開く">
            <DisclosurePull
              label="探索ツール"
              icon={<IconCompass />}
              controls={drawerId}
              open={activeDisclosure !== null}
              onClick={() => setActiveDisclosure(defaultDisclosure)}
            />
          </nav>
        </div>

        {projection.status === "complete" ? (
          <section className="success-callout" aria-labelledby="success-title">
            <IconRoute aria-hidden="true" />
            <div>
              <strong id="success-title">入口からrootまでの経路がつながりました</strong>
              <span>見つけた事実を順にたどり、権限が変わった理由を説明してみましょう。</span>
            </div>
          </section>
        ) : null}

        <section className="mission-route">
          <div className="route-caption" aria-hidden="true">
            <span>ROUTE</span>
            <strong>{experience === "browse" ? "準備経路" : "発見した経路"}</strong>
          </div>

          <section className="mission-map" aria-labelledby="mission-map-title">
            <h2 id="mission-map-title" className="sr-only">
              探索地図
            </h2>
            <MapCanvas
              projection={projection}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onOpenNode={() => openConsultation()}
            />
          </section>
        </section>
      </section>

      <DisclosureDrawer
        id={drawerId}
        open={activeDisclosure !== null}
        title="探索ツール"
        onClose={() => setActiveDisclosure(null)}
      >
        {activeDisclosure ? (
          <ToolShelf
            items={shelfItems}
            active={activeDisclosure}
            onSelect={setActiveDisclosure}
          />
        ) : null}

        {activeDisclosure === "pairing" ? (
          <SessionPairingPanel
            pending={pairingPending}
            error={pairingError}
            onPair={onPairSession}
          />
        ) : null}

        {activeDisclosure === "facts" ? (
          <>
            <KnownFacts
              facts={projection.facts}
              title="分かっていること"
              projection={projection}
              detailed
              experience={experience}
              showHeading={false}
              showContextCards={false}
            />
            <section className="drawer-map-legend" aria-label="地図の記号">
              <h3>地図の記号</h3>
              <div>
                <span>
                  <IconCircleCheck aria-hidden="true" /> 発見済み
                </span>
                <span>
                  <IconCircleDot aria-hidden="true" /> 選択中
                </span>
                <span>
                  <IconCircleDashed aria-hidden="true" /> 未発見
                </span>
              </div>
            </section>
          </>
        ) : null}

        {activeDisclosure === "investigations" ? (
          <aside className="investigation-rail" aria-label="いま選べる調査">
            <p className="rail-intro">次に取り組む調査を選びましょう。</p>

            <div className="investigation-list">
              {projection.investigations.slice(0, 3).map((investigation) => (
                <button
                  type="button"
                  className="investigation-option"
                  key={investigation.id}
                  onClick={() =>
                    openConsultation(investigation.hypothesisId)
                  }
                >
                  <AppIcon name={investigation.icon} stroke={1.6} />
                  <span>
                    <strong>{investigation.label}</strong>
                    <small>{investigation.summary}</small>
                  </span>
                  <IconChevronRight aria-hidden="true" />
                </button>
              ))}
            </div>

            <button
              type="button"
              className="outline-action"
              onClick={() => openConsultation()}
            >
              <IconBulb aria-hidden="true" />
              ヒントを見る
            </button>

            {projection.capabilities.manualFlagSubmission &&
            (connectionStatus === "unavailable" ||
              projection.status === "complete") ? (
              <ManualFlagForm
                pending={pendingAction === "flag"}
                onSubmit={onSubmitFlag}
                mode={
                  projection.status === "complete" ? "bonus" : "fallback"
                }
              />
            ) : null}

            <p className="safety-note">
              <AppIcon name="server" stroke={1.7} />
              これは学習環境です。許可された対象に対してのみ調査を行ってください。
            </p>
          </aside>
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
