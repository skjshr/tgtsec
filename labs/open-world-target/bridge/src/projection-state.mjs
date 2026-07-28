import { createHash } from "node:crypto";

import { BridgeError } from "./errors.mjs";
import { validateProjection } from "./projection.mjs";

export class ProjectionRollbackError extends BridgeError {
  constructor(message) {
    super("projection_rollback", message, { retryable: true });
    this.name = "ProjectionRollbackError";
  }
}

export class ProjectionConflictError extends BridgeError {
  constructor(message) {
    super("projection_conflict", message);
    this.name = "ProjectionConflictError";
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalProjectionJson(projection) {
  return JSON.stringify(canonicalize(projection));
}

export function projectionHash(projection) {
  return createHash("sha256")
    .update(canonicalProjectionJson(projection), "utf8")
    .digest("hex");
}

export class ProjectionTracker {
  #projection = null;
  #hash = null;

  get current() {
    return this.#projection === null
      ? null
      : structuredClone(this.#projection);
  }

  get currentHash() {
    return this.#hash;
  }

  accept(value) {
    const next = validateProjection(value);
    const nextHash = projectionHash(next);
    if (this.#projection === null) {
      this.#projection = next;
      this.#hash = nextHash;
      return {
        changed: true,
        projection: structuredClone(next),
        hash: nextHash,
      };
    }
    if (next.sessionId !== this.#projection.sessionId) {
      throw new ProjectionConflictError(
        "target projection changed session identity",
      );
    }
    if (next.revision < this.#projection.revision) {
      throw new ProjectionRollbackError(
        "target projection revision moved backwards",
      );
    }
    if (next.revision === this.#projection.revision) {
      if (nextHash !== this.#hash) {
        throw new ProjectionConflictError(
          "target projection changed at the same revision",
        );
      }
      return {
        changed: false,
        projection: structuredClone(this.#projection),
        hash: this.#hash,
      };
    }

    this.#projection = next;
    this.#hash = nextHash;
    return {
      changed: true,
      projection: structuredClone(next),
      hash: nextHash,
    };
  }
}
