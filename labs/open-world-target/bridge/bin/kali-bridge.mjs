#!/usr/bin/env node

import { KaliBridge } from "../src/bridge.mjs";
import { loadConfig } from "../src/config.mjs";
import { writeSafeError } from "../src/errors.mjs";
import { CloudClient, TargetClient } from "../src/http.mjs";

let config;
let cloud;
let bridge;

try {
  config = loadConfig();
  const target = new TargetClient({
    origin: config.targetOrigin,
    targetToken: config.targetToken,
    requestTimeoutMs: config.requestTimeoutMs,
  });
  cloud = new CloudClient({
    origin: config.cloudOrigin,
    deploymentToken: config.deploymentToken,
    requestTimeoutMs: config.requestTimeoutMs,
  });
  bridge = new KaliBridge({
    config,
    targetClient: target,
    cloudClient: cloud,
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => bridge.stop());
  }

  await bridge.run();
} catch (error) {
  if (!bridge?.signal.aborted) {
    writeSafeError(process.stderr.write.bind(process.stderr), "fatal", error, {
      secrets: [
        config?.targetToken,
        ...(cloud?.secrets ?? [config?.deploymentToken]),
      ],
    });
    process.exitCode = 1;
  }
}
