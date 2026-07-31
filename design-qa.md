# Design QA — ExamServer Open World

Date: 2026-07-29

## Design intent

The initial screen is one mission stage, not a stack of dashboard bands.
The learner reads it in one direction:

`mission → objective → route → selected place → action`

Only the mission, objective, route, selected place, and primary action stay
visible. Pairing, facts, investigations, hints, events, and theme controls stay
behind one labelled tool pull or the single application menu until requested.

The selected place owns `次の一手`. On desktop the action uses a non-scaling
React Flow toolbar attached to the node. On mobile it is part of the selected
row in a single vertical route.

## Visual language

- PLAY — warm paper, hard black ink, cyan routes, and yellow selection.
- OPS — midnight field, restrained mint traces, and amber selection.
- FOCUS — editorial paper, thin rules, red selection, and blue utility marks.

All three themes preserve the same order, state labels, primary action, keyboard
contract, and beginner-safe language. Mission-specific colour, type, geometry,
and alpha values are registered in `DESIGN.md` version 2.3 and consumed through
semantic CSS variables.

## Desktop verification

Verified at an exact `1280×720` raster:

- Browse node union occupies `95.3%` of the route width.
- Live node union occupies `79.2%` of the route width.
- The selected-node action is approximately `46px` high and does not scale with
  the graph.
- The route has no outer card or empty framing rectangle.
- No horizontal overflow occurs in PLAY, OPS, or FOCUS.

Evidence:

- `docs/qa/mission-stage/play-browse-1280x720.png`
- `docs/qa/mission-stage/ops-live-1280x720.png`
- `docs/qa/mission-stage/focus-browse-1280x720.png`

## Mobile verification

Verified at `375×844`:

- Browse and live show the mission, full objective, first route places,
  selected place, and approximately `46px` primary action in the first view.
- Browse action bottom is approximately `449px`; live action bottom is
  approximately `375px`.
- The graph becomes one route timeline rather than a card list.
- Only the route work area scrolls when the route is longer than the screen.
- No horizontal overflow occurs in PLAY, OPS, or FOCUS.

Evidence:

- `docs/qa/mission-stage/play-browse-375x844.png`
- `docs/qa/mission-stage/ops-live-375x844.png`
- `docs/qa/mission-stage/focus-browse-375x844.png`

## Consultation verification

The consultation screen remains one decision surface with one selected
hypothesis, one explanation, and one primary action. Its supporting tools stay
closed until requested. All three themes were checked at both target sizes with
no horizontal overflow.

Evidence:

- `docs/qa/mission-stage/play-consultation-1280x720.png`
- `docs/qa/mission-stage/ops-consultation-375x844.png`
- `docs/qa/mission-stage/focus-consultation-1280x720.png`

## Edge-state verification

Empty, loading, reconnecting, unavailable, and complete states were rendered at
both target sizes.

- Empty shows one honest starting place and stops the route spine after it.
- Loading preserves the last useful map while announcing the update.
- Reconnecting and unavailable notices contain their refresh action without
  overlapping the mission heading.
- Long objectives wrap to two lines instead of being truncated.
- Complete restores a compact, separated route summary and keeps all fourteen
  places available for review.

Evidence:

- `docs/qa/mission-stage/play-empty-375x844.png`
- `docs/qa/mission-stage/play-loading-1280x720.png`
- `docs/qa/mission-stage/play-reconnecting-375x844.png`
- `docs/qa/mission-stage/play-unavailable-375x844.png`
- `docs/qa/mission-stage/play-success-1280x720.png`

## Interaction and accessibility

- Discovered desktop places are native buttons with `aria-pressed`.
- React Flow wrappers and edges are not keyboard stops.
- The selected action is not nested inside the place button.
- Mobile place selection remains a native button.
- Tool drawers keep the existing Escape, focus trap, and focus-return contract.
- Reduced motion removes route animation without removing state changes.
- Undiscovered labels, locked hint bodies, credentials, commands, and flags are
  not exposed by the browser projection.

## Automated verification

- Repository contracts: 5/5 passed.
- World graph: 3 entrances, 3 footholds, 3 root paths, 13 flags, and all 9
  viable combinations.
- Telemetry: 42 passed, 1 Linux-only skip.
- Bridge: 19/19 passed.
- Platform: 54 passed, 2 Linux/WSL-only skips.
- Operator: 7/7 passed.
- Guide Vitest: 28/28 passed.
- Guide Node suites: 19/19 passed.
- TypeScript: passed.
- Vite production build: passed.
- `git diff --check`: passed.

## External verification boundary

Repository, automated, and local browser gates pass.

- Canonical ExamServer production:
  `https://exam-server-one.vercel.app/lab`
  - Vercel reported the `main` deployment for `43ee434a4a4bda202bc1d573f8d964237e0e4b3a`
    as complete.
  - The deployed browser DOM contains the heading
    `風切モータースへ接続する` and `.mission-stage`.
  - The retired `.map-stage` surface is absent.
- Owner-only Sites production:
  `https://examserver-open-world-lab.shkjhr.chatgpt.site`
  - Saved version 5 was built from and deployed with source commit
    `266403ead81fbec99f3cdf0706204677d1192838`.
  - The deployment finished with `succeeded`.
  - Authorized production requests returned 200 for the root HTML, main
    JavaScript, theme CSS, and browse projection chunk.
  - The deployed HTML uses root `/assets/` URLs rather than the invalid
    `/lab/assets/` URLs found and corrected during release verification.
  - The deployed chunks contain `mission-stage` and
    `風切モータースへ接続する`.

GitHub Actions did not execute the test job. GitHub stopped it before the first
step because of the account billing or spending-limit state. This is recorded as
an external CI infrastructure exception, not a passing CI run; the complete
local `npm run check` result above remains the executed test evidence.

The physical Kali-to-Debian connection, dedicated Debian installation, recovery image,
and hardware isolation gates remain **NOT RUN** until tested on the designated
machines.

final result: production pass; GitHub-hosted CI not executed; physical hardware
NOT RUN
