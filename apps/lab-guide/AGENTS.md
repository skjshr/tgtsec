# Product Instructions

This is a finished operational product, not a demo or disposable prototype.
The release target is a repeatable dedicated Debian Boot2Root target plus a
public browser experience opened in Kali Firefox that shows the confirmed
current state, next-step choices, and beginner-safe explanations in real time.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

The user explicitly rejected a subdued single-theme interface. Keep three first-class, runtime-selectable art directions—PLAY (pop game), OPS (hacker operations), and FOCUS (simple editorial)—without reducing them to color skins. All three must preserve the same learning hierarchy, accessibility, state, and beginner-safe language. The visual thesis is a playable operations board, not a generic dashboard.

The site must remain useful without a target or session. Show an honest
public guide, not fixture progress or a connection error. During an exercise,
pair the browser to a Kali Bridge and let sanitized learning events change the
facts, graph, objective, choices, and recent-event strip without a reload. The
Debian target never hosts the public guide and never receives an internet route.

The participant opens the guide in Firefox on Kali. A public Vercel deployment
is the normal transport when Kali has an independent internet connection; the
Kali loopback server is the supported offline transport. Both transports must
render the same learning state and must never expose the target telemetry token
to browser JavaScript.

Do not create accounts, personal profiles, nicknames, recovery codes,
leaderboards, administrator screens, quizzes, or AI chat. The canonical display
is a pure projection of target progress, the learner-selected guidance
configuration, and unlocked hints. Identical canonical state must render the
same categories, silhouettes, current position, choices, and explanation for
every viewer.

EASY is the default. Learners may change guidance during a session without
losing progress. Undiscovered routes expose only a category and an unnamed
silhouette; names, facts, command examples, and answers enter the browser
projection only after their unlock condition. Optional flags never gate
progress.

Keep safety and authorization available at entry and in quiet legal/help
surfaces, but do not repeat “training”, “exercise”, or security disclaimers in
normal mission content. The guide should feel like a playable investigation,
and the Kazekiri target must feel like a separate, living business site.

Build app UI in `src/`. The canonical public surface is ExamServer `/lab`; the
isolated Vercel deployment is an implementation origin only. Keep browser API
calls under `/api/lab`, and verify `npm test`, `npm run typecheck`, and
`npm run build` before handoff.
