import { Redis } from "@upstash/redis";

import { createCloudHandler } from "./http.mjs";
import { SessionService } from "./session-service.mjs";
import { RedisSessionStore } from "./store.mjs";

let singleton;

function required(environment, name, minimumLength = 1) {
  const value = environment[name];
  if (typeof value !== "string" || value.length < minimumLength) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalMilliseconds(environment, name, fallback) {
  const raw = environment[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer`);
  return Number(raw) * 1_000;
}

export function createRuntime(environment = process.env) {
  const redis = new Redis({
    url: required(environment, "UPSTASH_REDIS_REST_URL"),
    token: required(environment, "UPSTASH_REDIS_REST_TOKEN"),
  });
  const store = new RedisSessionStore({
    redis,
    prefix: environment.LAB_REDIS_PREFIX ?? "examserver:lab-guide:v1",
  });
  const service = new SessionService({
    store,
    deploymentSecret: required(
      environment,
      "LAB_BRIDGE_DEPLOYMENT_SECRET",
      32,
    ),
    cookieSecret: required(environment, "LAB_SESSION_COOKIE_SECRET", 32),
    ...(environment.LAB_PUBLIC_ORIGIN
      ? { publicOrigin: environment.LAB_PUBLIC_ORIGIN }
      : {}),
    viewerPath: environment.LAB_VIEWER_PATH ?? "/lab",
    sessionTtlMs: optionalMilliseconds(
      environment,
      "LAB_SESSION_TTL_SECONDS",
      4 * 60 * 60 * 1_000,
    ),
    pairingTtlMs: optionalMilliseconds(
      environment,
      "LAB_PAIRING_TTL_SECONDS",
      5 * 60 * 1_000,
    ),
    staleAfterMs: optionalMilliseconds(
      environment,
      "LAB_BRIDGE_STALE_SECONDS",
      12_000,
    ),
  });
  return createCloudHandler({ service });
}

export function getRuntime() {
  singleton ??= createRuntime();
  return singleton;
}
