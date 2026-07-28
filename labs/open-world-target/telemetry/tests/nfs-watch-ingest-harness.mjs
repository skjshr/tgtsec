import { readFile } from "node:fs/promises";

import {
  createEventIngestServer,
  listenForEvents,
} from "../src/ingest-server.mjs";
import { SessionEngine } from "../src/session-engine.mjs";

const sessionId = "nfs-kernel-integration";
const socketPath = process.env.LAB_EVENT_SOCKET;
const rootKeyPath = process.env.LAB_EVENT_ROOT_KEY_FILE;
if (!socketPath || !rootKeyPath) {
  throw new Error("integration socket and root key paths are required");
}

const rootKey = Buffer.from(
  (await readFile(rootKeyPath, "utf8")).trim(),
  "utf8",
);
const engine = new SessionEngine({ sessionId });
const server = createEventIngestServer({
  engine,
  eventKeys: {
    low: Buffer.from("unused-low-integration-key-32-bytes", "utf8"),
    root: rootKey,
  },
});

const timeout = setTimeout(() => {
  process.stderr.write("timed out waiting for signed NFS event\n");
  server.close(() => {
    process.exitCode = 2;
  });
}, 10_000);

engine.once("change", (projection) => {
  clearTimeout(timeout);
  process.stdout.write(
    `event-accepted ${JSON.stringify({
      discovered: projection.progress.discovered,
      facts: projection.facts.map((fact) => fact.label),
    })}\n`,
  );
  server.close();
});

await listenForEvents(server, { socketPath });
process.stdout.write("ingest-ready\n");
