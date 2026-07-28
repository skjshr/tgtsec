#!/usr/bin/env node

import { validateWorld } from "../../world/validate-world.mjs";
import { WORLD } from "../../world/world-definition.mjs";
import {
  DEFAULT_EVENT_KEY_PATHS,
  loadEventKeys,
} from "../src/event-auth.mjs";
import { createLabHttpServer } from "../src/http-server.mjs";
import {
  createEventIngestServer,
  listenForEvents,
} from "../src/ingest-server.mjs";
import { SessionEngine } from "../src/session-engine.mjs";
import { JsonStateStore } from "../src/state-store.mjs";
import { installDetectorStatusSignals } from "../src/status-control.mjs";

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("LAB_HTTP_PORT must be an integer between 1 and 65535");
  }
  return port;
}

function inheritedSocketFd() {
  if (
    process.env.LISTEN_PID === String(process.pid) &&
    process.env.LISTEN_FDS === "1"
  ) {
    return 3;
  }
  return null;
}

validateWorld(WORLD);

const sessionId = process.env.LAB_SESSION_ID ?? "local-session";
const telemetryStatus = process.env.LAB_TELEMETRY_STATUS ?? "live";
const httpHost = process.env.LAB_HTTP_HOST ?? "127.0.0.1";
const httpPort = parsePort(process.env.LAB_HTTP_PORT ?? "8787");
const eventSocketPath =
  process.env.LAB_EVENT_SOCKET ?? "/run/examserver-open-world/events.sock";
const statePath =
  process.env.LAB_STATE_PATH ??
  "/var/lib/examserver-open-world/telemetry-state.json";
const eventKeys = await loadEventKeys({
  lowPath:
    process.env.LAB_EVENT_LOW_KEY_FILE ?? DEFAULT_EVENT_KEY_PATHS.low,
  rootPath:
    process.env.LAB_EVENT_ROOT_KEY_FILE ?? DEFAULT_EVENT_KEY_PATHS.root,
});
const bridgeToken = process.env.TELEMETRY_BRIDGE_TOKEN;

const store = new JsonStateStore(statePath);
const storedState = await store.load();
const engine = new SessionEngine({
  world: WORLD,
  sessionId,
  telemetryStatus,
  storedState,
});
const removeDetectorStatusSignals = installDetectorStatusSignals({ engine });
const httpServer = createLabHttpServer({ engine, bridgeToken });
const ingestServer = createEventIngestServer({ engine, eventKeys });

let persistence = Promise.resolve();
engine.on("change", () => {
  const snapshot = engine.exportState();
  persistence = persistence
    .then(() => store.save(snapshot))
    .catch((error) => {
      process.stderr.write(`telemetry state save failed: ${error.message}\n`);
    });
});

await new Promise((resolve, reject) => {
  httpServer.once("error", reject);
  httpServer.listen(httpPort, httpHost, () => {
    httpServer.off("error", reject);
    resolve();
  });
});
await listenForEvents(ingestServer, {
  socketPath: eventSocketPath,
  fd: inheritedSocketFd(),
});

process.stdout.write(
  `open-world telemetry ready http=${httpHost}:${httpPort} session=${sessionId}\n`,
);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  removeDetectorStatusSignals();
  const httpClosed = new Promise((resolve) => httpServer.close(resolve));
  httpServer.closeAllConnections();
  await Promise.all([
    httpClosed,
    new Promise((resolve) => ingestServer.close(resolve)),
  ]);
  await persistence;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stop()
      .then(() => {
        process.exitCode = 0;
      })
      .catch((error) => {
        process.stderr.write(`telemetry shutdown failed: ${error.message}\n`);
        process.exitCode = 1;
      });
  });
}
