import { BridgeError } from "./errors.mjs";

export const MAX_CONTROL_BYTES = 64 * 1024;

function makeAbort(signal, timeoutMs) {
  const controller = new AbortController();
  let externalAbort;
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    externalAbort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", externalAbort, { once: true });
  }
  const timeout = setTimeout(
    () =>
      controller.abort(
        new BridgeError("request_timeout", "bounded HTTP request timed out", {
          retryable: true,
        }),
      ),
    timeoutMs,
  );
  return {
    signal: controller.signal,
    release() {
      clearTimeout(timeout);
      if (externalAbort) signal.removeEventListener("abort", externalAbort);
    },
  };
}

async function boundedText(response, maximumBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let value = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new BridgeError(
          "response_too_large",
          "HTTP response exceeded its bounded size",
        );
      }
      value += decoder.decode(chunk.value, { stream: true });
    }
    value += decoder.decode();
    return value;
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    throw new BridgeError(
      "invalid_response",
      "HTTP response is not valid UTF-8",
    );
  } finally {
    reader.releaseLock();
  }
}

export async function fetchHeaders(
  fetchImpl,
  url,
  { method = "GET", headers = {}, body, signal, timeoutMs },
) {
  const bounded = makeAbort(signal, timeoutMs);
  try {
    return await fetchImpl(url, {
      method,
      headers,
      body,
      signal: bounded.signal,
      redirect: "error",
      cache: "no-store",
    });
  } catch (error) {
    if (bounded.signal.aborted) {
      throw bounded.signal.reason instanceof Error
        ? bounded.signal.reason
        : new BridgeError("request_aborted", "HTTP request was aborted", {
            retryable: true,
          });
    }
    throw new BridgeError("request_failed", "HTTP request failed", {
      retryable: true,
      cause: error,
    });
  } finally {
    bounded.release();
  }
}

export async function requestJson(
  fetchImpl,
  url,
  {
    method = "GET",
    headers = {},
    body,
    signal,
    timeoutMs,
    maximumBytes = MAX_CONTROL_BYTES,
    statuses = [200],
    allowEmpty = false,
  },
) {
  const serializedBody = body === undefined ? undefined : JSON.stringify(body);
  const bounded = makeAbort(signal, timeoutMs);
  let response;
  try {
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          accept: "application/json",
          ...(serializedBody === undefined
            ? {}
            : { "content-type": "application/json" }),
          ...headers,
        },
        body: serializedBody,
        signal: bounded.signal,
        redirect: "error",
        cache: "no-store",
      });
    } catch (error) {
      if (bounded.signal.aborted) {
        throw bounded.signal.reason instanceof Error
          ? bounded.signal.reason
          : new BridgeError("request_aborted", "HTTP request was aborted", {
              retryable: true,
            });
      }
      throw new BridgeError("request_failed", "HTTP request failed", {
        retryable: true,
        cause: error,
      });
    }
    if (!statuses.includes(response.status)) {
      try {
        await response.body?.cancel();
      } catch {
        // Ignore peer shutdown while returning a static safe error.
      }
      throw new BridgeError(
        "unexpected_status",
        `HTTP peer returned status ${response.status}`,
        { retryable: response.status >= 500 || response.status === 429 },
      );
    }
    if (allowEmpty && [202, 204].includes(response.status)) return undefined;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      try {
        await response.body?.cancel();
      } catch {
        // Ignore peer shutdown while returning a static safe error.
      }
      throw new BridgeError(
        "invalid_content_type",
        "HTTP peer did not return application/json",
      );
    }
    const text = await boundedText(response, maximumBytes);
    if (allowEmpty && text.length === 0) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      throw new BridgeError("invalid_json", "HTTP peer returned invalid JSON");
    }
  } finally {
    bounded.release();
  }
}
