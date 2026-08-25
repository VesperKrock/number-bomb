# NB-3B — Online Multiplayer implementation status

Date: 2026-08-25

Implementation branch: `nb-3b-online-implementation`

Authority contract: `docs/architecture/nb-3a-online-multiplayer-supabase-contract.md`

## Status

Online V1 is implemented and verified against the repo-local Supabase stack. The accepted local hot-seat game remains a sibling mode and works without Supabase configuration or network access.

The hosted Supabase project now has reviewed migrations `202608250001` through `202608250008` applied. Migration 008 is the NB-3D1 forward-only private-function ACL repair. The frontend has not been deployed and the controlled hosted business smoke remains intentionally deferred to the resumed NB-3D gate.

## Implemented product flow

```text
HOME
├── CHƠI CÙNG NHAU
│   └── accepted SetupScreen → local GameScreen
└── CHƠI ONLINE
    ├── create room
    └── join / ?room=XXXXX
         ↓
       lobby + QR + Presence + host settings
         ↓
       canonical timed game
         ↓
       synchronized SAFE / victim-or-spectator result
         ↓
       replay / lobby / leave
```

Online supports 2–4 anonymous players, room codes, host migration, lobby kick/leave, configurable 15/20/30-second turns, all three timeout policies, provisional live selection, reconnect, replay and return-to-lobby. There is intentionally no ready state, chat, account/password flow, leaderboard or client-generated bomb.

## Backend foundation

The ordered migration set is complete:

| Migration | Responsibility |
|---|---|
| `202608250001_online_foundation.sql` | enums-as-constraints, public canonical tables, private secrets/idempotency tables |
| `202608250002_online_indexes.sql` | lookup, due-time, membership, action and cleanup indexes |
| `202608250003_online_rls_grants.sql` | RLS, exact safe column grants, private membership/topic helpers |
| `202608250004_online_room_rpcs.sql` | snapshot, touch, create/join/settings/kick/leave/claim-host RPCs |
| `202608250005_online_gameplay_rpcs.sql` | secure random, start/lock/timeout/finalize/replay/lobby RPCs |
| `202608250006_online_realtime_cron.sql` | restricted private channel, due sweep, expiry and anonymous cleanup jobs |
| `202608250007_online_contract_tests.sql` | deployment-safe catalog/security invariants |
| `202608250008_online_private_function_acl_hardening.sql` | close inherited private-function execute rights and whitelist exact Realtime helpers |

Canonical randomness uses rejection sampling over `gen_random_bytes`; SQL `random()` is not used. Every public mutation RPC is `SECURITY DEFINER`, uses an empty `search_path`, qualified identifiers, authenticated-only execute grants, version checks, row locking and UUID request idempotency. Direct client writes are revoked.

The bomb, pending outcome, next bounds/actor and mutation records remain in the `private` schema. `room_players` exposes only safe columns: another player's Auth UID and `nickname_key` are neither granted nor published to Realtime.

Cron runs the same private timeout/finalization engines used by public RPCs. It does not impersonate a player or create per-second database writes. Cleanup covers expired request records, expired room roots and old orphan anonymous Auth users while retaining users referenced by memberships.

## Frontend boundary

`@supabase/supabase-js` is pinned and created lazily under `src/online/`. Missing or invalid environment variables disable only Online; App startup and local mode remain independent.

The dedicated provider/store owns:

- restore-or-create Anonymous Auth identity;
- safe room pointer `{ roomId, roomCode }` only;
- private `room:<ROOM_UUID>` subscribe-then-snapshot bootstrap;
- Postgres Changes gap wake-up plus canonical snapshot repair;
- stale room/game version rejection and no state drop on transient transport errors;
- Presence for connected UI only;
- validated, expiring, non-authoritative provisional selection Broadcast;
- midpoint RTT samples and median of the latest five server-clock offsets;
- deadline/finalization races against canonical timestamps;
- bounded RPC transport retry with the same mutation request UUID;
- an idempotent presentation ledger preventing stale LOCK/SAFE/BOOM replay.

The local reducer and its state types were not made network-aware. Online gameplay adapts the accepted number board, tension, audio, haptics, accessibility and reduced-motion presentation through online-specific DTOs and components.

## Synchronized result profiles

All clients duck the soundscape on canonical `RESOLVING`, schedule against `resolutionAt`, race idempotent finalization and consume only the finalized outcome.

- Victim: accepted full BOOM, ringing/muffled aftermath, full visual impact and `[70,30,120]` haptic.
- Spectator: dedicated per-layer mix (0.45 transient, 0.40 audible body, 0.30 sub, 0.35 tail), no ringing, no aggressive muffled aftermath, reduced flash/shake and `[30,25,45]` haptic.
- Timeout losses use explicit timeout copy. A server random pick that hits the bomb says the system selected it; it never claims the victim manually selected the bomb.

Spectator reduction never changes global master volume. Mute, haptics and reduced-motion preferences remain independent.

## Contract clarification

NB-3A's snapshot DTO did not provide the caller's canonical `room_players.id`, although that ID is required to identify the current actor, victim profile and Presence key without exposing Auth UID. RPC envelopes therefore add:

```ts
selfPlayerId: string | null
```

This is the caller's safe room-player UUID, not `auth.uid()`. It does not expose another player's Auth identity and does not weaken server authority.

## Test coverage and latest local evidence

- Vitest covers local reducer/tension plus nickname normalization, room code/deep links, optional config, server clock median, timeout/result copy, safe storage, version downgrade protection, provisional validation, presentation ledger, RPC retry idempotency and victim/spectator audio coefficients.
- pgTAP covers RLS negative access, private bomb/pending/idempotency secrecy, create/join/full/duplicate nickname, host controls/migration, exact range updates, BOOM reveal, 2/3/4 rotation, all timeout policies/strikes, idempotency/version/races, delay bounds, Cron sweep and cleanup guards.
- Playwright uses isolated browser contexts for create/join/lobby sync, 2-player SAFE/BOOM/reconnect/replay, 4-player turn restrictions/rotation, Cron SELF_DESTRUCT after reload, provisional selection, synchronized result-onset target, mobile overflow, reduced motion and victim/spectator audio/haptics.
- Existing local hot-seat Playwright tests remain part of the full suite.

Final clean run on 2026-08-25:

- `npm run typecheck`: PASS.
- `npm run lint`: PASS with no warnings.
- `npm run test:unit`: 97/97 PASS across 19 files.
- `npm run test:db`: 98/98 pgTAP assertions PASS across 4 files.
- `npx supabase db lint --local --level error`: no schema errors.
- `npm run test:e2e`: 36/36 Playwright tests PASS, including all accepted local regression tests and deterministic lost-event recovery.
- `npm run build`: PASS; Online remains a separate lazy chunk.
- Repeatable visual QA: PASS at 1440×900, 1366×768, 390×844 and 440×956; no horizontal overflow, mobile number-field-only scrolling, reachable dock, desktop viewport fit and reduced-motion result checked. The existing local visual suite also completed successfully.

## Hosted project state and handoff

The hosted project ref `cmjhzbhxpqqhamksbkxk` has an exact migration ledger from `202608250001` through `202608250008`. Post-008 catalog verification proves all private routines deny `PUBLIC` and `anon`, `authenticated` can execute only the three Realtime helpers, all 14 public RPC grants remain intact, all seven Number Bomb tables retain RLS, both private tables retain zero client table privileges, and the three Cron jobs remain active. All seven Number Bomb business tables were still empty after the ACL deployment.

Remaining release steps are deliberately separate:

1. Resume the controlled hosted two-device smoke: create, join, SAFE, timeout, BOOM, reload and replay.
2. Add/verify GitHub Actions repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` before frontend deployment.
3. Inspect Auth rate limits/CAPTCHA policy before public traffic.
4. Review, push, merge and deploy only through explicitly authorized later gates.

The checked-in Pages workflow already passes exactly those two browser-safe variables to `npm run build`; `.env.local` remains ignored.

## Operational risks / remaining external gates

- Controlled hosted business smoke, GitHub variable verification, branch review/merge and frontend deployment remain unapplied here.
- Anonymous public rooms can be abused; configure Supabase Auth rate limits and CAPTCHA according to expected traffic.
- Presence is deliberately advisory. Database membership, versions, deadlines and RPC validation remain authoritative when Presence is stale or spoofed.
- Internet latency can exceed the ≤200 ms local/test result-onset target. Late clients present canonical results immediately and do not replay stale suspense.
- Supabase plan/extension changes may affect one-second `pg_cron`; verify the installed jobs and monitor failures after hosted migration.

No service-role key, database password, JWT secret or admin credential belongs in this repository or any `VITE_*` variable.
