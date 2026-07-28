# Work Order: Kali bridge and telemetry audit

## Goal

Report how the existing Debian telemetry can be relayed through a Kali-side
outbound bridge to a Vercel-hosted guide with reliable session state.

## Non-goals

- Do not edit files.
- Do not expose Debian directly to the internet.
- Do not add remote command execution.
- Do not collect arbitrary shell history.

## Inputs and binding contracts

- `PROJECT_CONSTITUTION.md`
- `TASK_CONTRACT.md`
- `labs/open-world-target/telemetry`
- `labs/open-world-target/platform`
- `apps/lab-guide/src/types.ts`
- `apps/lab-guide/src/api.ts`

The latest user decision supersedes the current no-cloud telemetry clause.

## Constraints

- Debian remains reachable only over the direct Ethernet link.
- Kali initiates all cloud connections.
- Events remain allowlisted, authenticated, ordered, and replay-resistant.
- The public projection must not contain undiscovered secrets.

## Done

Return at most 900 words with the proposed protocol, trust boundaries, exact
reuse points, missing implementation, and tests. Include `file:line` evidence.
