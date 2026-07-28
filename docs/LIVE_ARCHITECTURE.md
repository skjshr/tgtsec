# Live architecture

## Outcome

The public ExamServer lab remains useful without a target. During an exercise,
one paired browser follows sanitized Debian learning state within two seconds,
without exposing the target network or collecting terminal history.

## State model

| State | Source of truth | Browser definition |
| --- | --- | --- |
| `browse` | static public content | No session is implied. Show the world, equipment, rules, and pairing entry. |
| `waiting` | cloud session record | A valid pairing exists, but the Bridge has not uploaded a projection. |
| `live` | latest Bridge snapshot | Show the latest confirmed projection and accept newer revisions. |
| `reconnecting` | last confirmed snapshot | Keep the screen intact when the Bridge heartbeat is stale. |
| `unavailable` | target telemetry status | Automatic detection is down. Cloud manual flag entry stays disabled. |
| `complete` | latest Bridge snapshot | Show the confirmed route to root and the recovery warning. |
| `expired` | session TTL | Remove the live association and return to `browse`. |

Loading, empty facts, errors, zero discoveries, and the 14-flag limit are
orthogonal display states. An old revision must never replace a newer one.

## Trust boundaries

```text
Debian telemetry :8787
        |
        | direct Ethernet, public projection only
        v
Kali Bridge
        |
        | outbound HTTPS, per-session bearer token
        v
Lab Vercel Function + Upstash Redis
        |
        | ExamServer reverse proxy, same-origin cookie + SSE
        v
ExamServer `/lab` browser
```

- Debian has no default route, external DNS, Wi-Fi, NAT, or forwarding.
- Kali may use a separate internet interface, but forwarding and NAT remain off.
- The Bridge is a projection relay, not a TCP tunnel or remote shell.
- Upstash Redis stores only the sanitized public projection, connection timestamps,
  and allowlisted UI actions.
- Raw commands, output, HTTP parameters, credentials, tokens, file contents,
  and flag strings are rejected.

## Module responsibilities

- `apps/lab-guide/src`: renders browse and paired live experiences.
- `apps/lab-guide/cloud/session-service.mjs`: owns session lifecycle and
  monotonic snapshot acceptance.
- `apps/lab-guide/cloud/store.mjs`: owns durable Upstash Redis persistence.
- `apps/lab-guide/api`: adapts Vercel requests to the cloud service.
- ExamServer reverse proxies `/lab` and `/api/lab` to the isolated lab
  deployment, so its React and CSS do not enter the ExamServer bundle.
- `labs/open-world-target/bridge`: reads target SSE, uploads snapshots, and
  relays allowlisted guide actions.
- `labs/open-world-target/telemetry`: remains the only learning state machine.

## Interfaces

### Bridge session

`POST /api/lab/bridge/session`

- Auth: deployment-level Bridge bearer secret.
- Returns: opaque session ID, short-lived pairing code, per-session upload
  token, and expiry.

### Pair browser

`POST /api/lab/session/pair`

- Body: pairing code only.
- Returns: waiting or current public projection.
- Side effect: sets a signed, secure, same-origin, HttpOnly session cookie.

### Upload snapshot

`POST /api/lab/bridge/snapshot`

- Auth: session ID plus per-session upload token.
- Body: public projection and optional acknowledged UI action IDs.
- Rule: lower revisions are rejected; equal revisions are heartbeat-only.

### Read and stream

- `GET /api/lab/session/state`: current paired projection.
- `GET /api/lab/session/events`: SSE snapshots and heartbeats. Clients reconnect
  and reload state after the bounded stream closes.

### Guide actions

- Browser actions are restricted to hypothesis selection and hint unlock.
- `GET /api/lab/bridge/actions` returns the pending allowlisted actions.
- The Bridge applies each action to Debian telemetry and acknowledges it with
  the resulting snapshot.
- Manual flag submission is local-only because flag text must not cross the
  public cloud.

## Rejected alternatives

1. Public browser to Debian private IP: browser local-network permission,
   CORS, mixed-content behavior, and target exposure make it unreliable.
2. Public tunnel into Debian or Kali: it breaks the isolation boundary and
   creates a remote attack surface.
3. Function-memory-only rooms: reconnects can reach another instance and lose
   session state.
4. Full terminal capture: it gathers secrets and turns the teaching aid into
   surveillance.

## Verification gates

- Static browse works with every API unavailable.
- Pairing does not reveal session state without a valid code and signed cookie.
- A sanitized snapshot changes the visible facts, graph, objective, options,
  and recent event list without page reload.
- Replayed or lower revisions cannot roll the browser back.
- Forbidden fields and locked hint bodies are rejected before persistence.
- Bridge loss preserves the last confirmed state and shows reconnecting.
- Desktop and 360x800 pass in PLAY, OPS, and FOCUS with reduced motion.
- The public ExamServer path must pass
  `create 200 → pair 200 → replay 404 → waiting state 200 → snapshot 204 →
  live state 200 → SSE 200` at
  <https://exam-server-one.vercel.app/lab>.
- Physical Kali-to-Debian operation, the dual-boot target, and real Ethernet
  isolation remain separate evidence gates.
