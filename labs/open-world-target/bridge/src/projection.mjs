import { BridgeError } from "./errors.mjs";

export const MAX_PROJECTION_BYTES = 256 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
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
const SECRET_TEXT = [
  /\b(?:FLAG|LAB)\{[^}\r\n]{0,512}\}/i,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/i,
  /\bauthorization\s*:\s*bearer\s+\S+/i,
  /\b(?:password|passwd|token)\s*[:=]\s*\S+/i,
];

export class ProjectionBoundaryError extends BridgeError {
  constructor(message) {
    super("projection_boundary", message);
    this.name = "ProjectionBoundaryError";
  }
}

function fail(path, message) {
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
    fail(path, "must be an object");
  }
  return value;
}

function exactKeys(value, path, required, optional = []) {
  const requiredSet = new Set(required);
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  for (const key of keys) {
    if (!allowed.has(key)) fail(`${path}.${key}`, "is not allowed");
  }
  for (const key of requiredSet) {
    if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "is required");
  }
}

function text(value, path, { minimum = 1, maximum = 220 } = {}) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    SECRET_TEXT.some((pattern) => pattern.test(value))
  ) {
    fail(path, `must be safe text from ${minimum} to ${maximum} characters`);
  }
  return value;
}

function identifier(value, path) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail(path, "must be a safe identifier");
  }
  return value;
}

function boolean(value, path) {
  if (typeof value !== "boolean") fail(path, "must be boolean");
  return value;
}

function integer(value, path, { minimum = 0, maximum } = {}) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    (maximum !== undefined && value > maximum)
  ) {
    fail(path, "must be a bounded integer");
  }
  return value;
}

function array(value, path, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    fail(path, `must be an array with at most ${maximum} entries`);
  }
  return value;
}

function optionalText(value, path, maximum = 220) {
  return value === undefined
    ? undefined
    : text(value, path, { minimum: 0, maximum });
}

function icon(value, path) {
  if (typeof value !== "string" || !ICONS.has(value)) {
    fail(path, "must be a known public icon");
  }
  return value;
}

function ensureUnique(items, path) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) fail(path, `contains duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

function validateFact(value, index) {
  const path = `projection.facts[${index}]`;
  const input = plainObject(value, path);
  exactKeys(input, path, ["id", "label", "icon"], ["detail"]);
  return {
    id: identifier(input.id, `${path}.id`),
    label: text(input.label, `${path}.label`),
    ...(input.detail === undefined
      ? {}
      : { detail: text(input.detail, `${path}.detail`, { maximum: 500 }) }),
    icon: icon(input.icon, `${path}.icon`),
  };
}

function validateHypothesis(value, index) {
  const path = `projection.hypotheses[${index}]`;
  const input = plainObject(value, path);
  exactKeys(
    input,
    path,
    ["id", "label", "summary"],
    ["selected", "available"],
  );
  return {
    id: identifier(input.id, `${path}.id`),
    label: text(input.label, `${path}.label`),
    summary: text(input.summary, `${path}.summary`, { maximum: 500 }),
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
  exactKeys(
    input,
    path,
    ["id", "label", "summary", "icon"],
    ["hypothesisId"],
  );
  return {
    id: identifier(input.id, `${path}.id`),
    label: text(input.label, `${path}.label`),
    summary: text(input.summary, `${path}.summary`, { maximum: 500 }),
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
  exactKeys(
    input,
    path,
    ["id", "state"],
    ["label", "detail", "icon", "kind", "progress", "position"],
  );
  const state = input.state;
  if (!["discovered", "selected", "undiscovered"].includes(state)) {
    fail(`${path}.state`, "is not a public graph state");
  }
  if (
    state === "undiscovered" &&
    ["label", "detail", "icon", "kind", "progress", "position"].some((key) =>
      Object.hasOwn(input, key),
    )
  ) {
    fail(path, "must not reveal undiscovered node material");
  }

  const projected = {
    id: identifier(input.id, `${path}.id`),
    state,
  };
  if (state !== "undiscovered") {
    projected.label = text(input.label, `${path}.label`);
    if (input.detail !== undefined) {
      projected.detail = text(input.detail, `${path}.detail`, {
        maximum: 500,
      });
    }
    if (input.icon !== undefined) projected.icon = icon(input.icon, `${path}.icon`);
    if (input.kind !== undefined) {
      projected.kind = identifier(input.kind, `${path}.kind`);
    }
    if (input.progress !== undefined) {
      projected.progress = text(input.progress, `${path}.progress`, {
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
          fail(`${path}.position.${axis}`, "must be a bounded number");
        }
      }
      projected.position = { x: position.x, y: position.y };
    }
  }
  return projected;
}

function validateGraphEdge(value, index) {
  const path = `projection.graph.edges[${index}]`;
  const input = plainObject(value, path);
  exactKeys(input, path, ["from", "to"], ["id", "state"]);
  const projected = {
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
      fail(`${path}.state`, "is not a public edge state");
    }
    projected.state = input.state;
  }
  return projected;
}

function validateHint(value, index) {
  const path = `projection.hints[${index}]`;
  const input = plainObject(value, path);
  exactKeys(
    input,
    path,
    ["id", "step", "title", "state"],
    ["body", "condition"],
  );
  if (![1, 2, 3].includes(input.step)) {
    fail(`${path}.step`, "must be 1, 2, or 3");
  }
  if (!["unlocked", "available", "locked"].includes(input.state)) {
    fail(`${path}.state`, "is not a public hint state");
  }
  if (input.state !== "unlocked" && input.body !== undefined) {
    fail(`${path}.body`, "must not reveal a locked hint");
  }
  return {
    id: identifier(input.id, `${path}.id`),
    step: input.step,
    title: text(input.title, `${path}.title`),
    state: input.state,
    ...(input.body === undefined
      ? {}
      : { body: text(input.body, `${path}.body`, { maximum: 2_000 }) }),
    ...(input.condition === undefined
      ? {}
      : {
          condition: text(input.condition, `${path}.condition`, {
            maximum: 500,
          }),
        }),
  };
}

function validateRecentEvent(value, index) {
  const path = `projection.recentEvents[${index}]`;
  const input = plainObject(value, path);
  exactKeys(input, path, ["id", "at", "message"]);
  const at = text(input.at, `${path}.at`, { maximum: 32 });
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(at) ||
    Number.isNaN(Date.parse(at))
  ) {
    fail(`${path}.at`, "must be an ISO 8601 UTC timestamp");
  }
  return {
    id: identifier(input.id, `${path}.id`),
    at,
    message: text(input.message, `${path}.message`, { maximum: 500 }),
  };
}

export function validateProjection(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    fail("projection", "must be JSON serializable");
  }
  if (
    typeof serialized !== "string" ||
    Buffer.byteLength(serialized) > MAX_PROJECTION_BYTES
  ) {
    fail("projection", `must not exceed ${MAX_PROJECTION_BYTES} bytes`);
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
    ],
  );

  if (input.experience !== undefined && input.experience !== "live") {
    fail("projection.experience", "must be live");
  }

  if (!["active", "complete", "ended"].includes(input.status)) {
    fail("projection.status", "is not a public session status");
  }

  const facts = array(input.facts, "projection.facts", 14).map(validateFact);
  const hypotheses = array(
    input.hypotheses,
    "projection.hypotheses",
    32,
  ).map(validateHypothesis);
  const investigations =
    input.investigations === undefined
      ? undefined
      : array(
          input.investigations,
          "projection.investigations",
          8,
        ).map(validateInvestigation);
  const graph = plainObject(input.graph, "projection.graph");
  exactKeys(graph, "projection.graph", ["nodes", "edges"]);
  const nodes = array(graph.nodes, "projection.graph.nodes", 32).map(
    validateGraphNode,
  );
  const edges = array(graph.edges, "projection.graph.edges", 96).map(
    validateGraphEdge,
  );
  const hints = array(input.hints, "projection.hints", 3).map(validateHint);
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
    ensureUnique(items, path);
  }
  if (investigations) {
    ensureUnique(investigations, "projection.investigations");
  }

  const progress = plainObject(input.progress, "projection.progress");
  exactKeys(progress, "projection.progress", ["discovered", "total"]);
  const total = integer(progress.total, "projection.progress.total", {
    minimum: 14,
    maximum: 14,
  });
  const discovered = integer(
    progress.discovered,
    "projection.progress.discovered",
    { maximum: total },
  );

  const telemetry = plainObject(input.telemetry, "projection.telemetry");
  exactKeys(telemetry, "projection.telemetry", ["status"], ["message"]);
  if (!["live", "reconnecting", "unavailable"].includes(telemetry.status)) {
    fail("projection.telemetry.status", "is not a detector status");
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

  return {
    experience: "live",
    sessionId: identifier(input.sessionId, "projection.sessionId"),
    revision: integer(input.revision, "projection.revision"),
    status: input.status,
    ...(input.heading === undefined
      ? {}
      : { heading: text(input.heading, "projection.heading", { maximum: 500 }) }),
    ...(input.lede === undefined
      ? {}
      : { lede: text(input.lede, "projection.lede", { maximum: 1_000 }) }),
    ...(input.objective === undefined
      ? {}
      : {
          objective: text(input.objective, "projection.objective", {
            maximum: 500,
          }),
        }),
    ...(input.consultationQuestion === undefined
      ? {}
      : {
          consultationQuestion: text(
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
    progress: { discovered, total },
    recentEvents,
    telemetry: {
      status: telemetry.status,
      ...(telemetry.message === undefined
        ? {}
        : {
            message: optionalText(
              telemetry.message,
              "projection.telemetry.message",
            ),
          }),
    },
    capabilities: {
      manualFlagSubmission: false,
    },
  };
}
