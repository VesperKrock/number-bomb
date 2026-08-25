# NB-3C3 missed-event anti-entropy

Realtime Postgres Changes are a low-latency wake path, not a delivery guarantee or
canonical authority. While an active room is visible, each client serially requests
an authoritative room snapshot on a phase-aware cadence. Realtime, Presence,
visibility, reconnect, heartbeat responses, and deadline watchdog RPCs can wake the
same serialized recovery coordinator; concurrent wakes coalesce into one trailing
pass. Independent room/game version reconciliation prevents an older response from
overwriting newer canonical state.

## Production convergence bounds

| Canonical state | Reconciliation cadence | Maximum target bound |
| --- | ---: | ---: |
| Lobby roster/settings | 3 s | 4 s |
| `PLAYING_TURN` | 3 s | 4 s |
| `RESOLVING` | 1 s | 2 s |
| `FINISHED` | 5 s | 6 s |

The bound includes one cadence plus ordinary request/application headroom. A
`RESOLVING` client also races the idempotent finalization RPC at the server deadline.
The 15-second connection touch remains a slower independent authoritative repair
path. At four clients, steady-state snapshot ceilings are 80 requests/minute per
room in lobby/playing, 48 in finished, and briefly 240 while resolving; resolving is
normally shorter than two seconds. Requests are serialized per client, so a slow
network cannot create overlapping poll storms.

Presence is UI-only. Presence sync/join/leave merely wakes a canonical snapshot and
never adds/removes a roster member itself. A recovered settled SAFE/BOOM older than
its live presentation window updates canonical state without fabricating old audio,
haptics, suspense, or impact animation. Duplicate/out-of-order events remain safe
because version reconciliation is monotonic and presentation keys are consumed once.
