# Work Order: Target World and Telemetry

## Bound contracts

- `PROJECT_CONSTITUTION.md`
- `DESIGN.md`
- `TASK_CONTRACT.md`

## Goal

Implement the fictional business target fixtures, 14-flag world definition, privacy-bounded event/state engine, local HTTP/SSE API, and automated tests under `labs/open-world-target/world` and `labs/open-world-target/telemetry`.

## Non-goals

- Do not edit root contracts, README, guide frontend, platform, operator, or legacy lab.
- Do not implement real third-party CVEs, brute force, malware, persistence, or external networking.
- Do not execute exploit commands against this machine.

## Constraints

- Use dependency-light Debian-compatible code.
- Never persist raw commands, parameters, credentials, file contents, or arbitrary logs.
- Do not ship unrevealed answers in public API responses.
- Fixtures must be obviously synthetic and contain no real personal or company data.

## Done

- World graph validates 3 entrances, 3 footholds, 3 root paths, 14 flags, and nine viable combinations.
- Event allowlist, idempotent state transitions, sanitized projection, SSE, reconnect/state fallback, and manual flag fallback are covered by executable tests.
- Static service fixtures/config examples express the intended Web, SMB, NFS, sudo, timer, and SUID training boundaries.

## Report

Return at most 12 bullets: changed paths, tests run, limitations, and questions requiring root judgment.
