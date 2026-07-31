import type { RouteAchievementId } from "./route-achievements";

export type ScreenId = "map" | "consultation";

export type ExperienceMode = "browse" | "live";

export type ConnectionStatus =
  | "browse"
  | "waiting"
  | "loading"
  | "live"
  | "reconnecting"
  | "unavailable";

export type SessionStatus = "active" | "complete" | "ended";

export type IconKey =
  | "browser"
  | "calendar"
  | "door"
  | "file"
  | "folder"
  | "globe"
  | "network"
  | "server"
  | "terminal"
  | "user";

export interface Fact {
  id: string;
  label: string;
  detail?: string;
  icon: IconKey;
}

export type GraphNodeState = "discovered" | "selected" | "undiscovered";

export interface GraphNode {
  id: string;
  label: string;
  category?: string;
  detail?: string;
  icon: IconKey;
  state: GraphNodeState;
  progress?: string;
  position?: {
    x: number;
    y: number;
  };
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  state?: "known" | "possible";
}

export interface GraphProjection {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Hypothesis {
  id: string;
  label: string;
  summary: string;
  selected?: boolean;
  available?: boolean;
}

export interface Investigation {
  id: string;
  label: string;
  summary: string;
  icon: IconKey;
  hypothesisId?: string;
}

export type HintState = "unlocked" | "available" | "locked";

export interface Hint {
  id: string;
  step: 1 | 2 | 3 | 4;
  title: string;
  state: HintState;
  body?: string;
  condition?: string;
}

export interface RecentEvent {
  id: string;
  at: string;
  message: string;
}

export interface GuidanceConfig {
  showNextChoices: boolean;
  showToolNames: boolean;
  showCommandSyntax: boolean;
  showCommandExamples: boolean;
  explainNoProgress: boolean;
  explanationDepth: "brief" | "full";
  silhouetteDepth: 0 | 1;
}

export interface LabProjection {
  experience: ExperienceMode;
  sessionId: string;
  revision: number;
  status: SessionStatus;
  heading: string;
  lede: string;
  objective: string;
  consultationQuestion: string;
  facts: Fact[];
  hypotheses: Hypothesis[];
  investigations: Investigation[];
  graph: GraphProjection;
  hints: Hint[];
  guidance: GuidanceConfig;
  progress: {
    discovered: number;
    total: number;
  };
  recentEvents: RecentEvent[];
  telemetry: {
    status: ConnectionStatus;
    message?: string;
  };
  capabilities: {
    manualFlagSubmission: boolean;
  };
  completion?: {
    routeId: RouteAchievementId;
  };
}

export interface LabClient {
  getState(signal?: AbortSignal): Promise<LabProjection>;
  subscribe(
    onProjection: (projection: LabProjection) => void,
    onError: () => void,
  ): () => void;
  selectHypothesis(id: string): Promise<LabProjection | undefined>;
  unlockHint(id: string): Promise<LabProjection | undefined>;
  applyGuidance(commandId: string): Promise<LabProjection | undefined>;
}
