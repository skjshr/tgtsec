import { CloudError } from "./errors.mjs";
import { SAFE_ID } from "./security.mjs";

export const MAX_PROJECTION_BYTES = 256 * 1024;
const ICONS = new Set([
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
const PUBLIC_CATEGORIES = new Set([
  "Web",
  "共有",
  "整備",
  "権限獲得",
  "権限昇格",
  "root経路",
  "最終地点",
]);
const ROUTE_IDS = new Set([
  "web-sudo",
  "web-timer",
  "web-suid",
  "smb-sudo",
  "smb-timer",
  "smb-suid",
  "nfs-sudo",
  "nfs-timer",
  "nfs-suid",
]);
const SECRET_TEXT = [
  /\b(?:FLAG|LAB)\{[^}\r\n]{0,512}\}/i,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/i,
  /\bauthorization\s*:\s*bearer\s+\S+/i,
  /\b(?:password|passwd|token)\s*[:=]\s*\S+/i,
];

export class ProjectionBoundaryError extends CloudError {
  constructor(message) {
    super(
      422,
      "invalid_projection",
      "公開できない進行データです。",
      message,
    );
    this.name = "ProjectionBoundaryError";
  }
}

function boundary(path, message) {
  throw new ProjectionBoundaryError(`${path} ${message}`);
}

function plainObject(value, path) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    boundary(path, "must be an object");
  }
  return value;
}

function exactKeys(value, path, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) boundary(`${path}.${key}`, "is not allowed");
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) boundary(`${path}.${key}`, "is required");
  }
}

function safeText(value, path, { minimum = 1, maximum = 220 } = {}) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    SECRET_TEXT.some((pattern) => pattern.test(value))
  ) {
    boundary(path, `must be safe text from ${minimum} to ${maximum} characters`);
  }
  return value;
}

function identifier(value, path) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    boundary(path, "must be a safe identifier");
  }
  return value;
}

function boolean(value, path) {
  if (typeof value !== "boolean") boundary(path, "must be boolean");
  return value;
}

function integer(value, path, { minimum = 0, maximum } = {}) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    (maximum !== undefined && value > maximum)
  ) {
    boundary(path, "must be a bounded integer");
  }
  return value;
}

function array(value, path, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    boundary(path, `must be an array with at most ${maximum} entries`);
  }
  return value;
}

function icon(value, path) {
  if (typeof value !== "string" || !ICONS.has(value)) {
    boundary(path, "must be a known public icon");
  }
  return value;
}

function unique(items, path) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) boundary(path, `contains duplicate id ${item.id}`);
    ids.add(item.id);
  }
}

function validateFact(value, index) {
  const path = `projection.facts[${index}]`;
  const input = plainObject(value, path);
  exactKeys(input, path, ["id", "label", "icon"], ["detail"]);
  return {
    id: identifier(input.id, `${path}.id`),
    label: safeText(input.label, `${path}.label`),
    ...(input.detail === undefined
      ? {}
      : {
          detail: safeText(input.detail, `${path}.detail`, { maximum: 500 }),
        }),
    icon: icon(input.icon, `${path}.icon`),
  };
}

function validateHypothesis(value, index) {
  const path = `projection.hypotheses[${index}]`;
  const input = plainObject(value, path);
  exactKeys(input, path, ["id", "label", "summary"], [
    "selected",
    "available",
  ]);
  return {
    id: identifier(input.id, `${path}.id`),
    label: safeText(input.label, `${path}.label`),
    summary: safeText(input.summary, `${path}.summary`, { maximum: 500 }),
    ...(input.selected === undefined
      ? {}
      : { selected: boolean(input.selected, `${path}.selected`) }),
    ...(input.available === undefined
      ? {}
      : { available: boolean(input.available, `${path}.available`) }),
  };
}

function validateInvestigation(value, index) {
  const path = `projection.investigations[${index}]`;
  const input = plainObject(value, path);
  exactKeys(input, path, ["id", "label", "summary", "icon"], [
    "hypothesisId",
  ]);
  return {
    id: identifier(input.id, `${path}.id`),
    label: safeText(input.label, `${path}.label`),
    summary: safeText(input.summary, `${path}.summary`, { maximum: 500 }),
    icon: icon(input.icon, `${path}.icon`),
    ...(input.hypothesisId === undefined
      ? {}
      : {
          hypothesisId: identifier(
            input.hypothesisId,
            `${path}.hypothesisId`,
          ),
        }),
  };
}

function validateGraphNode(value, index) {
  const path = `projection.graph.nodes[${index}]`;
  const input = plainObject(value, path);
  exactKeys(input, path, ["id", "state"], [
    "category",
    "label",
    "detail",
    "icon",
    "kind",
    "progress",
    "position",
  ]);
  if (!["discovered", "selected", "undiscovered"].includes(input.state)) {
    boundary(`${path}.state`, "is not a public graph state");
  }
  if (
    input.state === "undiscovered" &&
    ["label", "detail", "icon", "kind", "progress", "position"].some((key) =>
      Object.hasOwn(input, key),
    )
  ) {
    boundary(path, "must not reveal undiscovered node material");
  }

  const category =
    input.category === undefined
      ? undefined
      : safeText(input.category, `${path}.category`, { maximum: 32 });
  if (
    (input.state === "undiscovered" && category === undefined) ||
    (category !== undefined && !PUBLIC_CATEGORIES.has(category))
  ) {
    boundary(`${path}.category`, "is not an allowlisted public category");
  }

  const output = {
    id: identifier(input.id, `${path}.id`),
    state: input.state,
    ...(category === undefined ? {} : { category }),
  };
  if (input.state !== "undiscovered") {
    output.label = safeText(input.label, `${path}.label`);
    if (input.detail !== undefined) {
      output.detail = safeText(input.detail, `${path}.detail`, {
        maximum: 500,
      });
    }
    if (input.icon !== undefined) output.icon = icon(input.icon, `${path}.icon`);
    if (input.kind !== undefined) {
      output.kind = identifier(input.kind, `${path}.kind`);
    }
    if (input.progress !== undefined) {
      output.progress = safeText(input.progress, `${path}.progress`, {
        maximum: 64,
      });
    }
    if (input.position !== undefined) {
      const position = plainObject(input.position, `${path}.position`);
      exactKeys(position, `${path}.position`, ["x", "y"]);
      for (const axis of ["x", "y"]) {
        if (
          typeof position[axis] !== "number" ||
          !Number.isFinite(position[axis]) ||
          Math.abs(position[axis]) > 10_000
        ) {
          boundary(`${path}.position.${axis}`, "must be a bounded number");
        }
      }
      output.position = { x: position.x, y: position.y };
    }
  }
  return output;
}

function validateGraphEdge(value, index) {
  const path = `projection.graph.edges[${index}]`;
  const input = plainObject(value, path);
  exactKeys(input, path, ["from", "to"], ["id", "state"]);
  const output = {
    ...(input.id === undefined
      ? {}
      : { id: identifier(input.id, `${path}.id`) }),
    from: identifier(input.from, `${path}.from`),
    to: identifier(input.to, `${path}.to`),
  };
  if (input.state !== undefined) {
    if (
      !["known", "possible", "discovered", "available"].includes(input.state)
    ) {
      boundary(`${path}.state`, "is not a public edge state");
    }
    output.state = input.state;
  }
  return output;
}

function validateHint(value, index) {
  const path = `projection.hints[${index}]`;
  const input = plainObject(value, path);
  exactKeys(input, path, ["id", "step", "title", "state"], [
    "body",
    "condition",
  ]);
  if (![1, 2, 3, 4].includes(input.step)) {
    boundary(`${path}.step`, "must be 1, 2, 3, or 4");
  }
  if (!["unlocked", "available", "locked"].includes(input.state)) {
    boundary(`${path}.state`, "is not a public hint state");
  }
  if (input.state !== "unlocked" && input.body !== undefined) {
    boundary(`${path}.body`, "must not reveal a locked hint");
  }
  return {
    id: identifier(input.id, `${path}.id`),
    step: input.step,
    title: safeText(input.title, `${path}.title`),
    state: input.state,
    ...(input.body === undefined
      ? {}
      : {
          body: safeText(input.body, `${path}.body`, { maximum: 2_000 }),
        }),
    ...(input.condition === undefined
      ? {}
      : {
          condition: safeText(input.condition, `${path}.condition`, {
            maximum: 500,
          }),
        }),
  };
}

function validateRecentEvent(value, index) {
  const path = `projection.recentEvents[${index}]`;
  const input = plainObject(value, path);
  exactKeys(input, path, ["id", "at", "message"]);
  const at = safeText(input.at, `${path}.at`, { maximum: 32 });
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(at) ||
    Number.isNaN(Date.parse(at))
  ) {
    boundary(`${path}.at`, "must be an ISO 8601 UTC timestamp");
  }
  return {
    id: identifier(input.id, `${path}.id`),
    at,
    message: safeText(input.message, `${path}.message`, { maximum: 500 }),
  };
}

function validateGuidance(value) {
  const path = "projection.guidance";
  const input = plainObject(value, path);
  exactKeys(input, path, [
    "showNextChoices",
    "showToolNames",
    "showCommandSyntax",
    "showCommandExamples",
    "explainNoProgress",
    "explanationDepth",
    "silhouetteDepth",
  ]);
  for (const field of [
    "showNextChoices",
    "showToolNames",
    "showCommandSyntax",
    "showCommandExamples",
    "explainNoProgress",
  ]) {
    boolean(input[field], `${path}.${field}`);
  }
  if (!["brief", "full"].includes(input.explanationDepth)) {
    boundary(
      `${path}.explanationDepth`,
      "is not a public explanation depth",
    );
  }
  if (![0, 1].includes(input.silhouetteDepth)) {
    boundary(`${path}.silhouetteDepth`, "must be 0 or 1");
  }
  return {
    showNextChoices: input.showNextChoices,
    showToolNames: input.showToolNames,
    showCommandSyntax: input.showCommandSyntax,
    showCommandExamples: input.showCommandExamples,
    explainNoProgress: input.explainNoProgress,
    explanationDepth: input.explanationDepth,
    silhouetteDepth: input.silhouetteDepth,
  };
}

function validateCompletion(value) {
  const path = "projection.completion";
  const input = plainObject(value, path);
  exactKeys(input, path, ["routeId"]);
  const routeId = identifier(input.routeId, `${path}.routeId`);
  if (!ROUTE_IDS.has(routeId)) {
    boundary(`${path}.routeId`, "is not a public route id");
  }
  return { routeId };
}

export function validatePublicProjection(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    boundary("projection", "must be JSON serializable");
  }
  if (
    typeof serialized !== "string" ||
    Buffer.byteLength(serialized) > MAX_PROJECTION_BYTES
  ) {
    boundary("projection", `must not exceed ${MAX_PROJECTION_BYTES} bytes`);
  }

  const input = plainObject(value, "projection");
  exactKeys(
    input,
    "projection",
    [
      "sessionId",
      "revision",
      "status",
      "facts",
      "hypotheses",
      "graph",
      "hints",
      "guidance",
      "progress",
      "recentEvents",
      "telemetry",
    ],
    [
      "experience",
      "heading",
      "lede",
      "objective",
      "consultationQuestion",
      "investigations",
      "capabilities",
      "completion",
    ],
  );
  if (input.experience !== undefined && input.experience !== "live") {
    boundary("projection.experience", "must be live");
  }
  if (!["active", "complete", "ended"].includes(input.status)) {
    boundary("projection.status", "is not a public session status");
  }

  const facts = array(input.facts, "projection.facts", 13).map(validateFact);
  const hypotheses = array(
    input.hypotheses,
    "projection.hypotheses",
    32,
  ).map(validateHypothesis);
  const investigations =
    input.investigations === undefined
      ? undefined
      : array(input.investigations, "projection.investigations", 8).map(
          validateInvestigation,
        );
  const graph = plainObject(input.graph, "projection.graph");
  exactKeys(graph, "projection.graph", ["nodes", "edges"]);
  const nodes = array(graph.nodes, "projection.graph.nodes", 32).map(
    validateGraphNode,
  );
  const edges = array(graph.edges, "projection.graph.edges", 96).map(
    validateGraphEdge,
  );
  const hints = array(input.hints, "projection.hints", 4).map(validateHint);
  if (
    hints.length !== 4 ||
    hints.some((hint, index) => hint.step !== index + 1)
  ) {
    boundary(
      "projection.hints",
      "must contain the four ordered explanation steps",
    );
  }
  const recentEvents = array(
    input.recentEvents,
    "projection.recentEvents",
    20,
  ).map(validateRecentEvent);

  for (const [items, path] of [
    [facts, "projection.facts"],
    [hypotheses, "projection.hypotheses"],
    [nodes, "projection.graph.nodes"],
    [hints, "projection.hints"],
    [recentEvents, "projection.recentEvents"],
  ]) {
    unique(items, path);
  }
  if (investigations) unique(investigations, "projection.investigations");

  const progress = plainObject(input.progress, "projection.progress");
  exactKeys(progress, "projection.progress", ["discovered", "total"]);
  const total = integer(progress.total, "projection.progress.total", {
    minimum: 13,
    maximum: 13,
  });
  const discovered = integer(
    progress.discovered,
    "projection.progress.discovered",
    { maximum: total },
  );

  const telemetry = plainObject(input.telemetry, "projection.telemetry");
  exactKeys(telemetry, "projection.telemetry", ["status"], ["message"]);
  if (!["live", "reconnecting", "unavailable"].includes(telemetry.status)) {
    boundary("projection.telemetry.status", "is not a detector status");
  }

  if (input.capabilities !== undefined) {
    const capabilities = plainObject(
      input.capabilities,
      "projection.capabilities",
    );
    exactKeys(
      capabilities,
      "projection.capabilities",
      ["manualFlagSubmission"],
    );
    boolean(
      capabilities.manualFlagSubmission,
      "projection.capabilities.manualFlagSubmission",
    );
  }
  const guidance = validateGuidance(input.guidance);
  const completion =
    input.completion === undefined
      ? undefined
      : validateCompletion(input.completion);
  if (completion && input.status !== "complete") {
    boundary("projection.completion", "requires complete status");
  }

  return {
    experience: "live",
    sessionId: identifier(input.sessionId, "projection.sessionId"),
    revision: integer(input.revision, "projection.revision"),
    status: input.status,
    ...(input.heading === undefined
      ? {}
      : {
          heading: safeText(input.heading, "projection.heading", {
            maximum: 500,
          }),
        }),
    ...(input.lede === undefined
      ? {}
      : {
          lede: safeText(input.lede, "projection.lede", { maximum: 1_000 }),
        }),
    ...(input.objective === undefined
      ? {}
      : {
          objective: safeText(input.objective, "projection.objective", {
            maximum: 500,
          }),
        }),
    ...(input.consultationQuestion === undefined
      ? {}
      : {
          consultationQuestion: safeText(
            input.consultationQuestion,
            "projection.consultationQuestion",
            { maximum: 500 },
          ),
        }),
    facts,
    hypotheses,
    ...(investigations === undefined ? {} : { investigations }),
    graph: { nodes, edges },
    hints,
    guidance,
    progress: { discovered, total },
    ...(completion === undefined ? {} : { completion }),
    recentEvents,
    telemetry: {
      status: telemetry.status,
      ...(telemetry.message === undefined
        ? {}
        : {
            message: safeText(
              telemetry.message,
              "projection.telemetry.message",
              { minimum: 0 },
            ),
          }),
    },
    capabilities: { manualFlagSubmission: false },
  };
}
