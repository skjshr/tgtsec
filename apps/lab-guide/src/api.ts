import type {
  ConnectionStatus,
  ExperienceMode,
  Fact,
  GraphEdge,
  GuidanceConfig,
  GraphNode,
  Hint,
  Hypothesis,
  IconKey,
  Investigation,
  LabClient,
  LabProjection,
  RecentEvent,
  SessionStatus,
} from "./types";
import { EASY_GUIDANCE } from "./guidance";
import { isRouteAchievementId } from "./route-achievements";

type UnknownRecord = Record<string, unknown>;

const RECENT_EVENT_LIMIT = 4;
const LIVE_SESSION_MARKER = "examserver.lab.live-session.v1";
const STREAM_RECONNECT_GRACE_MS = 3_500;
const API_ROOT = "/api/lab";
const PUBLIC_CATEGORIES = new Set([
  "Web",
  "共有",
  "整備",
  "権限獲得",
  "権限昇格",
  "root経路",
  "最終地点",
]);

function apiPath(path: string): string {
  return `${API_ROOT}/${path.replace(/^\/+/, "")}`;
}

const iconKeys = new Set<IconKey>([
  "browser",
  "calendar",
  "door",
  "file",
  "folder",
  "globe",
  "network",
  "server",
  "terminal",
  "user",
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown, fallback = "", maxLength = 220): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function asId(value: unknown, fallback: string): string {
  const candidate = asText(value, fallback, 96);
  return /^[a-zA-Z0-9_.:-]+$/.test(candidate) ? candidate : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asIcon(value: unknown, fallback: IconKey = "file"): IconKey {
  return typeof value === "string" && iconKeys.has(value as IconKey)
    ? (value as IconKey)
    : fallback;
}

function asConnectionStatus(value: unknown): ConnectionStatus {
  return value === "browse" ||
    value === "waiting" ||
    value === "loading" ||
    value === "live" ||
    value === "reconnecting" ||
    value === "unavailable"
    ? value
    : "live";
}

function asExperienceMode(value: unknown): ExperienceMode {
  return value === "browse" ? "browse" : "live";
}

function asSessionStatus(value: unknown): SessionStatus {
  return value === "complete" || value === "ended" ? value : "active";
}

function normalizeFact(value: unknown, index: number): Fact {
  const fact = asRecord(value);
  return {
    id: asId(fact.id, `fact-${index + 1}`),
    label: asText(fact.label, "確認済みの事実"),
    detail: asText(fact.detail) || undefined,
    icon: asIcon(fact.icon, "file"),
  };
}

function normalizeNode(value: unknown, index: number): GraphNode {
  const node = asRecord(value);
  const state =
    node.state === "selected" || node.state === "undiscovered"
      ? node.state
      : "discovered";
  const position = asRecord(node.position);
  const hasPosition =
    typeof position.x === "number" && typeof position.y === "number";
  const categoryCandidate = asText(node.category, "", 32);
  const category = PUBLIC_CATEGORIES.has(categoryCandidate)
    ? categoryCandidate
    : undefined;

  return {
    id: asId(node.id, `node-${index + 1}`),
    label:
      state === "undiscovered"
        ? category ?? "未発見"
        : asText(node.label, "確認済みの地点"),
    category,
    detail:
      state === "undiscovered" ? undefined : asText(node.detail) || undefined,
    icon:
      state === "undiscovered" ? "file" : asIcon(node.icon ?? node.kind, "file"),
    state,
    progress:
      state === "undiscovered" ? undefined : asText(node.progress, "", 32) || undefined,
    position: hasPosition
      ? {
          x: asNumber(position.x),
          y: asNumber(position.y),
        }
      : undefined,
  };
}

function normalizeEdge(value: unknown, index: number): GraphEdge | undefined {
  const edge = asRecord(value);
  const from = asId(edge.from ?? edge.source, "");
  const to = asId(edge.to ?? edge.target, "");
  if (!from || !to) return undefined;

  return {
    id: asId(edge.id, `edge-${index + 1}`),
    from,
    to,
    state:
      edge.state === "possible" || edge.state === "available"
        ? "possible"
        : "known",
  };
}

function normalizeHypothesis(value: unknown, index: number): Hypothesis {
  const hypothesis = asRecord(value);
  return {
    id: asId(hypothesis.id, `hypothesis-${index + 1}`),
    label: asText(hypothesis.label, "次に確認すること"),
    summary: asText(
      hypothesis.summary,
      "観察した事実とのつながりを確かめます。",
    ),
    selected: hypothesis.selected === true,
    available: hypothesis.available !== false,
  };
}

function normalizeInvestigation(
  value: unknown,
  index: number,
): Investigation {
  const investigation = asRecord(value);
  return {
    id: asId(investigation.id, `investigation-${index + 1}`),
    label: asText(investigation.label, "次の調査を選ぶ"),
    summary: asText(
      investigation.summary,
      "見つけた事実から、もう一段詳しく確認します。",
    ),
    icon: asIcon(investigation.icon, "file"),
    hypothesisId:
      typeof investigation.hypothesisId === "string"
        ? asId(investigation.hypothesisId, "")
        : undefined,
  };
}

function normalizeHint(value: unknown, index: number): Hint {
  const hint = asRecord(value);
  const step =
    hint.step === 2 || hint.step === 3 || hint.step === 4 ? hint.step : 1;
  const state =
    hint.state === "unlocked" || hint.state === "available"
      ? hint.state
      : "locked";

  return {
    id: asId(hint.id, `hint-${step}-${index + 1}`),
    step,
    title:
      asText(hint.title) ||
      (step === 1
        ? "確かめること"
        : step === 2
          ? "使う道具"
          : step === 3
            ? "組み立て方"
            : "操作例"),
    state,
    body:
      state === "unlocked" ? asText(hint.body, "", 500) || undefined : undefined,
    condition:
      state === "unlocked"
        ? undefined
        : asText(
            hint.condition,
            step === 1
              ? "仮説を選ぶと開けます"
              : "前のヒントを確認すると開けます",
          ),
  };
}

function normalizeGuidance(value: unknown): GuidanceConfig {
  const guidance = asRecord(value);
  return {
    showNextChoices: asBoolean(
      guidance.showNextChoices,
      EASY_GUIDANCE.showNextChoices,
    ),
    showToolNames: asBoolean(
      guidance.showToolNames,
      EASY_GUIDANCE.showToolNames,
    ),
    showCommandSyntax: asBoolean(
      guidance.showCommandSyntax,
      EASY_GUIDANCE.showCommandSyntax,
    ),
    showCommandExamples: asBoolean(
      guidance.showCommandExamples,
      EASY_GUIDANCE.showCommandExamples,
    ),
    explainNoProgress: asBoolean(
      guidance.explainNoProgress,
      EASY_GUIDANCE.explainNoProgress,
    ),
    explanationDepth:
      guidance.explanationDepth === "brief" ? "brief" : "full",
    silhouetteDepth: guidance.silhouetteDepth === 0 ? 0 : 1,
  };
}

function normalizeRecentEvent(value: unknown, index: number): RecentEvent {
  const event = asRecord(value);
  return {
    id: asId(event.id, `event-${index + 1}`),
    at: asText(event.at ?? event.timestamp, "--:--", 24),
    message: asText(event.message, "新しい事実を確認しました。"),
  };
}

function normalizeRecentEvents(value: unknown): RecentEvent[] {
  const events = asArray(value);
  const firstDisplayedIndex = Math.max(0, events.length - RECENT_EVENT_LIMIT);
  const latestEventsInChronologicalOrder = events.slice(firstDisplayedIndex);

  return latestEventsInChronologicalOrder.map((event, index) =>
    normalizeRecentEvent(event, firstDisplayedIndex + index),
  );
}

function unwrapProjection(value: unknown): UnknownRecord {
  const envelope = asRecord(value);
  const nested =
    envelope.projection ?? envelope.state ?? envelope.snapshot ?? envelope.data;
  return isRecord(nested) ? nested : envelope;
}

export function normalizeProjection(value: unknown): LabProjection {
  const raw = unwrapProjection(value);
  const graph = asRecord(raw.graph);
  const telemetry = asRecord(raw.telemetry);
  const progress = asRecord(raw.progress);
  const capabilities = asRecord(raw.capabilities);
  const completion = asRecord(raw.completion);
  const hypotheses = asArray(raw.hypotheses).map(normalizeHypothesis);
  const hasSuppliedInvestigations = Array.isArray(raw.investigations);
  const suppliedInvestigations = asArray(raw.investigations);

  return {
    experience: asExperienceMode(raw.experience),
    sessionId: asId(raw.sessionId, "local-session"),
    revision: Math.max(0, asNumber(raw.revision)),
    status: asSessionStatus(raw.status),
    heading: asText(raw.heading, "風切モータースの業務環境を調べる"),
    lede: asText(
      raw.lede,
      "見つけた事実をつなぎ、管理者権限までの道を探します。",
    ),
    objective: asText(raw.objective, "まず1つの入口を確かめる"),
    consultationQuestion: asText(
      raw.consultationQuestion ?? raw.question,
      "見つけた事実から、次に何を確かめますか？",
    ),
    facts: asArray(raw.facts).map(normalizeFact),
    hypotheses,
    investigations:
      hasSuppliedInvestigations
        ? suppliedInvestigations.slice(0, 3).map(normalizeInvestigation)
        : hypotheses.slice(0, 3).map((hypothesis, index) => ({
            id: `investigation-${hypothesis.id}`,
            label: hypothesis.label,
            summary: hypothesis.summary,
            icon: (index === 0
              ? "globe"
              : index === 1
                ? "folder"
                : "user") as IconKey,
            hypothesisId: hypothesis.id,
          })),
    graph: {
      nodes: asArray(graph.nodes).map(normalizeNode),
      edges: asArray(graph.edges)
        .map(normalizeEdge)
        .filter((edge): edge is GraphEdge => edge !== undefined),
    },
    hints: asArray(raw.hints)
      .map(normalizeHint)
      .sort((left, right) => left.step - right.step),
    guidance: normalizeGuidance(raw.guidance),
    progress: {
      discovered: Math.max(0, asNumber(progress.discovered)),
      total: Math.max(1, asNumber(progress.total, 13)),
    },
    recentEvents: normalizeRecentEvents(raw.recentEvents),
    telemetry: {
      status: asConnectionStatus(telemetry.status),
      message: asText(telemetry.message) || undefined,
    },
    capabilities: {
      manualFlagSubmission: capabilities.manualFlagSubmission === true,
    },
    ...(isRouteAchievementId(completion.routeId)
      ? { completion: { routeId: completion.routeId } }
      : {}),
  };
}

export class LabRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "LabRequestError";
  }
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new LabRequestError(
      response.status,
      "invalid_response",
      "学習サイトからJSON以外の応答を受け取りました。",
    );
  }
  return response.json();
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let code = "request_failed";
    let message = `request_failed:${response.status}`;
    try {
      const raw = asRecord(await readJson(response));
      const error = asRecord(raw.error);
      code = asText(error.code, code, 64);
      message = asText(error.message, message, 220);
    } catch {
      // Keep the bounded fallback. Error responses are not trusted input.
    }
    throw new LabRequestError(response.status, code, message);
  }

  return readJson(response);
}

function hasLiveSessionMarker(): boolean {
  try {
    return window.localStorage.getItem(LIVE_SESSION_MARKER) === "paired";
  } catch {
    return false;
  }
}

function rememberLiveSession(): void {
  try {
    window.localStorage.setItem(LIVE_SESSION_MARKER, "paired");
  } catch {
    // The HttpOnly session cookie remains authoritative.
  }
}

function forgetLiveSession(): void {
  try {
    window.localStorage.removeItem(LIVE_SESSION_MARKER);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

async function resolveBrowseClient(): Promise<ResolvedLabClient> {
  const { createBrowseClient } = await import("./browse");
  return { client: createBrowseClient(), experience: "browse" };
}

export class ApiLabClient implements LabClient {
  async getState(signal?: AbortSignal): Promise<LabProjection> {
    return normalizeProjection(
      await request(apiPath("session/state"), {
        method: "GET",
        signal,
      }),
    );
  }

  subscribe(
    onProjection: (projection: LabProjection) => void,
    onError: () => void,
  ): () => void {
    if (typeof EventSource === "undefined") {
      onError();
      return () => undefined;
    }

    const source = new EventSource(apiPath("session/events"));
    let lastMessageAt = Date.now();
    let failureTimer: ReturnType<typeof setTimeout> | undefined;
    const receive = (event: MessageEvent<string>) => {
      try {
        lastMessageAt = Date.now();
        if (failureTimer) {
          clearTimeout(failureTimer);
          failureTimer = undefined;
        }
        onProjection(normalizeProjection(JSON.parse(event.data)));
      } catch {
        onError();
      }
    };
    const scheduleError = () => {
      if (failureTimer) return;
      const delay = Math.max(
        0,
        STREAM_RECONNECT_GRACE_MS - (Date.now() - lastMessageAt),
      );
      failureTimer = setTimeout(() => {
        failureTimer = undefined;
        if (Date.now() - lastMessageAt >= STREAM_RECONNECT_GRACE_MS) {
          onError();
        }
      }, delay);
    };

    source.onmessage = receive;
    source.addEventListener("snapshot", receive as EventListener);
    source.addEventListener("state", receive as EventListener);
    source.onerror = scheduleError;

    return () => {
      if (failureTimer) clearTimeout(failureTimer);
      source.close();
    };
  }

  async selectHypothesis(id: string): Promise<LabProjection | undefined> {
    const payload = await request(
      apiPath(`session/hypotheses/${encodeURIComponent(id)}/select`),
      { method: "POST" },
    );
    return payload === undefined ? undefined : normalizeProjection(payload);
  }

  async unlockHint(id: string): Promise<LabProjection | undefined> {
    const payload = await request(
      apiPath(`session/hints/${encodeURIComponent(id)}/unlock`),
      { method: "POST" },
    );
    return payload === undefined ? undefined : normalizeProjection(payload);
  }

  async applyGuidance(
    commandId: string,
  ): Promise<LabProjection | undefined> {
    const payload = await request(
      apiPath(
        `session/guidance/${encodeURIComponent(commandId)}/apply`,
      ),
      { method: "POST" },
    );
    return payload === undefined ? undefined : normalizeProjection(payload);
  }
}

export interface ResolvedLabClient {
  client: LabClient;
  experience: ExperienceMode;
}

export async function pairLabSession(code: string): Promise<LabClient> {
  const normalizedCode = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(normalizedCode)) {
    throw new LabRequestError(
      400,
      "invalid_pairing_code",
      "6文字の接続コードを入力してください。",
    );
  }

  await request(apiPath("session/pair"), {
    method: "POST",
    body: JSON.stringify({ code: normalizedCode }),
  });
  const client = new ApiLabClient();
  await client.getState();
  rememberLiveSession();
  return client;
}

export async function resolveLabClient(): Promise<ResolvedLabClient> {
  const params = new URLSearchParams(window.location.search);

  if (import.meta.env.DEV) {
    const requestedFixture =
      params.get("fixture") ??
      (import.meta.env.VITE_LAB_GUIDE_MODE === "fixture" ? "live" : null);

    if (requestedFixture) {
      const { createFixtureClient } = await import("./fixtures");
      return {
        client: createFixtureClient(requestedFixture),
        experience: "live",
      };
    }
  }

  const localFallbackRequested = params.get("local") === "1";
  if (!localFallbackRequested && !hasLiveSessionMarker()) {
    return resolveBrowseClient();
  }

  const liveClient = new ApiLabClient();
  try {
    const projection = await liveClient.getState();
    if (projection.experience !== "live") {
      forgetLiveSession();
      return resolveBrowseClient();
    }
    return { client: liveClient, experience: "live" };
  } catch {
    if (!localFallbackRequested) forgetLiveSession();
    return resolveBrowseClient();
  }
}
