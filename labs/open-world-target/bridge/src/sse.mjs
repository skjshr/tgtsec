import { BridgeError } from "./errors.mjs";
import { MAX_PROJECTION_BYTES } from "./projection.mjs";

export const MAX_SSE_EVENT_BYTES = MAX_PROJECTION_BYTES + 8_192;

function timeoutError() {
  return new BridgeError(
    "target_sse_idle",
    "target SSE stopped sending bounded keepalives",
    { retryable: true },
  );
}

async function readWithDeadline(reader, milliseconds, signal) {
  let timeout;
  let abortHandler;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(timeoutError()), milliseconds);
  });
  const aborted = new Promise((_, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    abortHandler = () =>
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abortHandler, { once: true });
  });
  try {
    return await Promise.race([reader.read(), deadline, aborted]);
  } finally {
    clearTimeout(timeout);
    if (abortHandler) signal.removeEventListener("abort", abortHandler);
  }
}

function dispatchFrame(frame) {
  if (frame.data.length === 0) return null;
  return {
    event: frame.event || "message",
    id: frame.id,
    data: frame.data.join("\n"),
    retry: frame.retry,
  };
}

function parseLine(line, frame) {
  if (line.startsWith(":")) return;
  const colon = line.indexOf(":");
  const field = colon === -1 ? line : line.slice(0, colon);
  let value = colon === -1 ? "" : line.slice(colon + 1);
  if (value.startsWith(" ")) value = value.slice(1);

  if (field === "data") frame.data.push(value);
  if (field === "event") frame.event = value;
  if (field === "id" && !value.includes("\u0000")) frame.id = value;
  if (field === "retry" && /^\d{1,9}$/.test(value)) {
    frame.retry = Number(value);
  }
}

export async function* parseSseStream(
  stream,
  {
    idleTimeoutMs = 25_000,
    maxEventBytes = MAX_SSE_EVENT_BYTES,
    signal,
  } = {},
) {
  if (!stream || typeof stream.getReader !== "function") {
    throw new BridgeError("invalid_sse", "target SSE body is not readable");
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let eventBytes = 0;
  let frame = { data: [], event: "", id: "", retry: undefined };

  try {
    while (true) {
      const { done, value } = await readWithDeadline(
        reader,
        idleTimeoutMs,
        signal,
      );
      if (done) break;
      let decoded;
      try {
        decoded = decoder.decode(value, { stream: true });
      } catch {
        throw new BridgeError(
          "invalid_sse",
          "target SSE is not valid UTF-8",
        );
      }
      buffer += decoded;
      if (Buffer.byteLength(buffer) > maxEventBytes) {
        throw new BridgeError(
          "sse_event_too_large",
          "target SSE event exceeded the public projection limit",
        );
      }

      while (true) {
        const newline = buffer.indexOf("\n");
        if (newline === -1) break;
        let line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        eventBytes += Buffer.byteLength(line) + 1;
        if (eventBytes > maxEventBytes) {
          throw new BridgeError(
            "sse_event_too_large",
            "target SSE event exceeded the public projection limit",
          );
        }
        if (line === "") {
          const dispatched = dispatchFrame(frame);
          frame = { data: [], event: "", id: "", retry: undefined };
          eventBytes = 0;
          if (dispatched) yield dispatched;
        } else {
          parseLine(line, frame);
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.length > 0) {
      let line = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
      eventBytes += Buffer.byteLength(line);
      if (eventBytes > maxEventBytes) {
        throw new BridgeError(
          "sse_event_too_large",
          "target SSE event exceeded the public projection limit",
        );
      }
      parseLine(line, frame);
    }
    const dispatched = dispatchFrame(frame);
    if (dispatched) yield dispatched;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The target may already have closed the response.
    }
    reader.releaseLock();
  }
}

export function parseProjectionFrame(frame) {
  if (
    !frame ||
    !["message", "state", "snapshot"].includes(frame.event)
  ) {
    return null;
  }
  let projection;
  try {
    projection = JSON.parse(frame.data);
  } catch {
    throw new BridgeError("invalid_sse_json", "target SSE data is not JSON");
  }
  if (frame.id !== "") {
    if (!/^\d+$/.test(frame.id) || Number(frame.id) !== projection?.revision) {
      throw new BridgeError(
        "invalid_sse_revision",
        "target SSE id does not match its projection revision",
      );
    }
  }
  return projection;
}

export function reconnectDelay(
  attempt,
  { baseMs = 500, maxMs = 30_000, random = Math.random } = {},
) {
  const boundedAttempt = Math.max(0, Math.min(20, Number(attempt) || 0));
  const exponential = Math.min(maxMs, baseMs * 2 ** boundedAttempt);
  const jitter = 0.75 + Math.max(0, Math.min(1, random())) * 0.5;
  return Math.max(baseMs, Math.min(maxMs, Math.round(exponential * jitter)));
}

export function waitFor(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(done, milliseconds);
    function done() {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", aborted, { once: true });
  });
}
