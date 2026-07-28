import {
  IconBulb,
  IconChevronRight,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleDot,
  IconCompass,
  IconListCheck,
  IconListDetails,
  IconMap2,
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
  const selectedNode = useMemo(
    () =>
      projection.graph.nodes.find((node) => node.id === selectedNodeId),
    [projection.graph.nodes, selectedNodeId],
  );

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
  const drawerTitle =
    activeDisclosure === "pairing"
      ? "ライブ接続"
      : activeDisclosure === "facts"
        ? "分かっていること"
        : activeDisclosure === "investigations"
          ? "次の調査"
          : "最近の発見";

  const openConsultation = (hypothesisId?: string) => {
    setActiveDisclosure(null);
    onOpenConsultation(hypothesisId);
  };

  return (
    <main
      className={`lab-screen map-screen map-screen--${experience} ${liveUpdate ? "is-live-update" : ""}`}
    >
      <section className="map-stage">
        {experience === "live" ? (
          <ConnectionBanner
            status={connectionStatus}
            message={projection.telemetry.message}
            refreshing={pendingAction === "refresh"}
            onRefresh={onRefresh}
          />
        ) : null}
        <header className="stage-intro">
          <h1>{projection.heading}</h1>
          <p>{projection.lede}</p>
        </header>

        <section className="stage-context" aria-label="現在の目標">
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

        <nav className="disclosure-pulls" aria-label="必要な情報を開く">
          {experience === "browse" ? (
            <DisclosurePull
              label="ライブ接続"
              meta="6文字"
              icon={<IconPlugConnected />}
              controls={drawerId}
              open={activeDisclosure === "pairing"}
              onClick={() => setActiveDisclosure("pairing")}
            />
          ) : null}
          <DisclosurePull
            label="事実"
            meta={`${projection.facts.length}件`}
            icon={<IconListCheck />}
            controls={drawerId}
            open={activeDisclosure === "facts"}
            onClick={() => setActiveDisclosure("facts")}
          />
          <DisclosurePull
            label="次の調査"
            meta={`${projection.investigations.slice(0, 3).length}件`}
            icon={<IconCompass />}
            controls={drawerId}
            open={activeDisclosure === "investigations"}
            onClick={() => setActiveDisclosure("investigations")}
          />
          <DisclosurePull
            label="最近の発見"
            meta={`${projection.recentEvents.length}件`}
            icon={<IconListDetails />}
            controls={drawerId}
            open={activeDisclosure === "events"}
            onClick={() => setActiveDisclosure("events")}
          />
        </nav>

        {projection.status === "complete" ? (
          <section className="success-callout" aria-labelledby="success-title">
            <IconRoute aria-hidden="true" />
            <div>
              <strong id="success-title">入口からrootまでの経路がつながりました</strong>
              <span>見つけた事実を順にたどり、権限が変わった理由を説明してみましょう。</span>
            </div>
          </section>
        ) : null}

        <div className="map-toolbar">
          <h2>
            <IconMap2 aria-hidden="true" />
            探索地図
          </h2>
          <details className="map-legend-details">
            <summary>地図記号</summary>
            <div className="map-legend" aria-label="地図の状態">
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
          </details>
        </div>

        <MapCanvas
          projection={projection}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />

        {selectedNode && selectedNode.state !== "undiscovered" ? (
          <section
            className="selected-node-brief"
            aria-label={`選択中の地点 ${selectedNode.label}`}
          >
            <span className="selected-node-symbol" aria-hidden="true">
              <AppIcon name={selectedNode.icon} stroke={1.7} />
            </span>
            <div className="selected-node-copy">
              <small>選択中の地点</small>
              <strong>{selectedNode.label}</strong>
              <span>
                {selectedNode.detail ??
                  "この地点で得た事実を、次の仮説につなげます。"}
              </span>
            </div>
            {selectedNode.progress ? (
              <span className="selected-node-progress">
                {selectedNode.progress}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => openConsultation()}
            >
              次の一手
              <IconChevronRight aria-hidden="true" />
            </button>
          </section>
        ) : null}
      </section>

      <DisclosureDrawer
        id={drawerId}
        open={activeDisclosure !== null}
        title={drawerTitle}
        onClose={() => setActiveDisclosure(null)}
      >
        {activeDisclosure === "pairing" ? (
          <SessionPairingPanel
            pending={pairingPending}
            error={pairingError}
            onPair={onPairSession}
          />
        ) : null}

        {activeDisclosure === "facts" ? (
          <KnownFacts
            facts={projection.facts}
            title="分かっていること"
            projection={projection}
            detailed
            experience={experience}
            showHeading={false}
            showContextCards={false}
          />
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
