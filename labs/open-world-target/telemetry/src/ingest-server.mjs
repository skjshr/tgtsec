import net from "node:net";

import { authenticateWireEvent } from "./event-auth.mjs";
import { asPublicError, LabError } from "./errors.mjs";

const MAX_EVENT_BYTES = 8192;
export const EVENT_INGEST_DEADLINE_MS = 1_500;
export const MAX_EVENT_CONNECTIONS = 64;

function reply(socket, body) {
  socket.end(`${JSON.stringify(body)}\n`, () => {
    // A peer can keep its writable half open after receiving our FIN. Release the
    // accepted socket as soon as the bounded reply has been flushed.
    socket.destroy();
  });
}

export function createEventIngestServer({ engine, eventKeys }) {
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let body = "";
    let completed = false;
    const deadline = setTimeout(() => {
      if (!complete()) return;
      const error = asPublicError(
        new LabError(
          "event_timeout",
          "教材イベントの受信が時間内に完了しませんでした。",
          408,
        ),
      );
      reply(socket, error.body);
    }, EVENT_INGEST_DEADLINE_MS);

    function complete() {
      if (completed) return false;
      completed = true;
      clearTimeout(deadline);
      return true;
    }

    socket.on("data", (chunk) => {
      if (completed) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_EVENT_BYTES) {
        complete();
        const error = asPublicError(
          new LabError(
            "event_too_large",
            "教材イベントが大きすぎます。",
            413,
          ),
        );
        reply(socket, error.body);
        return;
      }
      const newline = body.indexOf("\n");
      if (newline === -1) return;
      complete();

      const line = body.slice(0, newline);
      if (body.slice(newline + 1).trim().length > 0) {
        const error = asPublicError(
          new LabError(
            "multiple_events",
            "1接続につき1イベントだけ送信します。",
          ),
        );
        reply(socket, error.body);
        return;
      }

      try {
        const input = authenticateWireEvent(JSON.parse(line), eventKeys);
        const result = engine.applyEvent(input);
        reply(socket, {
          accepted: true,
          changed: result.changed,
          revision: result.projection.revision,
        });
      } catch (error) {
        const publicError = asPublicError(error);
        reply(socket, publicError.body);
      }
    });

    socket.on("end", () => {
      if (!completed && body.length > 0) {
        complete();
        try {
          const input = authenticateWireEvent(JSON.parse(body), eventKeys);
          const result = engine.applyEvent(input);
          reply(socket, {
            accepted: true,
            changed: result.changed,
            revision: result.projection.revision,
          });
        } catch (error) {
          const publicError = asPublicError(error);
          reply(socket, publicError.body);
        }
      } else if (!completed) {
        complete();
      }
    });

    socket.on("error", () => {
      complete();
      // The sender receives failure through its own connection. Never log payloads.
    });
    socket.on("close", () => {
      clearTimeout(deadline);
    });
  });
  server.maxConnections = MAX_EVENT_CONNECTIONS;
  return server;
}

export async function listenForEvents(server, { socketPath, fd = null }) {
  if (fd !== null) {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen({ fd }, () => {
        server.off("error", reject);
        resolve();
      });
    });
    return;
  }

  if (typeof socketPath !== "string" || socketPath.length === 0) {
    throw new Error("event socket path is required");
  }
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
}
