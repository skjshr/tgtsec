# Work Order: Live transition verification audit

## Goal

Define an executable verification matrix for a web-readable idle state and
real-time session-driven route and display changes.

## Non-goals

- Do not edit files.
- Do not count fixture-only screenshots as proof of cloud integration.
- Do not claim physical target readiness.

## Inputs and binding contracts

- `PROJECT_CONSTITUTION.md`
- `DESIGN.md`
- `TASK_CONTRACT.md`
- `apps/lab-guide/src`
- `apps/lab-guide/tests`
- `tests`

## Constraints

- Verify desktop and 360x800.
- Cover offline reading, waiting, pairing/live, reconnecting, and complete.
- Verify that a new sanitized event changes the visible projection without a
  page reload.

## Done

Return at most 700 words listing test layers, concrete commands, browser
scenarios, and blockers. Include `file:line` evidence.
