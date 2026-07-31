# Vercel live backend

The public guide is static and works with no environment variables. Live
pairing uses the Vercel function in `api/index.mjs` plus Upstash Redis.

Canonical public URL:

<https://exam-server-one.vercel.app/lab>

## Required Vercel configuration

- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- `LAB_BRIDGE_DEPLOYMENT_SECRET` — 32+ random characters; provide the same
  value to Kali as `BRIDGE_DEPLOYMENT_TOKEN`.
- `LAB_SESSION_COOKIE_SECRET` — a different 32+ character random value used
  only by the cloud backend.
- `LAB_PUBLIC_ORIGIN` — `https://exam-server-one.vercel.app`.
- `LAB_VIEWER_PATH` — `/lab` (also the runtime default).

Optional tuning:

- `LAB_SESSION_TTL_SECONDS` (default 4 hours)
- `LAB_PAIRING_TTL_SECONDS` (default 5 minutes)
- `LAB_BRIDGE_STALE_SECONDS` (default 12 seconds)

Do not place target telemetry tokens, flag strings, or learner credentials in
Vercel environment variables.

## Runtime behavior

The Bridge creates a room, uploads a sanitized projection, and prints a
single-use six-character pairing code. The browser receives a signed
`Secure; HttpOnly; SameSite=Strict` cookie after pairing. The event endpoint
returns one bounded SSE state frame and closes; `EventSource` reconnects after
one second, so no long-lived function or in-memory room is required.

Redis conditional updates keep revisions monotonic, and pairing codes are deleted
before a session is returned so they remain single-use. Browser actions are
limited to hypothesis selection, hint unlock, and exact allowlisted guidance
settings. No manual flag submission route exists; flag text stays outside the
projection and cloud relay. The relay stores no
profile, account, or personal progress record; the current projection is the
only browser-visible location.

Run the repository checks before deployment:

```text
npm ci --prefix apps/lab-guide
npm run check
```

Every production publish must pass an external API smoke through
`https://exam-server-one.vercel.app/api/lab`: `create 200 → pair 200 →
replay 404 → waiting state 200 → snapshot 204 → live state 200 → SSE 200`.
A physical Kali Bridge, Debian target, and Ethernet isolation checklist remain
separate hardware gates.
