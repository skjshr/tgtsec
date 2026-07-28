# Work Order: Cloud guide audit

## Goal

Report the smallest coherent change that lets `apps/lab-guide` remain useful as a
standalone Vercel website and switch to live session projections when a Kali
bridge connects.

## Non-goals

- Do not edit files.
- Do not redesign the three themes.
- Do not add command execution from the browser.

## Inputs and binding contracts

- `PROJECT_CONSTITUTION.md`
- `DESIGN.md`
- `TASK_CONTRACT.md`
- `apps/lab-guide/AGENTS.md`
- `apps/lab-guide/src`
- `apps/lab-guide/server`
- `apps/lab-guide/worker`

The latest user decision supersedes the current local-only hosting clauses:
public reading mode plus live, event-driven display changes is now required.

## Constraints

- Undiscovered answers and flags must not enter the public bundle.
- Existing PLAY, OPS, and FOCUS modes remain first-class.
- Treat raw command capture as out of scope unless explicitly opt-in.

## Done

Return at most 900 words covering current data flow, missing states, exact files
to change, security risks, and test gaps. Include `file:line` evidence.
