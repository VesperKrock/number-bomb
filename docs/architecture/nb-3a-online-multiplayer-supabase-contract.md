# NB-3A — Online Multiplayer Architecture + Supabase Contract

Status: **PASS — design only**  
Date: 2026-08-25  
Implementation target: NB-3B

This document is the implementation contract for BOM SỐ Online V1. It does not
create a Supabase client, database object, room UI, or online gameplay path.

## 1. Baseline audit and boundaries

At audit time:

```text
repository: E:/number-bomb
HEAD: ab8002b389952219ce5931e9f2b003ea8f0fc5f5
commit: ab8002b Build Number Bomb V1
remote: https://github.com/VesperKrock/number-bomb.git
worktree before NB-3A:
 M vite.config.ts
?? .github/
?? prompts/number-bomb/25082026/nb-3a-online-multiplayer-supabase-contract.md
```

The pre-existing changes above belong to the user and are not part of NB-3A.

### Existing architecture that NB-3B must preserve

- `src/App.tsx` owns the local session boundary. Online mode must be added above
  that boundary as a sibling entry path; it must not make local setup depend on
  authentication, network, or environment configuration.
- `src/game/reducer.ts` remains the sole authority for local hot-seat play. Its
  `playing → resolving → finished` state and random injection seam remain
  unchanged.
- `src/game/selectors.ts` is the reference for inclusive range semantics:
  `candidateCount = upper - lower + 1`, and a valid pick is an integer in those
  inclusive bounds.
- `src/presentation/tension.ts` is the shared candidate-count tension model.
  Its five timing ranges are reused by the online server contract.
- `GameScreen`, `NumberBoard`, the 641 px desktop/mobile split, the focused
  candidate field, audio lifecycle, mute preference, reduced-motion behavior,
  and haptics preference are accepted V1 presentation assets.
- `GameAudio.playExplosion` is the accepted full victim BOOM. Online adds a
  result profile; it must not fork or weaken the local mix.
- Existing Playwright seams (`VITE_E2E_BOMB_NUMBER`, audio diagnostics, vibration
  mock, multi-viewport checks) are local-mode-only. A production online client
  must never send or select the bomb.
- `.env.example` already declares `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`. `vite.config.ts` currently declares the
  GitHub Pages base `/number-bomb/`.

### Authority boundary

```text
LOCAL / CHƠI CÙNG NHAU
  existing TypeScript reducer is authoritative

ONLINE / CHƠI ONLINE
  Postgres RPC transactions are authoritative

SHARED PRESENTATION
  inclusive-range formatting, candidate selectors, tension tiers/timings,
  focused NumberBoard, accessibility, audio preferences, haptics preferences
```

TypeScript and SQL cannot literally execute the same reducer. NB-3B therefore
must run the same table-driven rule vectors against both implementations. The
vectors include the accepted `bomb=81` progression
`1–99 → pick 58 → 59–99 → pick 76 → 77–99 → pick 87 → 77–86` and all current
reducer boundary tests.

## 2. Product and UX contract

### 2.1 Entry flow

```text
HOME
  ├─ CHƠI CÙNG NHAU → existing SetupScreen → existing local game
  └─ CHƠI ONLINE → ONLINE ENTRY
                         ├─ TẠO PHÒNG
                         └─ THAM GIA
                              ↓
                            LOBBY
                              ↓ host starts
                     PLAYING / RESOLVING
                              ↓
                           FINISHED
                     ├─ CHƠI LẠI
                     ├─ VỀ PHÒNG CHỜ
                     └─ RỜI PHÒNG
```

Local mode remains the first, equally prominent option and works when both
Supabase variables are absent. Online is lazily initialized only after the user
chooses it.

### 2.2 Online entry and identity

- Online V1 supports 2–4 durable room members, one device per member, and no
  spectator seats.
- On first online entry with no existing session, call `signInAnonymously()`.
  Keep the resulting session; do not sign out after a match.
- `auth.uid()` is identity. Nickname, room code, local storage, and Presence
  metadata are never identity.
- Normalize nickname by trimming leading/trailing whitespace and collapsing
  internal whitespace runs to one ASCII space. Accept 1–20 Unicode characters
  after normalization. Reject control characters.
- Duplicate nickname keys (`lower(normalized_nickname)` under the database
  collation) in one active room are rejected with `NICKNAME_TAKEN`; do not add
  suffixes. This keeps turn and live-selection copy unambiguous.
- Clearing browser data, explicitly signing out, or moving to another device
  loses the anonymous identity and therefore cannot reclaim that seat. That is
  an explicit Anonymous Auth limitation, not a room-code recovery flow.

### 2.3 Room code and QR

```text
length: 5
alphabet: 23456789ABCDEFGHJKMNPQRSTUVWXYZ
normalization: remove surrounding whitespace, uppercase
validation regex: ^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$
```

The alphabet has 31 symbols and 28,629,151 possible codes. `rooms.code` has a
unique constraint. `create_room` generates a code from server random bytes and
retries a unique violation up to eight times in the same request; exhaustion
returns `ROOM_CODE_EXHAUSTED`.

All centralized random choices use one `private.secure_random_int(min,max)`
helper backed by `gen_random_bytes(4)` and uint32 rejection sampling (the same
anti-modulo-bias shape as the accepted TypeScript helper). Room-code characters,
bomb, random starter, timeout pick, and integer resolution milliseconds all use
that helper. No gameplay path calls SQL `random()` or accepts a random result
from a client.

The canonical QR/deep link is computed from the deployed app, never hardcoded:

```ts
new URL(`?room=${code}`, new URL(import.meta.env.BASE_URL, window.location.origin))
```

For the current Pages base this yields
`https://<host>/number-bomb/?room=K7X4P`. The QR contains only that URL. Opening
it selects Online Join, prefills the normalized code, and asks for nickname.

### 2.4 Lobby

- There is **no READY state**. Joining the lobby is consent to play; another
  ready toggle adds state without solving a V1 problem.
- The host can start with 2–4 active members. The host UI also requires 2–4
  members currently visible in Presence. The RPC validates durable active
  membership, because ephemeral Presence cannot be database truth.
- The host can change typed room settings, start, kick a non-host member while
  in `LOBBY`, replay a finished round with the same settings, or return a
  finished room to `LOBBY` to edit settings.
- Settings are immutable while `rooms.status = PLAYING`.
- Lobby seats are 1–4. A vacated lobby seat may be reused. A started round
  snapshots seats into `game_players`, so later membership changes cannot
  reorder that round.

### 2.5 Leave, kick, and host migration

- Lobby leave marks the membership `LEFT` rather than deleting history. The
  same `auth.uid()` may rejoin that still-open lobby and gets the lowest free
  seat. A kicked identity cannot rejoin that room.
- Kick is lobby-only, target cannot be the host, and records `KICKED`.
- During an active round, leave marks both durable membership and the round
  participant `LEFT`, but does not rewrite the round order. The current timer
  continues. If/when the departed seat becomes current, the configured timeout
  policy resolves it. There is no mid-round kick.
- Explicit host leave immediately transfers host to the lowest-seat `ACTIVE`
  member in the same transaction.
- Every connected client calls naturally idempotent `touch_connection` every
  15 seconds while the room channel is subscribed. If the host has no durable
  heartbeat for 45 seconds, any active member may call `claim_host`; under the
  room row lock, the server chooses the lowest-seat active member seen within
  the last 45 seconds. This is the exact disconnect host-migration rule.
- Presence gives immediate “mất kết nối” UI. The 45-second durable lease avoids
  transferring host on a brief mobile network handoff. Host status has no
  gameplay advantage.
- If no active member remains, the room becomes `CLOSED` and expires in one
  hour. Its former host ID remains as historical data until cleanup.

## 3. Room settings and timers

| Setting | Type and database rule | Default | UI |
|---|---|---:|---|
| `max_players` | integer, 2–4 | 4 | 2 / 3 / 4 |
| `turn_timeout_seconds` | integer, 15–30 inclusive | 20 | 15s / 20s / 30s plus constrained custom input |
| `timeout_policy` | stable values below | `RANDOM_PICK_WITH_2_STRIKES` | three concise policy cards |
| `starter_mode` | `FIRST_SEAT` or `RANDOM` | `FIRST_SEAT` | first seat / random |
| `show_live_selection` | boolean | true | on/off |

The timeout policy values are exactly:

```text
SELF_DESTRUCT
RANDOM_PICK
RANDOM_PICK_WITH_2_STRIKES
```

### 3.1 Canonical clock

- `room_games.turn_started_at` and `turn_deadline_at` are server timestamps.
  There are no per-second database writes.
- All snapshot and mutation responses include `server_now`. The client records
  request send/receive times, estimates offset as
  `server_now - midpoint(client_send, client_receive)`, and uses the median of
  the latest five samples. Resample every 60 seconds, on visibility return, and
  after reconnect.
- Displayed remaining time is
  `max(0, ceil((deadline - estimatedServerNow) / 1000))`. Database
  `clock_timestamp()` alone decides whether the deadline passed.
- A manual lock is accepted only when database time is strictly before the
  deadline. At equality, timeout wins.
- The final-five-second warning is a separate presentation pressure overlay.
  It does not alter candidate tension, resolution timing, or BOOM gain.

### 3.2 Timeout behavior

**SELF_DESTRUCT:** at deadline, enter `RESOLVING` with no selected number and a
private `TIMEOUT_LOSS`; after synchronized resolution, finish with
`TIMEOUT_SELF_DESTRUCT`. This is logged as timeout, never as a bomb hit.

**RANDOM_PICK:** choose uniformly from every integer in the current inclusive
range, on the server. Enter normal `RESOLVING` with origin `TIMEOUT_RANDOM`. A
safe number shrinks the range and rotates; the bomb produces normal `BOOM` and
`BOMB_HIT`.

**RANDOM_PICK_WITH_2_STRIKES:** strikes live on `game_players` and reset because
each round creates new rows. On the first timeout, set that player's strike to
1 and perform one server `RANDOM_PICK`; if it hits the bomb, finish normally. On
the same player's second timeout, do not pick a number: enter `RESOLVING` and
finish with `TIMEOUT_STRIKES_EXCEEDED`.

### 3.3 Timeout and finalization schedulers

Each connected member schedules an idempotent timeout RPC against the canonical
deadline. Calls race safely; they do not decide the outcome. A single Supabase
Cron job also calls `private.sweep_due_online_games(100)` every second as a
backstop for background-tab throttling or all clients disconnecting. The sweep
uses ordered batches and `FOR UPDATE SKIP LOCKED`; it resolves due turns and
finalizes due presentations with the same private transactional helpers as the
public RPC wrappers.

The one-second Cron is not the normal 450–1000 ms presentation clock. Connected
clients call `finalize_resolution` at `resolution_at`; Cron is recovery. If every
client is gone, a late canonical result has no visible synchronization cost.

Room cleanup runs as a separate hourly Cron job. Both jobs are database jobs;
Online V1 does not need a permanent Node process or Edge Function.

## 4. Authoritative state machine

There is no `room_games` row in a lobby.

| From | Trigger and authority | To | Atomic effect |
|---|---|---|---|
| `rooms.LOBBY` | host `start_game`; 2–4 active members | `rooms.PLAYING` + `game.PLAYING_TURN` | snapshot roster, generate bomb/starter, start deadline |
| `PLAYING_TURN` | current player valid `lock_number` before deadline | `RESOLVING` | choose result privately, expose actor/number/origin and one `resolution_at` |
| `PLAYING_TURN` | due timeout random policy/first strike | `RESOLVING` | server picks valid number and privately resolves it |
| `PLAYING_TURN` | due timeout loss policy/second strike | `RESOLVING` | no number; store private timeout loss |
| `RESOLVING` | member/Cron finalizes at or after `resolution_at`, outcome SAFE | `PLAYING_TURN` | commit new bounds, rotate, schedule next turn |
| `RESOLVING` | member/Cron finalizes BOOM/timeout loss | `FINISHED` + `rooms.FINISHED` | reveal bomb, record loser and exact reason |
| `FINISHED` | host `restart_game` | new round `PLAYING_TURN` | retain old game/history; create new secret/roster/strikes |
| `FINISHED` | host `return_to_lobby` | `rooms.LOBBY` | retain history; allow membership/settings changes |
| any room status | last active member leaves | `rooms.CLOSED` | expire in one hour |

Every accepted canonical game mutation increments `room_games.version` exactly
once. Room/lobby mutations increment `rooms.version`. A SAFE finalization sets
the next `turn_started_at` to finalization database time plus the existing
520 ms SAFE feedback window; `turn_deadline_at` is measured from that future
start. `lock_number` rejects calls before `turn_started_at`, so synchronized SAFE
presentation never consumes the next player's timer.

## 5. Database contract

### 5.1 Value strategy

Use `text` plus named `CHECK` constraints rather than Postgres enum types. These
wire values are still closed enums, but named checks are easier to extend or
replace transactionally in later product migrations and generate as literal
TypeScript unions without irreversible enum ordering concerns.

Closed values:

```text
room_status: LOBBY | PLAYING | FINISHED | CLOSED
membership_status: ACTIVE | LEFT | KICKED
game_phase: PLAYING_TURN | RESOLVING | FINISHED
starter_mode: FIRST_SEAT | RANDOM
timeout_policy: SELF_DESTRUCT | RANDOM_PICK | RANDOM_PICK_WITH_2_STRIKES
pending_origin: PLAYER_LOCK | TIMEOUT_RANDOM | TIMEOUT_SELF_DESTRUCT |
                TIMEOUT_STRIKES_EXCEEDED
game_outcome: SAFE | BOOM | TIMEOUT_LOSS
finish_reason: BOMB_HIT | TIMEOUT_SELF_DESTRUCT | TIMEOUT_STRIKES_EXCEEDED
action_type: GAME_STARTED | NUMBER_LOCKED | TURN_TIMEOUT |
             RESOLUTION_FINALIZED
action_origin: HOST_START | PLAYER_LOCK | TIMEOUT_RANDOM |
               TIMEOUT_FIRST_STRIKE | TIMEOUT_SELF_DESTRUCT |
               TIMEOUT_STRIKES_EXCEEDED | FINALIZE
participation_status: ACTIVE | LEFT
```

### 5.2 `public.rooms`

| Column | Type | Null/default | Constraint and purpose |
|---|---|---|---|
| `id` | `uuid` | not null / `gen_random_uuid()` | primary key; private channel suffix |
| `code` | `text` | not null | unique; exact five-character regex |
| `status` | `text` | not null / `LOBBY` | named room-status check |
| `host_player_id` | `uuid` | not null | deferred composite FK `(id, host_player_id) → room_players(room_id,id)`, `ON DELETE NO ACTION` |
| `max_players` | `smallint` | not null / 4 | check 2–4 |
| `turn_timeout_seconds` | `smallint` | not null / 20 | check 15–30 |
| `timeout_policy` | `text` | not null / `RANDOM_PICK_WITH_2_STRIKES` | closed timeout check |
| `starter_mode` | `text` | not null / `FIRST_SEAT` | closed starter check |
| `show_live_selection` | `boolean` | not null / true | privacy setting |
| `version` | `bigint` | not null / 1 | positive monotonic lobby/config version |
| `last_activity_at` | `timestamptz` | not null / `clock_timestamp()` | canonical room activity |
| `expires_at` | `timestamptz` | not null / now + 24h | cleanup boundary |
| `created_at` | `timestamptz` | not null / `clock_timestamp()` | audit |
| `updated_at` | `timestamptz` | not null / `clock_timestamp()` | audit |

### 5.3 `public.room_players`

| Column | Type | Null/default | Constraint and purpose |
|---|---|---|---|
| `id` | `uuid` | not null / `gen_random_uuid()` | primary key; durable player identity |
| `room_id` | `uuid` | not null | FK `rooms(id) ON DELETE CASCADE` |
| `auth_user_id` | `uuid` | not null | FK `auth.users(id) ON DELETE RESTRICT`; never accepted from client input |
| `nickname` | `text` | not null | normalized display name; length 1–20; no POSIX control chars |
| `nickname_key` | `text` | not null | server-computed lowercase normalized nickname |
| `seat` | `smallint` | not null | check 1–4 |
| `membership_status` | `text` | not null / `ACTIVE` | closed membership check |
| `joined_at` | `timestamptz` | not null / now | audit |
| `last_seen_at` | `timestamptz` | not null / now | 15-second durable heartbeat/host lease only |
| `left_at` | `timestamptz` | nullable | set for LEFT/KICKED, cleared on allowed lobby rejoin |

Constraints: primary key `id`; unique `(room_id,id)` for composite FKs; unique
`(room_id,auth_user_id)` across all statuses; partial unique indexes on
`(room_id,seat)` and `(room_id,nickname_key)` where status is `ACTIVE`.

### 5.4 `public.room_games`

| Column | Type | Null/default | Constraint and purpose |
|---|---|---|---|
| `id` | `uuid` | not null / `gen_random_uuid()` | primary key |
| `room_id` | `uuid` | not null | FK `rooms(id) ON DELETE CASCADE` |
| `round_number` | `integer` | not null | positive; unique per room |
| `phase` | `text` | not null / `PLAYING_TURN` | closed game-phase check |
| `lower_candidate` | `smallint` | not null / 1 | 1–99 |
| `upper_candidate` | `smallint` | not null / 99 | 1–99 and `lower <= upper` |
| `current_player_id` | `uuid` | not null | deferred FK to this game's `game_players` row |
| `starting_player_id` | `uuid` | not null | deferred FK to this game's `game_players` row |
| `turn_number` | `integer` | not null / 1 | positive display/action turn |
| `version` | `bigint` | not null / 1 | positive canonical game version |
| `turn_started_at` | `timestamptz` | not null | server start; may be up to 520 ms in the future after SAFE |
| `turn_deadline_at` | `timestamptz` | not null | greater than `turn_started_at` by configured seconds |
| `pending_locked_number` | `smallint` | nullable | public locked number only during RESOLVING; inside current bounds |
| `pending_actor_player_id` | `uuid` | nullable | deferred FK to game participant |
| `pending_action_origin` | `text` | nullable | closed pending-origin check |
| `resolution_at` | `timestamptz` | nullable | shared reveal wall clock; populated only while RESOLVING |
| `last_locked_number` | `smallint` | nullable | most recently finalized number; null for timeout loss |
| `last_actor_player_id` | `uuid` | nullable | last finalized actor |
| `last_action_origin` | `text` | nullable | last finalized origin |
| `last_outcome` | `text` | nullable | SAFE/BOOM/TIMEOUT_LOSS, written only at finalization |
| `loser_player_id` | `uuid` | nullable | populated only on FINISHED |
| `finish_reason` | `text` | nullable | exact closed finish reason, only on FINISHED |
| `revealed_bomb_number` | `smallint` | nullable | copied from private storage only on FINISHED |
| `created_at` | `timestamptz` | not null / now | audit |
| `updated_at` | `timestamptz` | not null / now | result freshness/reconnect |
| `finished_at` | `timestamptz` | nullable | only on FINISHED |

Constraints: unique `(room_id,round_number)` and `(id,room_id)`; one partial
unique index on `room_id WHERE phase <> 'FINISHED'`; conditional check requiring
the pending actor/origin/resolution during RESOLVING and clearing them otherwise;
pending number required for `PLAYER_LOCK`/`TIMEOUT_RANDOM` and forbidden for
timeout-loss origins; finish fields and revealed bomb required exactly when
FINISHED. Candidate count is derived, never stored.

### 5.5 `public.game_players`

| Column | Type | Null/default | Constraint and purpose |
|---|---|---|---|
| `game_id` | `uuid` | not null | composite FK with room to `room_games`, cascade on room/game cleanup |
| `room_id` | `uuid` | not null | denormalized FK key for RLS/filtering and room consistency |
| `player_id` | `uuid` | not null | composite FK `(room_id,player_id) → room_players(room_id,id)`, deferred `NO ACTION` |
| `seat` | `smallint` | not null | immutable round seat, 1–4 |
| `timeout_strikes` | `smallint` | not null / 0 | check 0–2; round-scoped truth |
| `participation_status` | `text` | not null / `ACTIVE` | ACTIVE/LEFT; rotation order is still immutable |
| `created_at` | `timestamptz` | not null / now | audit |

Primary key `(game_id,player_id)`; unique `(game_id,seat)`; unique
`(game_id,player_id)` is also the target for current/starter/pending/loser FKs.

### 5.6 `public.game_actions`

| Column | Type | Null/default | Constraint and purpose |
|---|---|---|---|
| `id` | `bigint generated always as identity` | not null | primary key |
| `room_id` | `uuid` | not null | room filter; FK room cascade |
| `game_id` | `uuid` | not null | composite FK `(game_id,room_id)` to game |
| `game_version` | `bigint` | not null | version produced by this mutation; unique per game |
| `turn_number` | `integer` | not null | turn affected |
| `actor_player_id` | `uuid` | nullable | gameplay actor; null only where no player actor applies |
| `requested_by_player_id` | `uuid` | nullable | canonical room player who invoked it; null means Cron/internal worker |
| `action_type` | `text` | not null | closed action-type check |
| `action_origin` | `text` | not null | closed origin check |
| `selected_number` | `smallint` | nullable | canonical player/timeout pick |
| `outcome` | `text` | nullable | only finalization writes the revealed outcome |
| `finish_reason` | `text` | nullable | populated for final loss |
| `lower_before` / `upper_before` | `smallint` | not null | exact pre-mutation bounds |
| `lower_after` / `upper_after` | `smallint` | not null | exact post-mutation bounds |
| `strike_count_after` | `smallint` | nullable | first-strike audit |
| `request_id` | `uuid` | nullable | client request; Cron rows may be null |
| `created_at` | `timestamptz` | not null / now | ordering/audit |

Constraints: unique `(game_id,game_version)` and partial unique
`(game_id,request_id) WHERE request_id IS NOT NULL`; valid 1–99 bounds/numbers;
closed checks above. This table does not store provisional selection and is not
required to render current state.

### 5.7 `private.game_secrets`

The `private` schema is not in Data API exposed schemas.

| Column | Type | Null/default | Constraint and purpose |
|---|---|---|---|
| `game_id` | `uuid` | not null | primary key; FK game cascade |
| `bomb_number` | `smallint` | not null | check 1–99; generated once at start |
| `pending_outcome` | `text` | nullable | SAFE/BOOM/TIMEOUT_LOSS; never client-readable before reveal |
| `pending_next_lower` | `smallint` | nullable | SAFE finalization payload |
| `pending_next_upper` | `smallint` | nullable | SAFE finalization payload |
| `pending_next_player_id` | `uuid` | nullable | SAFE next actor |
| `pending_loser_player_id` | `uuid` | nullable | BOOM/timeout victim |
| `pending_finish_reason` | `text` | nullable | private finish reason until reveal |
| `created_at` | `timestamptz` | not null / now | audit |
| `updated_at` | `timestamptz` | not null / now | audit |

Pending fields are populated atomically with `phase=RESOLVING` and cleared at
finalization. The bomb remains until room cleanup. Neither bomb nor pending
outcome is placed in a public row, Realtime payload, log row, error, or RPC
response before finalization.

### 5.8 `private.mutation_requests`

| Column | Type | Null/default | Constraint and purpose |
|---|---|---|---|
| `auth_user_id` | `uuid` | not null | authenticated caller; intentionally no Auth FK so Auth cleanup is not pinned |
| `request_id` | `uuid` | not null | client-generated idempotency key |
| `operation` | `text` | not null | closed list of mutating public RPC names |
| `room_id` | `uuid` | nullable | resulting/target room; FK cascade when known |
| `game_id` | `uuid` | nullable | resulting/target game; FK cascade when known |
| `response` | `jsonb` | nullable in transaction only | exact first response envelope; must be an object before commit |
| `created_at` | `timestamptz` | not null / now | audit |
| `expires_at` | `timestamptz` | not null / now + 48h | dedupe retention |

Primary key `(auth_user_id,request_id)`. A retry checks this record before
version/phase validation and returns the original response. Reusing one request
ID for another operation returns `REQUEST_ID_REUSED`. `INSERT ... ON CONFLICT DO
NOTHING` plus the primary-key lock makes concurrent identical retries converge.
The operation values are exactly `CREATE_ROOM`, `JOIN_ROOM`,
`UPDATE_ROOM_SETTINGS`, `KICK_PLAYER`, `LEAVE_ROOM`, `CLAIM_HOST`, `START_GAME`,
`LOCK_NUMBER`, `RESOLVE_TURN_TIMEOUT`, `FINALIZE_RESOLUTION`, `RESTART_GAME`, and
`RETURN_TO_LOBBY`.

### 5.9 Foreign-key deletion behavior

Only expiry cleanup deletes a room, cascading its games, action log, game
players, secrets, and room memberships. Individual members are never physically
deleted during a room lifetime, so player-referenced history is stable.
Participant FKs use deferred `NO ACTION` where a room-wide cascade must remove
both sides in one transaction. Auth users are deleted only after no room-player
reference exists.

### 5.10 Indexes

Create only these beyond primary/unique constraints:

```text
rooms(code) UNIQUE
rooms(expires_at) WHERE status IN ('FINISHED','CLOSED')
rooms(last_activity_at)
room_players(auth_user_id)
room_players(room_id, seat) WHERE membership_status='ACTIVE' UNIQUE
room_players(room_id, nickname_key) WHERE membership_status='ACTIVE' UNIQUE
room_players(room_id, last_seen_at) WHERE membership_status='ACTIVE'
room_games(room_id, round_number DESC)
room_games(room_id) WHERE phase <> 'FINISHED' UNIQUE
room_games(turn_deadline_at) WHERE phase='PLAYING_TURN'
room_games(resolution_at) WHERE phase='RESOLVING'
game_players(room_id, game_id)
game_actions(game_id, id)
game_actions(room_id, created_at DESC)
private.mutation_requests(expires_at)
```

## 6. RLS, grants, and function security

### 6.1 Table access

- Enable RLS on every `public` table. Enable it on private tables too, with no
  client policy, as defense in depth.
- Revoke all table privileges from `anon` and `authenticated`, then grant only
  `SELECT` on `rooms`, `room_games`, `game_players`, and `game_actions` to
  `authenticated`. On `room_players`, grant column-level SELECT only for
  `id, room_id, nickname, seat, membership_status, joined_at, last_seen_at,
  left_at`; do not grant `auth_user_id` or `nickname_key`.
- Grant no client `INSERT`, `UPDATE`, `DELETE`, identity-sequence privilege, or
  private-table privilege. All canonical writes go through reviewed functions.
- `anon` can do nothing to online data. An Anonymous Auth user carries the
  `authenticated` database role after sign-in.

### 6.2 Select policies

Create a non-exposed `private.is_active_room_member(room_id, user_id)`
`SECURITY DEFINER` boolean helper to avoid recursive policies. It tests
`room_players.auth_user_id=user_id AND membership_status='ACTIVE'`.

- `rooms` SELECT `USING
  (private.is_active_room_member(rooms.id,(select auth.uid())))`.
- `room_players` SELECT `USING
  (auth_user_id=(select auth.uid()) OR
  private.is_active_room_member(room_id,(select auth.uid())))`; the user may
  therefore observe their own KICKED/LEFT row but not the rest of that room.
- `room_games`, `game_players`, `game_actions` SELECT `USING
  (private.is_active_room_member(room_id,(select auth.uid())))`.
- Private tables have RLS enabled and no `anon`/`authenticated` policies.
- Always combine RLS with explicit client filters (`room_id = currentRoomId`).

### 6.3 Public RPC security

Every accepted public mutation is `SECURITY DEFINER SET search_path = ''`, uses
schema-qualified object names, requires non-null `auth.uid()`, derives player
identity from that UID, and row-locks canonical objects before validation. The
same rule applies to snapshot helpers that must cross RLS safely.

Revoke function execution from `PUBLIC`, `anon`, and `authenticated` by default;
grant `EXECUTE` to `authenticated` only for the final public RPC list. Private
engine/random/sweep functions are not granted. Grant only the minimal private
schema/helper execution needed by RLS. No frontend secret/service key exists.

Expected business failures return a typed envelope; unexpected SQL faults are
logged and mapped to `ONLINE_UNAVAILABLE`, never displayed raw. Functions use a
single transaction supplied by the RPC call; no function commits internally.

### 6.4 Realtime authorization

The sole topic is `room:<room-uuid>` and the channel is configured
`private: true`. `SELECT` and `INSERT` policies on `realtime.messages` permit
`broadcast` and `presence` only when the authenticated UID is an ACTIVE member
of the UUID parsed from `realtime.topic()`. A malformed topic fails closed.

The exact policy predicates are:

```text
SELECT USING (
  realtime.messages.extension IN ('broadcast','presence') AND
  private.is_active_room_topic(
    (select realtime.topic()),
    (select auth.uid())
  )
)

INSERT WITH CHECK (
  realtime.messages.extension IN ('broadcast','presence') AND
  private.is_active_room_topic(
    (select realtime.topic()),
    (select auth.uid())
  )
)
```

Realtime authorization cannot validate arbitrary provisional payload semantics.
It gates the room; every receiver additionally checks sender player, active
game/version/current actor, setting, and candidate bounds. This is proportional
because the payload is explicitly non-canonical.

## 7. Common RPC response and error contract

All public RPCs return one JSON object:

```ts
interface OnlineRpcResult {
  ok: boolean
  code: OnlineResultCode
  serverNow: string
  room: OnlineRoom | null
  players: OnlinePlayer[]
  game: OnlineGameState | null
  gamePlayers: OnlineGamePlayer[]
  action: CanonicalAction | null
}
```

Responses never contain `bomb_number` before `FINISHED`, a private pending
outcome, another user's Auth UID, or private request records. The snapshot is
read from the same transaction after mutation. Expected codes are:

```text
OK | ALREADY_APPLIED | ALREADY_JOINED | ALREADY_RESOLVED |
UNAUTHENTICATED | INVALID_NICKNAME | INVALID_ROOM_CODE | ROOM_NOT_FOUND |
ROOM_EXPIRED | ROOM_FULL | ROOM_ALREADY_PLAYING | NICKNAME_TAKEN |
ROOM_CODE_EXHAUSTED | KICKED | NOT_ROOM_MEMBER | NOT_HOST |
INVALID_SETTINGS | NOT_ENOUGH_PLAYERS | STALE_ROOM_VERSION |
GAME_NOT_FOUND | STALE_GAME_VERSION | NOT_YOUR_TURN |
INVALID_CANDIDATE | DEADLINE_PASSED | TOO_EARLY | INVALID_PHASE |
REQUEST_ID_REUSED | HOST_STILL_ACTIVE | NO_HOST_CANDIDATE |
ONLINE_UNAVAILABLE
```

`STALE_*`, `DEADLINE_PASSED`, and `ALREADY_RESOLVED` include the latest readable
snapshot so clients replace state rather than optimistically patching it.

## 8. Final RPC list and transaction behavior

Argument names and order are part of the NB-3B contract. All UUID mutation
requests are generated once on the client and retained through retries.

### Read/lease RPCs

```text
get_room_snapshot(p_room_id uuid) → OnlineRpcResult
touch_connection(p_room_id uuid) → OnlineRpcResult
```

- `get_room_snapshot`: authenticated active member, or own LEFT/KICKED row for a
  terminal membership response. Returns the whole public room snapshot in one
  MVCC statement and `serverNow`. No idempotency key because it is read-only.
- `touch_connection`: active member only; sets only that membership's
  `last_seen_at=clock_timestamp()` without room/game version increments. It is
  naturally idempotent and must be rate-limited client-side to 15 seconds.

### Room/lobby mutations

```text
create_room(
  p_nickname text,
  p_max_players smallint,
  p_turn_timeout_seconds smallint,
  p_timeout_policy text,
  p_starter_mode text,
  p_show_live_selection boolean,
  p_request_id uuid
) → OnlineRpcResult

join_room(p_room_code text, p_nickname text, p_request_id uuid)
  → OnlineRpcResult

update_room_settings(
  p_room_id uuid,
  p_expected_room_version bigint,
  p_max_players smallint,
  p_turn_timeout_seconds smallint,
  p_timeout_policy text,
  p_starter_mode text,
  p_show_live_selection boolean,
  p_request_id uuid
) → OnlineRpcResult

kick_player(
  p_room_id uuid,
  p_target_player_id uuid,
  p_expected_room_version bigint,
  p_request_id uuid
) → OnlineRpcResult

leave_room(p_room_id uuid, p_request_id uuid) → OnlineRpcResult

claim_host(
  p_room_id uuid,
  p_expected_host_player_id uuid,
  p_expected_room_version bigint,
  p_request_id uuid
) → OnlineRpcResult
```

- `create_room`: normalize/validate nickname and settings; claim request; loop
  up to eight server-generated codes; insert room and host membership with seat
  1 under deferred FK; set `host_player_id`; return snapshot.
- `join_room`: normalize code/name and lock room. Check this UID's existing row
  first: an ACTIVE row returns `ALREADY_JOINED` even if the game has started, so
  a deep link can recover the same browser identity. Otherwise reject
  non-LOBBY/full/expired and reject KICKED; reactivate a LEFT same-UID row or
  insert one at the lowest free seat; enforce normalized nickname uniqueness;
  increment room version/activity/expiry.
- `update_room_settings`: lock room; require current canonical host, LOBBY, exact
  room version, and valid settings. Reject reducing max below active count.
- `kick_player`: lock room and memberships; host/LOBBY/version checks; target is
  active, non-host; mark KICKED and increment version. No physical delete.
- `leave_room`: lock room/membership; mark caller LEFT. If caller is host,
  immediately choose lowest active seat; if none, close/shorten expiry. During
  a game, mark matching `game_players` LEFT without changing turn order.
- `claim_host`: lock room; require caller active, expected current host/version,
  host `last_seen_at <= now-45s`; choose lowest-seat active player seen within
  45s. Concurrent claims produce one room-version change; later calls return
  the snapshot or `STALE_ROOM_VERSION`.

### Game mutations

```text
start_game(
  p_room_id uuid,
  p_expected_room_version bigint,
  p_request_id uuid
) → OnlineRpcResult

lock_number(
  p_room_id uuid,
  p_game_id uuid,
  p_expected_game_version bigint,
  p_selected_number smallint,
  p_request_id uuid
) → OnlineRpcResult

resolve_turn_timeout(
  p_room_id uuid,
  p_game_id uuid,
  p_expected_game_version bigint,
  p_expected_current_player_id uuid,
  p_request_id uuid
) → OnlineRpcResult

finalize_resolution(
  p_room_id uuid,
  p_game_id uuid,
  p_expected_game_version bigint,
  p_request_id uuid
) → OnlineRpcResult

restart_game(
  p_room_id uuid,
  p_expected_room_version bigint,
  p_request_id uuid
) → OnlineRpcResult

return_to_lobby(
  p_room_id uuid,
  p_expected_room_version bigint,
  p_request_id uuid
) → OnlineRpcResult
```

- `start_game`: lock room; require host, LOBBY, version, and 2–4 active members
  not exceeding max. Snapshot them to `game_players`; choose first active seat
  or uniform random participant per setting; generate one server bomb in 1–99;
  insert private secret and `GAME_STARTED`; create deadline; set room PLAYING;
  increment room version. Game version starts at 1.
- `lock_number`: check dedupe first; lock game row and secret; verify room/game,
  phase PLAYING_TURN, exact version, caller's active room player equals current
  participant, database time is within `[turn_started_at,turn_deadline_at)`, and
  selected integer is in exact bounds. Compute candidate tension and sample one
  delay uniformly from its accepted range *without using outcome*. Compute
  outcome/private next state; expose only pending actor/number/origin and
  `resolution_at`; phase RESOLVING; increment version; log `NUMBER_LOCKED`.
- `resolve_turn_timeout`: any active member may trigger. Dedupe, lock game and
  expected participant, validate expected game/current/version, phase, and
  `clock_timestamp() >= deadline`. Apply exact policy. Random selection is
  uniform within current bounds and uses the same result-independent delay.
  Enter RESOLVING once, increment version, and log `TURN_TIMEOUT`. If another
  lock/timeout already won, return `ALREADY_RESOLVED` with current snapshot and
  no mutation.
- `finalize_resolution`: any active member may trigger. Dedupe and lock game +
  secret; require RESOLVING, exact version, and database time at/after
  `resolution_at`. SAFE commits private next bounds/player, increments turn,
  sets the 520 ms future start and full deadline, clears pending state, and
  returns PLAYING_TURN. BOOM/timeout writes loser, exact reason, revealed bomb,
  finished time, and room FINISHED. It increments game version once, increments
  room version when room status changes, and logs `RESOLUTION_FINALIZED`. Early
  calls return `TOO_EARLY`; already-finalized calls return `ALREADY_RESOLVED`.
- `restart_game`: host and FINISHED only; retains old rows, creates the next
  round using current room settings through the same internal start helper.
- `return_to_lobby`: host and FINISHED only; changes room to LOBBY, retains every
  finished game/action, increments room version. Settings can then change.

There is no standalone host reassignment RPC beyond `claim_host`; explicit
leave performs reassignment internally. There is no client-callable random,
secret, sweep, or cleanup RPC.

### 8.1 Lock/timeout concurrency order

```text
1. authenticate and validate request UUID shape
2. find completed idempotency record; return it if present
3. claim idempotency key
4. SELECT room/game FOR UPDATE
5. re-read phase, version, current actor, bounds and database clock
6. exactly one contender mutates
7. write action and response before commit
8. contenders unblocked afterward return latest canonical state harmlessly
```

This ordering makes double tap, network retry, three simultaneous timeout
callers, timeout-vs-lock, and member-vs-Cron finalization converge.

## 9. Realtime contract

### 9.1 One private room channel

```text
topic: room:<room UUID>
private: true
presence key: canonical player UUID
broadcast self: false
```

After create/join, the client attaches all handlers, waits for `SUBSCRIBED`, then
calls `get_room_snapshot`. It buffers intervening row changes and applies only
versions newer than the snapshot. On channel rejoin it repeats this sequence.

### 9.2 Canonical Postgres Changes

Add exactly these tables to `supabase_realtime`:

```text
rooms
room_players
room_games
game_players
```

Subscribe with explicit `room_id`/`id` filters and RLS. `game_actions` is fetched
on demand for history/debugging; it is not published because `room_games`
contains everything necessary to present the current transition. Private tables
are never published.

The `room_players` subscription requests only its granted safe column list; Auth
UID and nickname key never enter a Realtime payload. NB-3B must pin a current
Supabase JS version that supports Postgres Changes column selection and must
fail its RLS/Realtime contract tests if an unprojected subscription can expose a
restricted column.

Postgres Changes are wake-up/delta signals, not the sole recovery mechanism.
Unknown versions, reconnect, subscription error, or a version gap trigger one
snapshot refetch.

### 9.3 Ephemeral Broadcast

Wire event `player_selection_changed`:

```ts
interface RealtimeSelectionEvent {
  v: 1
  roomId: string
  gameId: string
  gameVersion: number
  playerId: string
  candidate: number
  clientSeq: number
  sentAt: string
}
```

Wire event `player_selection_cleared` contains the same fields except candidate.
The current actor broadcasts on an actual selection change and every two
seconds while it remains selected. Receivers retain it for five seconds, accept
only monotonically newer `clientSeq` for that turn, and validate:

```text
show_live_selection is true
event room/game/version matches canonical state
phase is PLAYING_TURN
player is canonical current player and active room member
candidate is an integer inside current bounds
```

Clear on explicit event, canonical version/phase/current-player change,
Presence leave, or TTL. Provisional selection never reserves, writes, vibrates,
plays a click remotely, changes a range, rotates a turn, or survives reconnect.

When `show_live_selection=false`, the actor sends no candidate Broadcast.
Others derive `“<NAME> ĐANG SUY NGHĨ…”` from canonical current player. When true,
they show `“<NAME> ĐANG CHỌN SỐ 55”`; the actor keeps the normal local selected
number/action dock instead of redundant prose.

### 9.4 Presence

Presence payload is limited to `{ playerId, onlineSince, clientInstanceId }`.
Nickname and seat come from canonical roster. Presence drives immediate
connected/disconnected badges and the host UI preflight only. It does not add or
remove membership, change host, start, rotate, resolve, or prove identity.

## 10. Reconnect and versioning

Persist only a pointer such as `{roomId, roomCode}` under a versioned local key;
the Supabase Auth session persists separately. Startup flow:

```text
ONLINE selected
→ restore/get anonymous session
→ if room pointer exists: show ĐANG KẾT NỐI LẠI…
→ subscribe private channel
→ get_room_snapshot(auth.uid membership wins)
→ restore lobby/game/deadline/resolution
→ clear pointer on NOT_ROOM_MEMBER, KICKED, CLOSED, or expired
```

- Before deadline: current player regains controls.
- Deadline passed in PLAYING_TURN: call `resolve_turn_timeout`; server decides.
- RESOLVING before `resolution_at`: duck soundscape and schedule against that
  timestamp, not packet arrival.
- RESOLVING after `resolution_at`: do not restart suspense; request finalization
  immediately and hold the locked state until canonical result.
- Hydrating an already FINISHED snapshot renders the settled result without a
  new transient BOOM/haptic. A live transition to FINISHED presents BOOM once,
  keyed by `(gameId,version)` in a presentation ledger.
- If an event version is `<= appliedVersion`, ignore it. If it is greater than
  `appliedVersion+1`, fetch a snapshot. Room and game versions are independent.

## 11. Synchronized presentation contract

The server samples one delay from the current candidate-count tier:

| Tier | Candidate count | Resolution delay |
|---|---:|---:|
| CALM | 31–99 | 450–550 ms |
| UNEASY | 16–30 | 520–640 ms |
| DANGER | 8–15 | 600–740 ms |
| CRITICAL | 4–7 | 700–860 ms |
| TERMINAL | 1–3 | 820–1000 ms |

The sample occurs before/independently of checking whether the number is the
bomb; SAFE and BOOM therefore have no timing leak.

On the canonical RESOLVING version every device:

1. clears provisional selection;
2. shows `“<NAME> ĐÃ KHÓA SỐ N”` (or timeout-specific copy);
3. plays one restrained shared LOCK cue keyed to the version;
4. ducks/stops the heartbeat for deliberate silence;
5. waits until the shared `resolution_at` using server-clock offset;
6. races idempotent finalization;
7. presents the finalized result when the canonical version arrives.

Target result-onset spread is **≤200 ms among active clients under local/test
conditions**. This is not a promise of frame-perfect Internet synchronization.
If a result packet is late, present it immediately; never replay the obsolete
full suspense interval.

SAFE uses the existing mechanical sound on all devices and the existing short
overlay. The next turn's canonical start is 520 ms later. Remote provisional
selection is visual only; remote LOCK is the first shared SFX.

### 11.1 BOOM/failure recipient profiles

**VICTIM** (local player ID equals loser): existing accepted full BOOM at 1.0
profile intensity; full transient/body/sub/tail; ringing and muffled aftermath;
full permitted flash/takeover/screen kick respecting reduced motion; haptic
`[70,30,120]` where enabled/supported.

**SPECTATOR** (every other player): dedicated result bus/profile, never global
master-volume mutation. Initial perceived impact target **0.45** of victim:
transient 0.45, audible body 0.40, sub 0.30, and tail 0.35 relative starting
coefficients. No ringing and no aggressive muffled aftermath. Visual result is
prominent but flash/shake are about 0.45/0.35 of victim; haptic `[30,25,45]`.

`TIMEOUT_SELF_DESTRUCT` and `TIMEOUT_STRIKES_EXCEEDED` use victim intensity on
the losing device and spectator intensity elsewhere, with copy that says
`HẾT GIỜ` / `MẠCH TỰ HỦY` rather than pretending the bomb was selected. The bomb
number is still revealed after the round ends.

Mute, haptics toggle, autoplay unlock, cleanup/replay lifecycle, and reduced
motion remain independent. Reduced motion suppresses aggressive movement, not
enabled audio drama. Spectator ringing is always **NO**.

## 12. Conceptual TypeScript contracts (not source implementation)

```ts
type TimeoutPolicy =
  | 'SELF_DESTRUCT'
  | 'RANDOM_PICK'
  | 'RANDOM_PICK_WITH_2_STRIKES'

type GamePhase = 'PLAYING_TURN' | 'RESOLVING' | 'FINISHED'
type ExplosionPresentationVariant = 'victim' | 'spectator'
type OnlineConnectionState =
  | 'offline'
  | 'authenticating'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unavailable'

interface OnlineRoomSettings {
  maxPlayers: 2 | 3 | 4
  turnTimeoutSeconds: number // DB-enforced integer 15..30
  timeoutPolicy: TimeoutPolicy
  starterMode: 'FIRST_SEAT' | 'RANDOM'
  showLiveSelection: boolean
}

interface OnlineRoom {
  id: string
  code: string
  status: 'LOBBY' | 'PLAYING' | 'FINISHED' | 'CLOSED'
  hostPlayerId: string
  settings: OnlineRoomSettings
  version: number
  lastActivityAt: string
  expiresAt: string
}

interface OnlinePlayer {
  id: string
  roomId: string
  nickname: string
  seat: number
  membershipStatus: 'ACTIVE' | 'LEFT' | 'KICKED'
  joinedAt: string
  lastSeenAt: string
}

interface OnlineGamePlayer {
  gameId: string
  playerId: string
  seat: number
  timeoutStrikes: number
  participationStatus: 'ACTIVE' | 'LEFT'
}

interface PendingResolution {
  lockedNumber: number | null
  actorPlayerId: string
  origin:
    | 'PLAYER_LOCK'
    | 'TIMEOUT_RANDOM'
    | 'TIMEOUT_SELF_DESTRUCT'
    | 'TIMEOUT_STRIKES_EXCEEDED'
  resolutionAt: string
  // Deliberately no outcome.
}

interface OnlineGameState {
  id: string
  roomId: string
  roundNumber: number
  phase: GamePhase
  lowerCandidate: number
  upperCandidate: number
  currentPlayerId: string
  startingPlayerId: string
  turnNumber: number
  version: number
  turnStartedAt: string
  turnDeadlineAt: string
  pending: PendingResolution | null
  lastLockedNumber: number | null
  lastActorPlayerId: string | null
  lastOutcome: 'SAFE' | 'BOOM' | 'TIMEOUT_LOSS' | null
  loserPlayerId: string | null
  finishReason:
    | 'BOMB_HIT'
    | 'TIMEOUT_SELF_DESTRUCT'
    | 'TIMEOUT_STRIKES_EXCEEDED'
    | null
  revealedBombNumber: number | null
  updatedAt: string
  finishedAt: string | null
}

interface CanonicalAction {
  id: number
  gameId: string
  gameVersion: number
  turnNumber: number
  actorPlayerId: string | null
  type:
    | 'GAME_STARTED'
    | 'NUMBER_LOCKED'
    | 'TURN_TIMEOUT'
    | 'RESOLUTION_FINALIZED'
  origin: string
  selectedNumber: number | null
  outcome: 'SAFE' | 'BOOM' | 'TIMEOUT_LOSS' | null
  finishReason: OnlineGameState['finishReason']
  createdAt: string
}

interface RealtimeSelectionEvent {
  v: 1
  roomId: string
  gameId: string
  gameVersion: number
  playerId: string
  candidate: number
  clientSeq: number
  sentAt: string
}
```

The online store is a separate transport state machine consuming these DTOs. It
must not add network fields or uppercase online phases to the local `GameState`.

## 13. Failure UX mapping

| Condition/code | Vietnamese player copy |
|---|---|
| invalid code | `MÃ PHÒNG KHÔNG HỢP LỆ.` |
| not found/expired | `PHÒNG KHÔNG CÒN TỒN TẠI.` |
| full | `PHÒNG ĐÃ ĐỦ NGƯỜI.` |
| already playing | `VÁN ĐẤU ĐÃ BẮT ĐẦU.` |
| duplicate nickname | `TÊN NÀY ĐÃ CÓ TRONG PHÒNG.` |
| network unavailable | `MẤT KẾT NỐI. ĐANG THỬ LẠI…` |
| Supabase/config unavailable | `CHƠI ONLINE CHƯA SẴN SÀNG.` |
| auth failure | `KHÔNG THỂ TẠO PHIÊN ONLINE.` |
| host migrated | `<NAME> HIỆN LÀ CHỦ PHÒNG.` |
| kicked | `BẠN ĐÃ ĐƯỢC MỜI RỜI PHÒNG.` |
| stale turn/version | `TRẠNG THÁI ĐÃ THAY ĐỔI. ĐANG ĐỒNG BỘ…` |
| deadline passed | `ĐÃ HẾT GIỜ. ĐANG XỬ LÝ…` |
| reconnecting | `ĐANG KẾT NỐI LẠI…` |

Buttons disable while a canonical mutation is in flight, but that is UX only;
RPC validation remains mandatory. Never render raw Postgres/PostgREST messages.

## 14. Environment and startup contract

Client variables are exactly:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Both must be non-empty and the URL must parse before Online is enabled. Client
construction is lazy and isolated under a future `src/online/` boundary. Missing
or invalid config disables only `CHƠI ONLINE`; it cannot prevent React startup,
render local setup, run local tests, or build the local game. `.env.local` stays
ignored. Never add a database password, secret key, legacy service-role key, or
private schema credential to Vite, GitHub Pages, QR, client logs, or test HTML.

## 15. Expiry and operational cleanup

- Creation and each canonical room/game mutation refresh `expires_at` to
  `now + 24 hours`.
- CLOSED/empty rooms expire in one hour. Finished rooms remain recoverable for
  24 hours unless replayed/returned to lobby.
- Hourly `private.cleanup_expired_online_data(500)` deletes expired rooms in
  bounded batches; FK cascades remove their history/secrets/request records.
- Private dedupe records with no retained room expire after 48 hours.
- Anonymous Auth users are not automatically cleaned by Supabase. A separate
  weekly job may delete anonymous users older than 30 days only when no
  `room_players` row references them. This is an NB-3B operational migration,
  not client behavior.
- Enable the platform anonymous-sign-in rate limit and invisible
  CAPTCHA/Turnstile before public traffic; this protects Auth table growth and
  does not add an email/password account flow.

## 16. Ordered NB-3B migrations

Do not execute these in NB-3A.

1. `202608250001_online_foundation.sql` — enable required `pgcrypto`/Cron
   extensions if absent; create private schema, text-check constants/helpers,
   public/private tables, deferred FKs, conditional constraints.
2. `202608250002_online_indexes.sql` — exact unique, partial, deadline,
   membership, history, and cleanup indexes.
3. `202608250003_online_rls_grants.sql` — revoke defaults; select policies;
   membership helpers; exact table/function grants; policy tests alongside it.
4. `202608250004_online_room_rpcs.sql` — normalization/code helpers,
   idempotency envelope, snapshot, create/join/settings/kick/leave/heartbeat/
   host claim.
5. `202608250005_online_gameplay_rpcs.sql` — centralized random helpers,
   start/lock/timeout/finalize/replay/lobby and action logging.
6. `202608250006_online_realtime_cron.sql` — publication entries,
   `realtime.messages` room-topic policies, due-work sweep, hourly cleanup, and
   job schedules.
7. `202608250007_online_contract_tests.sql` — pgTAP/integration fixtures and
   shared rule vectors; test-only deterministic secret helpers must never be
   granted or deployed to production.

Each migration must be reversible where practical and run from an empty local
Supabase instance in CI. Generated database TypeScript types follow migrations,
not precede them.

## 17. NB-3B implementation order

1. Add local Supabase CLI/test environment and apply migrations/tests; prove RLS
   and RPC concurrency before UI work.
2. Add the Supabase JS dependency, lazy validated client factory, and generated
   DB types under `src/online/`; prove build/local mode with missing env.
3. Add HOME mode choice while leaving existing `SetupScreen → GameScreen` local
   path intact.
4. Add anonymous auth/session recovery and versioned room pointer.
5. Build typed RPC facade and canonical snapshot/version store.
6. Build Online Entry, code/deep-link normalization, create/join, QR rendering.
7. Build lobby roster/settings/host controls and private room channel Presence.
8. Adapt existing gameplay components to an online view model; only RPC results
   may mutate canonical online state.
9. Add provisional selection Broadcast with validation, sequence, refresh, TTL,
   privacy-off behavior, and no remote selection SFX.
10. Add server-offset countdown, warning layer, timeout callers, strike UI, and
    Cron integration QA.
11. Add shared `resolution_at` scheduler, finalization, late-event behavior, and
    one-shot presentation ledger.
12. Add victim/spectator audio, visual, and haptic profiles without changing the
    local accepted profile.
13. Add reconnect, heartbeat/45-second host migration, leave/kick/expiry UX.
14. Add multi-context E2E, mobile/reduced-motion/audio lifecycle QA, production
    environment checks, then rerun the untouched local V1 suite.

## 18. NB-3B test plan

### 18.1 Unit/contract

- Room-code normalization/alphabet/URL and nickname normalization/control/max.
- Countdown offset sampling, formatting, warning boundary, visibility resume.
- Timeout-policy copy and strike mapping.
- Candidate-count tension/delay parity with current presentation model.
- Canonical DTO parsing/version gap/reconnect reducer/idempotent event ledger.
- Live-selection validation, sequence, TTL, privacy setting.
- Victim/spectator selection; exact 1.0/0.45 profile and no spectator ringing.
- Shared SQL/TypeScript range vectors, including all current reducer cases.
- Local mode config boundary with no Supabase variables.

### 18.2 Database/integration

- Create/join/normalize/collision retry; full room; duplicate nickname; same-UID
  recovery; kicked rejoin denial; lowest free seat.
- RLS for non-member, active member, LEFT/KICKED self row; no direct writes;
  private bomb/pending/request inaccessible; only exact functions executable.
- Host-only settings/start/kick/replay/lobby; 2–4 start; max/settings checks;
  random/first starter and server bomb bounds.
- SAFE below/above exact bounds, BOOM reveal only after finalization, invalid
  integer/range/turn/phase/deadline rejected, 2/3/4 rotation.
- Stale versions, duplicate request IDs, request-ID reuse, simultaneous lock
  race, lock-vs-timeout race, three-client timeout race.
- All three timeout policies; first/second strike; per-player/per-round reset;
  random choice only from active range; random pick hitting bomb.
- Result-independent delay boundaries for all five tiers; no public pending
  outcome; early finalize rejected; member/member and member/Cron finalize once;
  SAFE 520 ms next-turn guard.
- Explicit and 45-second host migration; participant leave; immutable game
  order; room expiry/cascade and anonymous-user cleanup guard.

Database tests may set `private.game_secrets` as the migration owner inside a
rolled-back local test transaction. Do not expose a deterministic bomb RPC or
browser environment override for online production.

### 18.3 Multi-client Realtime/E2E

Use isolated Browser A/B/C/D contexts and local Supabase reset per suite:

- All devices converge on roster, settings, starter, current actor, bounds,
  count, strikes, and deadline; only current actor can submit.
- QR/deep link prefill and nickname entry.
- Provisional selection appears remotely, changes/clears/expires, is visual
  only, and disappears entirely when setting is off.
- LOCK appears once on all devices; SAFE/BOOM onset spread ≤200 ms in local CI;
  range and next deadline converge.
- Victim gets full BOOM/ringing/haptic; all spectators get 0.45/no ringing/light
  haptic; timeout copy/reason is distinct; mute and haptics preferences hold.
- Reconnect before/after deadline and before/after resolution; reload never
  creates a second membership or replays an already-settled explosion.
- Simultaneous clicks and retries cannot advance twice; stale tabs self-heal.
- First strike and second-strike loss synchronize.
- Host disconnect grace/migration, explicit leave, kick, replay, lobby return,
  room expiry.
- 390–440 px mobile shell, 1366×768/1440×900 desktop, no horizontal overflow,
  focused board, safe areas, reduced motion, keyboard play, no React warnings.
- Re-run all existing typecheck, lint, Vitest, local Playwright, and build gates.

## 19. Risks and mitigations

| Risk | Mitigation/acceptance |
|---|---|
| Realtime packet duplication, ordering, or loss | Monotonic versions, idempotent RPCs, subscribe-then-snapshot bootstrap, snapshot on gaps |
| Device clock skew/background throttling | sampled server offset; DB clock validation; all clients may race; one-second Cron backstop |
| Outcome leak during suspense | private secret and private pending outcome; public row exposes only actor/number/time |
| RLS recursion or overly broad definer | private boolean helper, empty search path, qualified names, exact execute grants, negative policy tests |
| Five-character collision | 31-symbol space, unique constraint, eight server retries; no correctness reliance on probability |
| Anonymous Auth database abuse/growth | platform rate limit, invisible CAPTCHA, bounded room TTL, guarded 30-day Auth cleanup |
| Presence falsely treated as membership | durable roster/RPC truth; Presence only UI; heartbeat only host lease |
| All clients disconnect during timeout/resolution | canonical timestamps persist; Cron/reconnect invokes the same locked helpers |
| Full victim BOOM affects other devices | explicit result variant and layer bus; spectator 0.45, no ringing; never change global volume |
| SQL/TypeScript rules drift | shared table vectors and database integration tests against accepted reducer semantics |
| GitHub Pages base breaks QR | build URL from `window.location.origin` plus `import.meta.env.BASE_URL` |
| Supabase outage/cold start | reconnect state and retries; local mode stays entirely operational |

## 20. Open product questions and non-goals

**Open product questions: NONE.** The product choices required for NB-3B are
resolved above.

Online V1 explicitly excludes chat, friends, profiles/accounts, email/password,
leaderboards/ranking, matchmaking, spectator seats, voice, custom ranges,
more than four players, tournament/elimination mode, and anti-cheat escalation.

## 21. Official implementation references

- [Supabase Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)
  — anonymous users receive stable Auth UIDs for the browser profile, use the
  authenticated database role, and require explicit cleanup/abuse controls.
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
  — `auth.uid()`, per-operation policies, indexes, and safe definer helpers.
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
  — empty `search_path` for `SECURITY DEFINER` and explicit function grants.
- [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
  — private Broadcast/Presence authorization via `realtime.messages` policies.
- [Supabase Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
  — publication and RLS behavior for canonical row changes.
- [Supabase Cron](https://supabase.com/docs/guides/cron) and
  [Cron Quickstart](https://supabase.com/docs/guides/cron/quickstart) — database
  jobs support second intervals on supported hosted Postgres versions.
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
  — publishable keys are browser-safe with RLS; secret keys bypass RLS and must
  never enter the client.
- [PostgreSQL pgcrypto random data](https://www.postgresql.org/docs/current/pgcrypto.html)
  — `gen_random_bytes` is the server random primitive for bounded helpers.

## 22. Gate result

```text
NB-3A PASS — ONLINE UX CONTRACT DEFINED — SUPABASE SCHEMA/RPC/REALTIME CONTRACT DEFINED — TIMER/TIMEOUT RULES DEFINED — SYNCHRONIZED PRESENTATION DEFINED — READY FOR NB-3B IMPLEMENTATION
```
