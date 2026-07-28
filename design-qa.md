# Design QA — ExamServer Open World

Date: 2026-07-28

## Design intent

The interface follows one progressive-disclosure rule: raise cognitive load only
after the learner asks for more.

- Always visible: the current screen, current objective, world map or hypothesis
  task, and the primary action.
- Available but closed: live pairing, confirmed facts, investigations or hints,
  recent events, and theme choices.
- Every hidden area has a labelled pull with a useful count or current value.
- Pulling one label opens one surface. Opening another replaces it.
- Live events update the objective, map, and pull counts without opening a
  surface on the learner's behalf.

Desktop uses a side drawer. Narrow screens use a bottom sheet. Drawer contents
are conditionally mounted, so closed information is absent from the tab order
and accessibility tree rather than merely covered.

## Visual language

The same disclosure hierarchy is authored in three distinct themes:

- PLAY — hard black borders, cyan and yellow signals, playful mission-map
  geometry.
- OPS — midnight field, phosphor routes, amber selection, restrained mono
  metadata.
- FOCUS — warm paper, thin rules, vermilion and cobalt state language,
  editorial typography.

Theme selection itself is folded under the labelled `見た目` control. Changing
theme does not reset the current map, consultation, or live state.

Evidence:

- `docs/qa/live/disclosure-public-play-1366x768.png`
- `docs/qa/live/disclosure-public-ops-1366x768.png`
- `docs/qa/live/disclosure-public-focus-1366x768.png`
- `docs/qa/live/disclosure-consultation-focus-1366x768.png`

## Initial-load verification

Verified at `1366×768` in Chromium:

- The world map owns the available width; the previous left, right, and bottom
  information rails are not visible.
- The current objective and four labelled pulls are visible.
- Pairing input, facts, investigations, and event history are absent until
  requested.
- Public browse mode makes no API request.
- No horizontal overflow and no console errors.

Evidence:

- `docs/qa/live/disclosure-public-play-1366x768.png`

## On-request disclosure

Verified at `1366×768` in Chromium and `1280×720` in Firefox:

- Pulling `確定した事実` opens one `480px` side drawer.
- The close control receives initial focus.
- `Tab` and `Shift+Tab` stay within the drawer.
- `Escape` and the backdrop close it.
- Closing restores focus to the pull that opened it.
- Body scrolling is locked only while the drawer is open.

Evidence:

- `docs/qa/live/disclosure-facts-drawer-play-1366x768.png`
- `docs/qa/live/disclosure-firefox-facts-1280x720.png`

## Narrow-screen verification

Verified at `360×800` in Chromium and Firefox:

- Document width equals viewport width; there is no horizontal overflow.
- All four pull labels remain visible as a `2×2` group before the map.
- The initial screen does not vertically stack every information panel.
- Pairing and hints open as bottom sheets, not full-page replacements.
- The pairing sheet contains only pairing controls.
- The hint sheet contains the three progressive hint levels.
- `Escape` closes the sheet and restores focus to its pull.

Evidence:

- `docs/qa/live/disclosure-public-play-360x800.png`
- `docs/qa/live/disclosure-pairing-sheet-play-360x800.png`
- `docs/qa/live/disclosure-consultation-play-360x800.png`
- `docs/qa/live/disclosure-hints-sheet-play-360x800.png`
- `docs/qa/live/disclosure-firefox-pairing-360x800.png`

## Live-state verification

Verified with deterministic network fixtures:

- Entering a valid pairing code closes the pairing drawer, removes its pull,
  exposes the end-session control, and changes the connection marker to
  `paired`.
- A later telemetry event changes the heading from `標的との接続を確かめる`
  to `Webの入口を発見`.
- Fact and event counts move from `0` to `1`.
- The browser does not reload.
- No facts or event drawer opens automatically.
- No console errors or horizontal overflow.

Evidence:

- `docs/qa/live/disclosure-pairing-to-live-1366x768.png`
- `docs/qa/live/disclosure-live-transition-after-1366x768.png`

## Automated verification

- Repository contracts: 4/4 passed.
- World graph: 3 entrances, 3 footholds, 3 root paths, 14 flags, all 9 route
  combinations.
- Telemetry: 42 passed, 1 Linux-only skip.
- Bridge: 19/19 passed.
- Platform: 52 passed, 2 Linux/WSL-only skips.
- Operator: 7/7 passed.
- Guide Vitest: 27/27 passed.
- Guide Node suites: 19/19 passed.
- TypeScript: passed.
- Vite production build: passed.
- Chromium and Firefox console errors: none.

## External verification boundary

The repository and browser implementation pass. The canonical production
surface is <https://exam-server-one.vercel.app/lab>; the former standalone
Sites surface is retired. Production is accepted only after the `/api/lab`
smoke passes: `create 200 → pair 200 → replay 404 → waiting state 200 →
snapshot 204 → live state 200 → SSE 200`.

The physical Kali-to-Debian connection, dual-boot installation, and all
physical recovery gates remain **NOT RUN** until tested on the designated
hardware.

final result: passed
