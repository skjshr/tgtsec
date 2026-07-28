# Work Order: Kali Bridge implementation

## Goal

Implement a production-oriented Node.js Kali Bridge that reads the Debian
telemetry state/SSE over direct Ethernet and uploads only sanitized full
projections to the cloud relay.

## Non-goals

- Do not edit contracts, docs, root `package.json`, or `apps/lab-guide`.
- Do not capture shell commands, output, credentials, files, or flags.
- Do not forward ports, create a tunnel, enable forwarding, or mutate networking.
- Do not implement target exploitation.

## Inputs and binding contracts

- `PROJECT_CONSTITUTION.md`
- `TASK_CONTRACT.md`
- `docs/LIVE_ARCHITECTURE.md`
- `labs/open-world-target/telemetry/api-contract.json`
- `apps/lab-guide/src/types.ts`

## Owned files

- New files only under `labs/open-world-target/bridge`

## Requirements

- Node.js 20+, no shell invocation.
- Configured target and cloud origins; target defaults to
  `http://10.13.37.10:8787`.
- Create a cloud session with deployment Bridge authorization, print only the
  pairing code and public viewer URL, then retain the per-session upload token
  in memory.
- Subscribe to target SSE, upload initial and changed full projections, send
  bounded heartbeats, reconnect with exponential backoff, and reject revision
  rollback or a changed payload at the same revision.
- Poll only allowlisted guide actions (`selectHypothesis`, `unlockHint`), send
  them to fixed target API paths, and acknowledge them with the resulting
  snapshot. Do not support manual flag relay.
- Bound response sizes, validate content types, redact secrets from errors, and
  stop cleanly on SIGINT/SIGTERM.

## Done

- Unit tests cover configuration, projection boundary, rollback/conflict,
  SSE parsing/reconnect decisions, fixed action paths, and secret-safe logging.
- Package-local test command passes.
- Return at most 700 words with files changed, commands run, and remaining real
  network gates.
