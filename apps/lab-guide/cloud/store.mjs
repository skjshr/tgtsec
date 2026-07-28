const CREATE_SESSION_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 1 or redis.call("EXISTS", KEYS[2]) == 1 then
  return 0
end
redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[3])
redis.call("SET", KEYS[2], ARGV[2], "PX", ARGV[4])
return 1
`;

const COMPARE_AND_SET_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
  return -1
end
local ok, decoded = pcall(cjson.decode, current)
if not ok or tonumber(decoded.storeVersion) ~= tonumber(ARGV[1]) then
  return 0
end
redis.call("SET", KEYS[1], ARGV[2], "PX", ARGV[3])
return 1
`;

const CONSUME_PAIRING_SCRIPT = `
local sessionId = redis.call("GET", KEYS[1])
if not sessionId then
  return false
end
redis.call("DEL", KEYS[1])
return sessionId
`;

function ttl(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function clone(value) {
  return value === null ? null : structuredClone(value);
}

function decodeRecord(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return JSON.parse(value);
  if (typeof value === "object" && !Array.isArray(value)) return clone(value);
  throw new Error("Redis returned an invalid session record");
}

export class MemorySessionStore {
  #sessions = new Map();
  #pairings = new Map();

  constructor({ now = Date.now } = {}) {
    this.now = now;
  }

  #live(entry, collection, key) {
    if (!entry) return null;
    if (entry.expiresAtMs <= this.now()) {
      collection.delete(key);
      return null;
    }
    return entry;
  }

  async createSession({
    sessionId,
    pairingLookup,
    record,
    sessionTtlMs,
    pairingTtlMs,
  }) {
    ttl(sessionTtlMs, "sessionTtlMs");
    ttl(pairingTtlMs, "pairingTtlMs");
    if (
      this.#live(this.#sessions.get(sessionId), this.#sessions, sessionId) ||
      this.#live(this.#pairings.get(pairingLookup), this.#pairings, pairingLookup)
    ) {
      return false;
    }
    const nowMs = this.now();
    this.#sessions.set(sessionId, {
      value: clone(record),
      expiresAtMs: nowMs + sessionTtlMs,
    });
    this.#pairings.set(pairingLookup, {
      value: sessionId,
      expiresAtMs: nowMs + pairingTtlMs,
    });
    return true;
  }

  async getSession(sessionId) {
    const entry = this.#live(
      this.#sessions.get(sessionId),
      this.#sessions,
      sessionId,
    );
    return entry ? clone(entry.value) : null;
  }

  async compareAndSetSession({
    sessionId,
    expectedVersion,
    record,
    ttlMs,
  }) {
    ttl(ttlMs, "ttlMs");
    const current = this.#live(
      this.#sessions.get(sessionId),
      this.#sessions,
      sessionId,
    );
    if (!current) return "missing";
    if (current.value.storeVersion !== expectedVersion) return "conflict";
    this.#sessions.set(sessionId, {
      value: clone(record),
      expiresAtMs: this.now() + ttlMs,
    });
    return "stored";
  }

  async consumePairing(pairingLookup) {
    const entry = this.#live(
      this.#pairings.get(pairingLookup),
      this.#pairings,
      pairingLookup,
    );
    if (!entry) return null;
    this.#pairings.delete(pairingLookup);
    return entry.value;
  }
}

export class RedisSessionStore {
  constructor({ redis, prefix = "examserver:lab-guide:v1" }) {
    if (
      !redis ||
      typeof redis.get !== "function" ||
      typeof redis.eval !== "function"
    ) {
      throw new Error("redis client must provide get and eval");
    }
    if (
      typeof prefix !== "string" ||
      prefix.length < 1 ||
      prefix.length > 100 ||
      /[\r\n]/.test(prefix)
    ) {
      throw new Error("Redis key prefix is invalid");
    }
    this.redis = redis;
    this.prefix = prefix;
  }

  #sessionKey(sessionId) {
    return `${this.prefix}:session:${sessionId}`;
  }

  #pairingKey(pairingLookup) {
    return `${this.prefix}:pair:${pairingLookup}`;
  }

  async createSession({
    sessionId,
    pairingLookup,
    record,
    sessionTtlMs,
    pairingTtlMs,
  }) {
    const result = await this.redis.eval(
      CREATE_SESSION_SCRIPT,
      [this.#sessionKey(sessionId), this.#pairingKey(pairingLookup)],
      [
        JSON.stringify(record),
        sessionId,
        ttl(sessionTtlMs, "sessionTtlMs"),
        ttl(pairingTtlMs, "pairingTtlMs"),
      ],
    );
    return Number(result) === 1;
  }

  async getSession(sessionId) {
    return decodeRecord(await this.redis.get(this.#sessionKey(sessionId)));
  }

  async compareAndSetSession({
    sessionId,
    expectedVersion,
    record,
    ttlMs,
  }) {
    const result = Number(
      await this.redis.eval(
        COMPARE_AND_SET_SCRIPT,
        [this.#sessionKey(sessionId)],
        [
          expectedVersion,
          JSON.stringify(record),
          ttl(ttlMs, "ttlMs"),
        ],
      ),
    );
    if (result === 1) return "stored";
    if (result === -1) return "missing";
    return "conflict";
  }

  async consumePairing(pairingLookup) {
    const result = await this.redis.eval(
      CONSUME_PAIRING_SCRIPT,
      [this.#pairingKey(pairingLookup)],
      [],
    );
    return typeof result === "string" && result.length > 0 ? result : null;
  }
}

export const redisScripts = Object.freeze({
  createSession: CREATE_SESSION_SCRIPT,
  compareAndSet: COMPARE_AND_SET_SCRIPT,
  consumePairing: CONSUME_PAIRING_SCRIPT,
});
