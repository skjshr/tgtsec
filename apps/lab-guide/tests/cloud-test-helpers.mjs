import { createCloudHandler, SESSION_COOKIE_NAME } from "../cloud/http.mjs";
import { SessionService } from "../cloud/session-service.mjs";
import { MemorySessionStore } from "../cloud/store.mjs";

export const DEPLOYMENT_SECRET =
  "bridge-deployment-secret-for-tests-000000000000";
export const COOKIE_SECRET =
  "browser-cookie-signing-secret-for-tests-000000000";
export const ORIGIN = "https://guide.examserver.example";

export function projection(revision = 1) {
  return {
    experience: "live",
    sessionId: "target-session-1",
    revision,
    status: "active",
    heading: "風切モータースの状況",
    lede: "確認済みの事実だけをつないで次の調査を選びます。",
    objective: "最初の入口を確認する",
    consultationQuestion: "次にどこを調べますか？",
    facts: [
      {
        id: "fact-web",
        label: "Webサービスが応答した",
        detail: "HTTPの公開画面を確認した。",
        icon: "browser",
      },
    ],
    hypotheses: [
      {
        id: "hyp-web",
        label: "Web診断を調べる",
        summary: "入力と応答の違いを観察する。",
        selected: false,
        available: true,
      },
    ],
    investigations: [
      {
        id: "investigation-web",
        label: "Web診断を調べる",
        summary: "公開画面から確認を始める。",
        icon: "globe",
        hypothesisId: "hyp-web",
      },
    ],
    graph: {
      nodes: [
        {
          id: "node-web",
          state: "discovered",
          label: "Web入口",
          detail: "HTTPサービス",
          icon: "globe",
          progress: "発見済み",
          position: { x: 20, y: 40 },
        },
        { id: "node-root", state: "undiscovered" },
      ],
      edges: [
        {
          id: "edge-web-root",
          from: "node-web",
          to: "node-root",
          state: "possible",
        },
      ],
    },
    hints: [
      {
        id: "hint-web-1",
        step: 1,
        title: "見る場所",
        state: "available",
        condition: "仮説を選ぶと開けます。",
      },
      {
        id: "hint-web-2",
        step: 2,
        title: "使う道具",
        state: "locked",
        condition: "前のヒントを確認すると開けます。",
      },
    ],
    progress: { discovered: 1, total: 14 },
    recentEvents: [
      {
        id: "event-web",
        at: "2026-07-28T01:02:03.000Z",
        message: "Webサービスを確認した。",
      },
    ],
    telemetry: { status: "live" },
    capabilities: { manualFlagSubmission: true },
  };
}

export function createHarness(options = {}) {
  let nowMs = Date.parse("2026-07-28T01:00:00.000Z");
  const now = () => nowMs;
  const store = new MemorySessionStore({ now });
  const service = new SessionService({
    store,
    deploymentSecret: DEPLOYMENT_SECRET,
    cookieSecret: COOKIE_SECRET,
    sessionTtlMs: options.sessionTtlMs ?? 120_000,
    pairingTtlMs: options.pairingTtlMs ?? 30_000,
    staleAfterMs: options.staleAfterMs ?? 5_000,
    now,
    ...(options.publicOrigin ? { publicOrigin: options.publicOrigin } : {}),
    ...(options.viewerPath ? { viewerPath: options.viewerPath } : {}),
  });
  const handler = createCloudHandler({ service, now });

  return {
    handler,
    now,
    store,
    service,
    advance(milliseconds) {
      nowMs += milliseconds;
    },
  };
}

export async function call(
  harness,
  path,
  { method = "GET", headers = {}, json, rawBody } = {},
) {
  const body = rawBody ?? (json === undefined ? undefined : JSON.stringify(json));
  const requestHeaders = new Headers(headers);
  if (json !== undefined && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json");
  }
  return harness.handler.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: requestHeaders,
      ...(body === undefined ? {} : { body }),
    }),
  );
}

export async function createBridgeSession(harness, overrides = {}) {
  const response = await call(harness, "/api/bridge/session", {
    method: "POST",
    headers: {
      authorization: `Bearer ${overrides.secret ?? DEPLOYMENT_SECRET}`,
    },
    json: { targetSessionId: overrides.targetSessionId ?? "target-session-1" },
  });
  return { response, body: await response.json() };
}

export async function pairBrowser(harness, pairingCode) {
  const response = await call(harness, "/api/session/pair", {
    method: "POST",
    json: { code: pairingCode },
  });
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";", 1)[0];
  return {
    response,
    body: await response.json(),
    cookie,
    cookieValue: cookie.startsWith(`${SESSION_COOKIE_NAME}=`)
      ? cookie.slice(SESSION_COOKIE_NAME.length + 1)
      : "",
    setCookie,
  };
}

export async function upload(harness, bridge, value, ackActionIds) {
  return call(harness, "/api/bridge/snapshot", {
    method: "POST",
    headers: {
      authorization: `Bearer ${bridge.uploadToken}`,
      "x-lab-session": bridge.sessionId,
    },
    json: {
      projection: value,
      ...(ackActionIds === undefined ? {} : { ackActionIds }),
    },
  });
}

export async function poll(harness, bridge) {
  const response = await call(harness, "/api/bridge/actions", {
    headers: {
      authorization: `Bearer ${bridge.uploadToken}`,
      "x-lab-session": bridge.sessionId,
    },
  });
  return { response, body: await response.json() };
}
