import { targetPathForAction } from "./actions.mjs";
import { BridgeError, writeSafeError } from "./errors.mjs";
import {
  ProjectionBoundaryError,
} from "./projection.mjs";
import {
  ProjectionConflictError,
  ProjectionRollbackError,
  ProjectionTracker,
} from "./projection-state.mjs";
import {
  parseProjectionFrame,
  parseSseStream,
  reconnectDelay,
  waitFor,
} from "./sse.mjs";

function isAbort(error, signal) {
  return (
    signal.aborted ||
    error?.name === "AbortError" ||
    error?.code === "ABORT_ERR"
  );
}

export function shouldReconnect(error) {
  if (error instanceof ProjectionConflictError) return false;
  if (error instanceof ProjectionBoundaryError) return false;
  if (error instanceof ProjectionRollbackError) return true;
  return error instanceof BridgeError && error.retryable === true;
}

export class KaliBridge {
  #controller = new AbortController();
  #tracker = new ProjectionTracker();
  #uploadTail = Promise.resolve();
  #running = false;

  constructor({
    config,
    targetClient,
    cloudClient,
    output = (value) => process.stdout.write(value),
    errorOutput = (value) => process.stderr.write(value),
    random = Math.random,
  }) {
    this.config = config;
    this.target = targetClient;
    this.cloud = cloudClient;
    this.output = output;
    this.errorOutput = errorOutput;
    this.random = random;
  }

  get signal() {
    return this.#controller.signal;
  }

  get projection() {
    return this.#tracker.current;
  }

  stop(reason = new DOMException("Bridge stopped", "AbortError")) {
    if (!this.#controller.signal.aborted) this.#controller.abort(reason);
  }

  #logError(code, error) {
    writeSafeError(this.errorOutput, code, error, {
      secrets: [
        ...(this.target.secrets ?? []),
        ...(this.cloud.secrets ?? []),
      ],
    });
  }

  async #withRetry(operation, code) {
    let attempt = 0;
    while (!this.signal.aborted) {
      try {
        return await operation();
      } catch (error) {
        if (isAbort(error, this.signal)) throw error;
        if (!shouldReconnect(error)) throw error;
        this.#logError(code, error);
        await waitFor(
          reconnectDelay(attempt, {
            baseMs: this.config.reconnectBaseMs,
            maxMs: this.config.reconnectMaxMs,
            random: this.random,
          }),
          this.signal,
        );
        attempt += 1;
      }
    }
    throw this.signal.reason;
  }

  #queueUpload(projection, ackActionIds = []) {
    const job = this.#uploadTail.then(() =>
      this.#withRetry(
        () =>
          this.cloud.uploadSnapshot(projection, {
            ackActionIds,
            signal: this.signal,
          }),
        "cloud_snapshot_retry",
      ),
    );
    this.#uploadTail = job.catch(() => undefined);
    return job;
  }

  async #loadInitialProjection() {
    const raw = await this.#withRetry(
      () => this.target.getState({ signal: this.signal }),
      "target_state_retry",
    );
    return this.#tracker.accept(raw).projection;
  }

  async #runSse() {
    let attempt = 0;
    while (!this.signal.aborted) {
      try {
        const current = this.#tracker.current;
        const response = await this.target.openEvents({
          lastEventId: current?.revision,
          signal: this.signal,
        });
        for await (const frame of parseSseStream(response.body, {
          idleTimeoutMs: this.config.sseIdleTimeoutMs,
          signal: this.signal,
        })) {
          const raw = parseProjectionFrame(frame);
          if (raw === null) continue;
          const result = this.#tracker.accept(raw);
          if (result.changed) await this.#queueUpload(result.projection);
          attempt = 0;
        }
        if (this.signal.aborted) return;
        throw new BridgeError(
          "target_sse_closed",
          "target SSE closed before bridge shutdown",
          { retryable: true },
        );
      } catch (error) {
        if (isAbort(error, this.signal)) return;
        if (!shouldReconnect(error)) throw error;
        this.#logError("target_sse_retry", error);
        await waitFor(
          reconnectDelay(attempt, {
            baseMs: this.config.reconnectBaseMs,
            maxMs: this.config.reconnectMaxMs,
            random: this.random,
          }),
          this.signal,
        );
        attempt += 1;
      }
    }
  }

  async #runHeartbeats() {
    while (!this.signal.aborted) {
      await waitFor(this.config.heartbeatMs, this.signal);
      const current = this.#tracker.current;
      if (current) await this.#queueUpload(current);
    }
  }

  async #runActions() {
    let pollAfterMs = this.config.actionPollMs;
    let retryAttempt = 0;
    while (!this.signal.aborted) {
      try {
        const result = await this.cloud.pollActions({ signal: this.signal });
        pollAfterMs = result.pollAfterMs;
        for (const action of result.actions) {
          const raw = await this.target.applyAction(
            targetPathForAction(action),
            { signal: this.signal },
          );
          const projection = this.#tracker.accept(raw).projection;
          if (!projection) {
            throw new BridgeError(
              "projection_missing",
              "action completed without a current projection",
            );
          }
          await this.#queueUpload(projection, [action.id]);
        }
        retryAttempt = 0;
      } catch (error) {
        if (isAbort(error, this.signal)) return;
        if (!shouldReconnect(error)) throw error;
        this.#logError("cloud_actions_retry", error);
        pollAfterMs = reconnectDelay(retryAttempt, {
          baseMs: this.config.reconnectBaseMs,
          maxMs: this.config.reconnectMaxMs,
          random: this.random,
        });
        retryAttempt += 1;
      }
      await waitFor(pollAfterMs, this.signal);
    }
  }

  async run() {
    if (this.#running) {
      throw new BridgeError("bridge_running", "bridge is already running");
    }
    this.#running = true;
    const tasks = [];
    try {
      const initial = await this.#loadInitialProjection();
      const session = await this.cloud.createSession(initial.sessionId, {
        signal: this.signal,
      });
      this.output(
        `Pairing code: ${session.pairingCode}\nViewer URL: ${session.viewerUrl}\n`,
      );
      await this.#queueUpload(initial);

      tasks.push(
        this.#runSse(),
        this.#runHeartbeats(),
        this.#runActions(),
      );
      try {
        await Promise.all(tasks);
      } catch (error) {
        if (!isAbort(error, this.signal)) throw error;
      }
    } finally {
      this.stop();
      if (tasks.length > 0) await Promise.allSettled(tasks);
      await this.#uploadTail;
      this.#running = false;
    }
  }
}
