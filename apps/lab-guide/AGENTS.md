# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

The user explicitly rejected a subdued single-theme interface. Keep three first-class, runtime-selectable art directions—PLAY (pop game), OPS (hacker operations), and FOCUS (simple editorial)—without reducing them to color skins. All three must preserve the same learning hierarchy, accessibility, state, and beginner-safe language. The visual thesis is a playable operations board, not a generic dashboard.

The public site must remain useful without a target or session. Show an honest
public guide, not fixture progress or a connection error. During an exercise,
pair the browser to a Kali Bridge and let sanitized learning events change the
facts, graph, objective, choices, and recent-event strip without a reload. The
Debian target never hosts the public guide and never receives an internet route.

Build app UI in `src/`. The canonical public surface is ExamServer `/lab`; the
isolated Vercel deployment is an implementation origin only. Keep browser API
calls under `/api/lab`, and verify `npm test`, `npm run typecheck`, and
`npm run build` before handoff.
