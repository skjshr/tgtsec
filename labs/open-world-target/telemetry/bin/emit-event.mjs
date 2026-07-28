#!/usr/bin/env node

import net from "node:net";

import {
  DEFAULT_EVENT_KEY_PATHS,
  signEvent,
  sourceScope,
} from "../src/event-auth.mjs";
import { readFile } from "node:fs/promises";

const EVENT_REPLY_TIMEOUT_MS = 1_500;

const OPTION_FIELDS = Object.freeze({
  "--kind": "kind",
  "--node": "nodeId",
  "--source": "sourceId",
  "--evidence": "evidenceCode",
  "--at": "occurredAt",
  "--session": "sessionId",
  "--socket": "socketPath",
});

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const field = OPTION_FIELDS[option];
    if (!field || index + 1 >= argv.length) {
      throw new Error(`unknown or incomplete option: ${option}`);
    }
    options[field] = argv[index + 1];
    index += 1;
  }
  return options;
}

function sendEvent(socketPath, event) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let response = "";
    let completed = false;
    const deadline = setTimeout(() => {
      fail(new Error("telemetry daemon timed out"));
    }, EVENT_REPLY_TIMEOUT_MS);

    function fail(error) {
      if (completed) return;
      completed = true;
      clearTimeout(deadline);
      socket.destroy();
      reject(error);
    }

    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify(event)}\n`));
    socket.on("data", (chunk) => {
      response += chunk;
      if (response.length > 4096) {
        fail(new Error("telemetry reply is too large"));
      }
    });
    socket.on("end", () => {
      if (completed) return;
      completed = true;
      clearTimeout(deadline);
      try {
        resolve(JSON.parse(response));
      } catch {
        reject(new Error("telemetry daemon returned an invalid reply"));
      }
    });
    socket.on("error", fail);
    socket.on("close", () => {
      if (!completed) {
        fail(new Error("telemetry daemon closed without a reply"));
      }
    });
  });
}

try {
  const options = parseArguments(process.argv.slice(2));
  const event = {
    sessionId: options.sessionId ?? process.env.LAB_SESSION_ID,
    kind: options.kind,
    nodeId: options.nodeId,
    sourceId: options.sourceId,
    evidenceCode: options.evidenceCode,
    occurredAt: options.occurredAt ?? new Date().toISOString(),
  };
  const socketPath =
    options.socketPath ??
    process.env.LAB_EVENT_SOCKET ??
    "/run/examserver-open-world/events.sock";
  if (
    Object.values(event).some(
      (value) => typeof value !== "string" || value.length === 0,
    )
  ) {
    throw new Error("session, kind, node, source, and evidence are required");
  }

  const scope = sourceScope(event.sourceId);
  if (!scope) throw new Error("event source is not allowlisted");
  const keyPath =
    scope === "low"
      ? (process.env.LAB_EVENT_LOW_KEY_FILE ?? DEFAULT_EVENT_KEY_PATHS.low)
      : (process.env.LAB_EVENT_ROOT_KEY_FILE ?? DEFAULT_EVENT_KEY_PATHS.root);
  const key = Buffer.from((await readFile(keyPath, "utf8")).trim(), "utf8");
  const wireEvent = {
    ...event,
    authTag: signEvent(event, key),
  };
  const result = await sendEvent(socketPath, wireEvent);
  if (result.accepted !== true) {
    throw new Error(result.error?.code ?? "event_rejected");
  }
  process.stdout.write(
    `accepted=${result.accepted} changed=${result.changed} revision=${result.revision}\n`,
  );
} catch (error) {
  process.stderr.write(`open-world-event: ${error.message}\n`);
  process.exitCode = 1;
}
