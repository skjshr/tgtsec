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
  step: 1 | 2 | 3;
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
}

export interface FlagSubmissionResult {
  accepted: boolean;
  message: string;
  projection?: LabProjection;
}

export interface LabClient {
  getState(signal?: AbortSignal): Promise<LabProjection>;
  subscribe(
    onProjection: (projection: LabProjection) => void,
    onError: () => void,
  ): () => void;
  selectHypothesis(id: string): Promise<LabProjection | undefined>;
  unlockHint(id: string): Promise<LabProjection | undefined>;
  submitFlag(flag: string): Promise<FlagSubmissionResult>;
}
