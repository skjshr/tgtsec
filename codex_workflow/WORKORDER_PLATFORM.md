# Work Order: Debian Platform and Recovery

## Bound contracts

- `PROJECT_CONSTITUTION.md`
- `DESIGN.md`
- `TASK_CONTRACT.md`

## Goal

Implement deterministic Debian exercise/maintenance configuration, wired-only network controls, fail-closed preflight, trusted recovery-media workflow, and operator documentation under `labs/open-world-target/platform` and `labs/open-world-target/operator`.

## Non-goals

- Do not edit root contracts, README, guide, telemetry/world, or legacy lab.
- Do not run partitioning, formatting, bootloader, network shutdown, reboot, or recovery commands on this machine.
- Do not claim physical verification.

## Constraints

- All destructive scripts default to dry-run and require exact disk identity, partition UUID, confirmation phrase, and hash before mutation.
- Exercise mode must have no Wi-Fi, default route, external DNS, or Internet egress.
- Maintenance mode must stop vulnerable services before enabling update connectivity.
- Recovery happens from trusted removable media, never the compromised Debian installation.

## Done

- Build/install manifest and mode units are present.
- Network isolation and mode preflight can be tested without changing host state.
- Recovery normal path, EFI verification, and full-image fallback are documented and guarded.
- Automated static/unit tests cover fail-closed behavior.

## Report

Return at most 12 bullets: changed paths, tests run, destructive guards, physical gates, and root questions.
