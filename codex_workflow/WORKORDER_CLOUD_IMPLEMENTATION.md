# Work Order: Vercel live relay implementation

## Goal

Implement the Vercel-side session relay for short-lived pairing, durable
sanitized projections, SSE updates, and an allowlisted guide-action queue.

## Non-goals

- Do not edit contracts, docs, `src`, or target/bridge code.
- Do not store or accept raw commands, output, credentials, file contents, or
  flag strings.
- Do not provide remote shell or arbitrary URL forwarding.
- Do not deploy or create external resources.

## Inputs and binding contracts

- `PROJECT_CONSTITUTION.md`
- `TASK_CONTRACT.md`
- `docs/LIVE_ARCHITECTURE.md`
- `apps/lab-guide/src/types.ts`
- `apps/lab-guide/src/api.ts`
- `apps/lab-guide/package.json`

## Owned files

- New files under `apps/lab-guide/cloud`
- New files under `apps/lab-guide/api`
- New cloud-focused tests under `apps/lab-guide/tests`
- `apps/lab-guide/vercel.json`
- `apps/lab-guide/package.json` and lockfile only for an explicitly required
  Redis dependency

## Requirements

- Use a durable Redis adapter in production and an injected memory store in
  tests. Never claim function memory is durable.
- Bridge creation requires a deployment-level bearer secret.
- Generate opaque session and upload tokens plus a short-lived pairing code.
- Pairing sets a signed, Secure, HttpOnly, SameSite=Strict cookie.
- Snapshot upload strictly sanitizes the public projection, rejects forbidden
  fields and locked hint bodies, and enforces monotonic revision plus
  same-revision hash idempotence.
- `GET /api/lab/session/state` and bounded `GET /api/lab/session/events` serve only the
  paired session.
- Queue only `selectHypothesis` and `unlockHint`; Bridge polling and snapshot
  acknowledgement remove completed actions.
- Session TTL, body limits, no-store headers, safe errors, and constant-time
  secret comparison are required.

## Done

- Unit/integration tests cover auth, pairing, cookie tampering, expiry,
  sanitization, rollback/conflict, action allowlist, acknowledgement, and SSE
  output.
- `npm --prefix apps/lab-guide test` and `typecheck` remain passable.
- Return at most 800 words with files changed, commands run, and required Vercel
  environment variables.
