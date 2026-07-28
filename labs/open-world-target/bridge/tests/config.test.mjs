import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TARGET_ORIGIN,
  loadConfig,
} from "../src/config.mjs";

const TOKEN = "deployment-secret-".padEnd(40, "x");
const TARGET_TOKEN = "target-secret-".padEnd(40, "t");

test("configuration defaults to the direct Debian telemetry origin", () => {
  const config = loadConfig({
    BRIDGE_CLOUD_ORIGIN: "https://guide.example.test",
    BRIDGE_DEPLOYMENT_TOKEN: TOKEN,
    BRIDGE_TARGET_TOKEN: TARGET_TOKEN,
  });

  assert.equal(config.targetOrigin, DEFAULT_TARGET_ORIGIN);
  assert.equal(config.cloudOrigin, "https://guide.example.test");
  assert.equal(config.targetToken, TARGET_TOKEN);
  assert.equal(config.heartbeatMs, 10_000);
  assert.equal(config.actionPollMs, 1_000);
});

test("configuration accepts an explicit loopback origin and bounded intervals", () => {
  const config = loadConfig({
    BRIDGE_TARGET_ORIGIN: "http://127.0.0.1:8787",
    BRIDGE_CLOUD_ORIGIN: "http://127.0.0.1:4000",
    BRIDGE_DEPLOYMENT_TOKEN: TOKEN,
    BRIDGE_TARGET_TOKEN: TARGET_TOKEN,
    BRIDGE_HEARTBEAT_MS: "5000",
    BRIDGE_ACTION_POLL_MS: "250",
    BRIDGE_REQUEST_TIMEOUT_MS: "30000",
  });

  assert.equal(config.targetOrigin, "http://127.0.0.1:8787");
  assert.equal(config.cloudOrigin, "http://127.0.0.1:4000");
  assert.equal(config.heartbeatMs, 5_000);
  assert.equal(config.actionPollMs, 250);
});

test("configuration rejects unsafe cloud transport, credentials, and secrets", () => {
  assert.throws(
    () =>
      loadConfig({
        BRIDGE_TARGET_ORIGIN: "http://192.0.2.10:8787",
        BRIDGE_CLOUD_ORIGIN: "https://guide.example.test",
        BRIDGE_DEPLOYMENT_TOKEN: TOKEN,
        BRIDGE_TARGET_TOKEN: TARGET_TOKEN,
      }),
    /direct target address or loopback/,
  );
  assert.throws(
    () =>
      loadConfig({
        BRIDGE_CLOUD_ORIGIN: "http://cloud.example.test",
        BRIDGE_DEPLOYMENT_TOKEN: TOKEN,
        BRIDGE_TARGET_TOKEN: TARGET_TOKEN,
      }),
    /must use HTTPS/,
  );
  assert.throws(
    () =>
      loadConfig({
        BRIDGE_CLOUD_ORIGIN: "https://user:pass@cloud.example.test",
        BRIDGE_DEPLOYMENT_TOKEN: TOKEN,
        BRIDGE_TARGET_TOKEN: TARGET_TOKEN,
      }),
    /without credentials/,
  );
  assert.throws(
    () =>
      loadConfig({
        BRIDGE_CLOUD_ORIGIN: "https://cloud.example.test",
        BRIDGE_DEPLOYMENT_TOKEN: "short",
        BRIDGE_TARGET_TOKEN: TARGET_TOKEN,
      }),
    /32-512/,
  );
  assert.throws(
    () =>
      loadConfig({
        BRIDGE_CLOUD_ORIGIN: "https://cloud.example.test",
        BRIDGE_DEPLOYMENT_TOKEN: TOKEN,
        BRIDGE_TARGET_TOKEN: TARGET_TOKEN,
        BRIDGE_HEARTBEAT_MS: "4999",
      }),
    /5000 to 60000/,
  );
  assert.throws(
    () =>
      loadConfig({
        BRIDGE_CLOUD_ORIGIN: "https://cloud.example.test",
        BRIDGE_DEPLOYMENT_TOKEN: TOKEN,
      }),
    /BRIDGE_TARGET_TOKEN.*32-512/,
  );
});
