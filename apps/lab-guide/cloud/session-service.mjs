import { CloudError, fail } from "./errors.mjs";
import { validatePublicProjection } from "./projection.mjs";
import { projectionHash, waitingProjection } from "./projection-state.mjs";
import {
  SAFE_ID,
  assertSafeId,
  assertSecret,
  constantTimeEqual,
  hashSecret,
  opaqueToken,
  pairingLookupKey,
  shortPairingCode,
  signSessionCookie,
  validateOrigin,
  verifySessionCookie,
} from "./security.mjs";

const ACTION_TYPES = new Set([
  "selectHypothesis",
  "unlockHint",
  "setGuidance",
]);
const GUIDANCE_COMMAND_IDS = new Set([
  "preset.easy",
  "preset.normal",
  "preset.hard",
  "showNextChoices.on",
  "showNextChoices.off",
  "showToolNames.on",
  "showToolNames.off",
  "showCommandSyntax.on",
  "showCommandSyntax.off",
  "showCommandExamples.on",
  "showCommandExamples.off",
  "explainNoProgress.on",
  "explainNoProgress.off",
  "explanationDepth.brief",
  "explanationDepth.full",
  "silhouetteDepth.0",
  "silhouetteDepth.1",
]);
const MAX_PENDING_ACTIONS = 32;
const MAX_CAS_ATTEMPTS = 8;

function positiveInteger(value, name, { minimum = 1, maximum } = {}) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    (maximum !== undefined && value > maximum)
  ) {
    throw new Error(`${name} is outside its supported range`);
  }
  return value;
}

function viewerPath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    throw new Error("viewerPath must be an absolute path without query or fragment");
  }
  return value;
}

function exactRecordKeys(record) {
  const expected = [
    "actions",
    "createdAt",
    "expiresAtMs",
    "lastBridgeAtMs",
    "projection",
    "projectionHash",
    "sessionId",
    "storeVersion",
    "targetSessionId",
    "uploadTokenHash",
  ];
  const actual = Object.keys(record).sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error("stored session has unexpected fields");
  }
}

function validIso(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function validateAction(action) {
  if (
    action === null ||
    typeof action !== "object" ||
    Array.isArray(action) ||
    Object.keys(action).sort().join(",") !== "createdAt,id,targetId,type" ||
    typeof action.id !== "string" ||
    !SAFE_ID.test(action.id) ||
    !ACTION_TYPES.has(action.type) ||
    typeof action.targetId !== "string" ||
    !SAFE_ID.test(action.targetId) ||
    !validIso(action.createdAt)
  ) {
    throw new Error("stored session contains an invalid action");
  }
}

function validateStoredRecord(record, expectedSessionId) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("stored session is invalid");
  }
  exactRecordKeys(record);
  if (
    record.sessionId !== expectedSessionId ||
    !SAFE_ID.test(record.sessionId) ||
    !SAFE_ID.test(record.targetSessionId) ||
    typeof record.uploadTokenHash !== "string" ||
    record.uploadTokenHash.length < 32 ||
    !Number.isSafeInteger(record.storeVersion) ||
    record.storeVersion < 0 ||
    !validIso(record.createdAt) ||
    !Number.isSafeInteger(record.expiresAtMs) ||
    (record.lastBridgeAtMs !== null &&
      (!Number.isSafeInteger(record.lastBridgeAtMs) ||
        record.lastBridgeAtMs < 0)) ||
    !Array.isArray(record.actions) ||
    record.actions.length > MAX_PENDING_ACTIONS
  ) {
    throw new Error("stored session is invalid");
  }
  record.actions.forEach(validateAction);
  if (new Set(record.actions.map((action) => action.id)).size !== record.actions.length) {
    throw new Error("stored session contains duplicate actions");
  }

  if (record.projection === null) {
    if (record.projectionHash !== null) {
      throw new Error("stored session has a hash without a projection");
    }
  } else {
    const projection = validatePublicProjection(record.projection);
    if (
      projection.sessionId !== record.targetSessionId ||
      typeof record.projectionHash !== "string" ||
      !constantTimeEqual(projectionHash(projection), record.projectionHash)
    ) {
      throw new Error("stored session projection integrity check failed");
    }
  }
  return record;
}

function validateAcknowledgements(value) {
  const input = value === undefined ? [] : value;
  if (
    !Array.isArray(input) ||
    input.length > 32 ||
    input.some((id) => typeof id !== "string" || !SAFE_ID.test(id)) ||
    new Set(input).size !== input.length
  ) {
    fail(
      400,
      "invalid_acknowledgement",
      "完了通知が不正です。",
      "ackActionIds must be unique safe identifiers",
    );
  }
  return input;
}

function ensureActionTarget(record, type, targetId) {
  if (!record.projection) {
    fail(409, "state_not_ready", "進行情報が届くまで操作できません。");
  }
  if (type === "selectHypothesis") {
    const hypothesis = record.projection.hypotheses.find(
      (item) => item.id === targetId,
    );
    if (!hypothesis || hypothesis.available === false) {
      fail(409, "action_unavailable", "この選択肢は現在利用できません。");
    }
    return;
  }
  if (type === "setGuidance") {
    if (!GUIDANCE_COMMAND_IDS.has(targetId)) {
      fail(409, "action_unavailable", "この表示設定は利用できません。");
    }
    return;
  }
  const hint = record.projection.hints.find((item) => item.id === targetId);
  if (!hint || hint.state !== "available") {
    fail(409, "action_unavailable", "このヒントは現在利用できません。");
  }
}

export class SessionService {
  constructor({
    store,
    deploymentSecret,
    cookieSecret,
    publicOrigin,
    viewerPath: configuredViewerPath = "/",
    sessionTtlMs = 4 * 60 * 60 * 1_000,
    pairingTtlMs = 5 * 60 * 1_000,
    staleAfterMs = 12_000,
    pollAfterMs = 1_000,
    now = Date.now,
    randomBytes,
  }) {
    if (!store) throw new Error("store is required");
    if (typeof deploymentSecret !== "string" || deploymentSecret.length < 32) {
      throw new Error("deploymentSecret must contain at least 32 characters");
    }
    if (typeof cookieSecret !== "string" || cookieSecret.length < 32) {
      throw new Error("cookieSecret must contain at least 32 characters");
    }
    this.store = store;
    this.deploymentSecret = deploymentSecret;
    this.cookieSecret = cookieSecret;
    this.publicOrigin =
      publicOrigin === undefined ? undefined : validateOrigin(publicOrigin);
    this.viewerPath = viewerPath(configuredViewerPath);
    this.sessionTtlMs = positiveInteger(sessionTtlMs, "sessionTtlMs", {
      minimum: 60_000,
      maximum: 24 * 60 * 60 * 1_000,
    });
    this.pairingTtlMs = positiveInteger(pairingTtlMs, "pairingTtlMs", {
      minimum: 30_000,
      maximum: Math.min(this.sessionTtlMs, 30 * 60 * 1_000),
    });
    this.staleAfterMs = positiveInteger(staleAfterMs, "staleAfterMs", {
      minimum: 1_000,
      maximum: 5 * 60 * 1_000,
    });
    this.pollAfterMs = positiveInteger(pollAfterMs, "pollAfterMs", {
      minimum: 250,
      maximum: 10_000,
    });
    this.now = now;
    this.randomBytes = randomBytes;
  }

  async #getLiveSession(sessionId) {
    const record = await this.store.getSession(sessionId);
    if (!record) {
      fail(410, "session_expired", "この接続は期限切れです。");
    }
    validateStoredRecord(record, sessionId);
    if (record.expiresAtMs <= this.now()) {
      fail(410, "session_expired", "この接続は期限切れです。");
    }
    return record;
  }

  #remainingTtl(record) {
    const remaining = record.expiresAtMs - this.now();
    if (remaining < 1) {
      fail(410, "session_expired", "この接続は期限切れです。");
    }
    return remaining;
  }

  #publicState(record) {
    if (!record.projection) return waitingProjection(record.targetSessionId);
    const projection = structuredClone(record.projection);
    if (
      record.lastBridgeAtMs !== null &&
      this.now() - record.lastBridgeAtMs > this.staleAfterMs &&
      projection.telemetry.status === "live"
    ) {
      projection.telemetry = {
        status: "reconnecting",
        message: "Kali Bridge からの更新を待っています。",
      };
    }
    return projection;
  }

  async createSession({ deploymentToken, targetSessionId, requestOrigin }) {
    assertSecret(
      deploymentToken,
      this.deploymentSecret,
      "invalid_bridge_secret",
    );
    assertSafeId(targetSessionId, "targetSessionId");
    const viewerOrigin =
      this.publicOrigin ??
      validateOrigin(requestOrigin, "incoming request origin");
    const nowMs = this.now();
    const expiresAtMs = nowMs + this.sessionTtlMs;

    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const sessionId = `session-${opaqueToken(18, this.randomBytes)}`;
      const uploadToken = opaqueToken(32, this.randomBytes);
      const pairingCode = shortPairingCode(this.randomBytes);
      const record = {
        storeVersion: 0,
        sessionId,
        targetSessionId,
        uploadTokenHash: hashSecret(uploadToken),
        createdAt: new Date(nowMs).toISOString(),
        expiresAtMs,
        lastBridgeAtMs: null,
        projection: null,
        projectionHash: null,
        actions: [],
      };
      const created = await this.store.createSession({
        sessionId,
        pairingLookup: pairingLookupKey(pairingCode, this.cookieSecret),
        record,
        sessionTtlMs: this.sessionTtlMs,
        pairingTtlMs: this.pairingTtlMs,
      });
      if (!created) continue;
      return {
        sessionId,
        pairingCode,
        uploadToken,
        viewerUrl: new URL(this.viewerPath, viewerOrigin).toString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
    }
    throw new CloudError(
      503,
      "session_unavailable",
      "接続を作成できませんでした。",
    );
  }

  async pair(code) {
    const normalized =
      typeof code === "string" ? code.trim().toUpperCase() : "";
    if (!/^[A-Z2-9]{6}$/.test(normalized)) {
      fail(400, "invalid_pairing_code", "6文字の接続コードを入力してください。");
    }
    const sessionId = await this.store.consumePairing(
      pairingLookupKey(normalized, this.cookieSecret),
    );
    if (!sessionId) {
      fail(404, "pairing_unavailable", "接続コードを確認できません。");
    }
    const record = await this.#getLiveSession(sessionId);
    return {
      projection: this.#publicState(record),
      cookieValue: signSessionCookie(
        { sessionId: record.sessionId, expiresAtMs: record.expiresAtMs },
        this.cookieSecret,
      ),
      expiresAtMs: record.expiresAtMs,
    };
  }

  async pairedSession(cookieValue) {
    const cookie = verifySessionCookie(
      cookieValue,
      this.cookieSecret,
      this.now(),
    );
    const record = await this.#getLiveSession(cookie.sessionId);
    if (record.expiresAtMs !== cookie.expiresAtMs) {
      fail(401, "invalid_session", "接続情報を確認できません。");
    }
    return record;
  }

  async getState(cookieValue) {
    return this.#publicState(await this.pairedSession(cookieValue));
  }

  async uploadSnapshot({
    sessionId,
    uploadToken,
    projection,
    ackActionIds,
  }) {
    assertSafeId(sessionId, "sessionId");
    if (
      typeof uploadToken !== "string" ||
      uploadToken.length < 32 ||
      uploadToken.length > 512 ||
      /\s/.test(uploadToken)
    ) {
      fail(401, "invalid_upload_token", "認証できません。");
    }
    const acknowledgements = validateAcknowledgements(ackActionIds);
    const sanitized = validatePublicProjection(projection);
    const nextHash = projectionHash(sanitized);

    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const record = await this.#getLiveSession(sessionId);
      assertSecret(
        hashSecret(uploadToken),
        record.uploadTokenHash,
        "invalid_upload_token",
      );
      if (sanitized.sessionId !== record.targetSessionId) {
        fail(
          409,
          "session_conflict",
          "進行データの接続先が一致しません。",
        );
      }
      if (
        record.projection &&
        sanitized.revision < record.projection.revision
      ) {
        fail(
          409,
          "revision_rollback",
          "古い進行データは受け付けられません。",
        );
      }
      if (
        record.projection &&
        sanitized.revision === record.projection.revision &&
        !constantTimeEqual(nextHash, record.projectionHash)
      ) {
        fail(
          409,
          "revision_conflict",
          "同じ版の進行データが一致しません。",
        );
      }

      const acknowledged = new Set(acknowledgements);
      const nextRecord = {
        ...record,
        storeVersion: record.storeVersion + 1,
        lastBridgeAtMs: this.now(),
        projection:
          record.projection &&
          sanitized.revision === record.projection.revision
            ? record.projection
            : sanitized,
        projectionHash:
          record.projection &&
          sanitized.revision === record.projection.revision
            ? record.projectionHash
            : nextHash,
        actions: record.actions.filter((action) => !acknowledged.has(action.id)),
      };
      const result = await this.store.compareAndSetSession({
        sessionId,
        expectedVersion: record.storeVersion,
        record: nextRecord,
        ttlMs: this.#remainingTtl(record),
      });
      if (result === "stored") return;
      if (result === "missing") {
        fail(410, "session_expired", "この接続は期限切れです。");
      }
    }
    throw new CloudError(
      503,
      "concurrent_update",
      "更新が重なりました。もう一度お試しください。",
    );
  }

  async pollActions({ sessionId, uploadToken }) {
    assertSafeId(sessionId, "sessionId");
    const record = await this.#getLiveSession(sessionId);
    assertSecret(
      hashSecret(typeof uploadToken === "string" ? uploadToken : ""),
      record.uploadTokenHash,
      "invalid_upload_token",
    );
    return {
      actions: structuredClone(record.actions),
      pollAfterMs: this.pollAfterMs,
    };
  }

  async queueAction({ cookieValue, type, targetId }) {
    if (!ACTION_TYPES.has(type)) {
      fail(404, "not_found", "このAPIはありません。");
    }
    assertSafeId(targetId, "targetId");
    const cookie = verifySessionCookie(
      cookieValue,
      this.cookieSecret,
      this.now(),
    );

    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const record = await this.#getLiveSession(cookie.sessionId);
      if (record.expiresAtMs !== cookie.expiresAtMs) {
        fail(401, "invalid_session", "接続情報を確認できません。");
      }
      ensureActionTarget(record, type, targetId);
      const duplicate = record.actions.find(
        (action) => action.type === type && action.targetId === targetId,
      );
      if (duplicate) return this.#publicState(record);
      if (record.actions.length >= MAX_PENDING_ACTIONS) {
        fail(429, "action_queue_full", "操作が混み合っています。");
      }
      const action = {
        id: `action-${opaqueToken(12, this.randomBytes)}`,
        type,
        targetId,
        createdAt: new Date(this.now()).toISOString(),
      };
      const nextRecord = {
        ...record,
        storeVersion: record.storeVersion + 1,
        actions: [...record.actions, action],
      };
      const result = await this.store.compareAndSetSession({
        sessionId: record.sessionId,
        expectedVersion: record.storeVersion,
        record: nextRecord,
        ttlMs: this.#remainingTtl(record),
      });
      if (result === "stored") return this.#publicState(nextRecord);
      if (result === "missing") {
        fail(410, "session_expired", "この接続は期限切れです。");
      }
    }
    throw new CloudError(
      503,
      "concurrent_update",
      "更新が重なりました。もう一度お試しください。",
    );
  }
}

export { ACTION_TYPES };
