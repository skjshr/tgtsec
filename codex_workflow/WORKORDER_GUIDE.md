# Work Order: Lab Guide Frontend

## Bound contracts

- `PROJECT_CONSTITUTION.md`
- `DESIGN.md`
- `TASK_CONTRACT.md`
- `docs/design/exploration-map.png`
- `docs/design/situation-consultation.png`

## Goal

Implement the accepted exploration-map and situation-consultation designs as a faithful, responsive, interactive React application under `apps/lab-guide`.

## Non-goals

- Do not edit root contracts, README, target world, telemetry, platform, operator, or legacy lab.
- Do not invent new screens, gamification, AI chat, or cyberpunk decoration.
- Do not embed unrevealed world answers in the client.

## Constraints

- Follow the Product Design image-to-code skill and existing ExamServer tokens.
- Use a real icon library; no inline SVG, CSS drawings, emoji, or placeholder art.
- Core tabs, hypothesis selection, hints, map selection, reconnect/fallback, and end-session confirmation must work.
- API client uses relative URLs and supports deterministic fixture mode for browser QA.
- Match 1366×768 references; support 1280×720 and 360px without horizontal overflow.

## Done

- Unit/component tests, typecheck, and production build pass.
- Both primary modes and required interaction states are implemented.
- No console errors, inaccessible controls, or static core controls remain.
- Report exact changed paths and verification commands.

## Report

Return at most 12 bullets: implementation, tests, design deviations, and blockers.
