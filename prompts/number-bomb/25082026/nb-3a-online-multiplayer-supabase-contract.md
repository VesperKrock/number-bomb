# NB-3A — Online Multiplayer Architecture + Supabase Contract

## Mission

Design the complete architecture contract for BOM SỐ Online before any implementation work begins.

Current V1 local/offline gameplay is accepted and committed.

The purpose of NB-3A is to remove ambiguity before NB-3B implementation.

NB-3A is:

DESIGN
AUDIT
CONTRACT
IMPLEMENTATION PLAN

NB-3A is NOT:

ONLINE IMPLEMENTATION

Do not modify the accepted local game behavior.

---

# Delivery mode

DESIGN ONLY.

Allowed:

* inspect current repository
* inspect current game engine/state model
* inspect presentation/audio/haptics architecture
* inspect `.env.example`
* inspect current test architecture
* propose exact schema
* propose SQL/migration contracts
* propose RPC contracts
* propose Realtime contracts
* propose TypeScript interfaces
* propose implementation sequence
* create architecture documentation if explicitly useful

Forbidden:

* installing Supabase packages as implementation work
* wiring a live Supabase client into the app
* creating remote database tables
* executing migrations
* implementing rooms
* implementing online UI
* changing local gameplay
* commit
* push
* deploy

---

# Baseline inspection

Before designing, inspect physical repository truth.

Report:

```text
git status --short
git rev-parse --show-toplevel
git rev-parse HEAD
git log -1 --oneline
git remote -v
```

Baseline should correspond to the accepted Number Bomb V1.

Inspect at minimum:

* current reducer/game engine
* setup flow
* GameScreen
* NumberBoard
* tension system
* presentation timing
* audio lifecycle
* haptics
* E2E injection/test utilities
* responsive shell
* environment handling

Do not design Online as though the current codebase does not exist.

Reuse good existing abstractions where possible.

---

# ============================================================

# PRODUCT PRINCIPLE

# ============================================================

Online mode should feel like the same BOM SỐ game.

Do not rebuild the game as a separate product.

The product now has two entry modes:

```text
BOM SỐ

[ CHƠI CÙNG NHAU ]
2–4 người · Một thiết bị

[ CHƠI ONLINE ]
Mỗi người một thiết bị
```

---

# Local mode

The existing local/hot-seat mode remains fully functional.

It must not require Supabase.

It must not require Internet.

It must not require authentication.

If Supabase environment/configuration is absent, local mode must still work.

---

# Online mode

Online V1:

* 2–4 players
* one device per player
* no email/password account flow
* nickname only
* Supabase Anonymous Auth
* create room
* join room
* room code
* QR/deep link
* lobby
* host controls
* synchronized gameplay
* reconnect support
* no in-app text chat
* no spectator role in V1
* no matchmaking in V1
* no rankings/leaderboards in V1

---

# Philosophy

Do not turn this casual game into a cybersecurity project.

However, multiplayer correctness must be centralized.

Clients must not independently decide canonical game outcomes.

Principle:

```text
CLIENT REQUESTS AN ACTION

DATABASE/RPC VALIDATES AND RESOLVES THE ACTION

REALTIME DISTRIBUTES CANONICAL STATE

CLIENT PRESENTS THE RESULT
```

The goal is:

* correct synchronization
* atomic turns
* no accidental desync
* safe retries
* clean reconnect

not anti-cheat perfection.

---

# ============================================================

# UX FLOW

# ============================================================

Design exact UX for:

```text
HOME
→ ONLINE ENTRY
→ CREATE/JOIN
→ LOBBY
→ PLAYING
→ FINISHED
→ REPLAY / LOBBY / LEAVE
```

---

# Home

Concept:

```text
BOM SỐ
Đừng chọn sai.

[ CHƠI CÙNG NHAU ]
2–4 người · Một thiết bị

[ CHƠI ONLINE ]
Mỗi người một thiết bị
```

Keep local mode obvious.

Online must not replace it.

---

# Online entry

Each device only enters its own nickname.

Do not use the local Player 1 / Player 2 / Player 3 naming form.

Concept:

```text
TÊN CỦA BẠN

[ Thiên An              ]

[ TẠO PHÒNG ]

──────── hoặc ────────

MÃ PHÒNG

[ K7X4P ]

[ THAM GIA ]
```

---

# Nickname rules

Propose exact contract.

Recommended:

* trim whitespace
* minimum: 1 meaningful character
* maximum: 20 characters

Reject:

* blank-only names
* control characters

Duplicate names inside the same room should preferably be rejected or disambiguated.

Choose one behavior and justify it.

Do not use nickname as identity.

Identity comes from auth/user/player IDs.

---

# Anonymous authentication

Use Supabase Anonymous Auth.

On first Online entry:

```text
signInAnonymously()
```

The Supabase auth user ID becomes the stable account/session identity for that browser profile.

No email/password UI.

No account creation screen.

Do not automatically sign users out after a match.

---

# ============================================================

# ROOM CREATION

# ============================================================

Host creates a room.

Room code should be short enough to say aloud.

Recommended:

```text
5 characters
```

Use an alphabet excluding visually ambiguous characters:

```text
0
O
1
I
L
```

Example:

```text
K7X4P

M8Q2N
```

Define:

* alphabet
* collision strategy
* unique constraint
* retry behavior

Room code comparison should be case-insensitive or normalized uppercase.

---

# Join URL / QR

Design canonical join URL.

Example concept:

```text
https://<host>/number-bomb/?room=K7X4P
```

or routing equivalent matching Vite deployment.

QR encodes only the join URL.

On opening QR:

```text
Online Join screen opens
room code prefilled
player enters nickname
joins room
```

Do not encode private game data in QR.

---

# ============================================================

# LOBBY

# ============================================================

Lobby supports 2–4 players.

Concept:

```text
PHÒNG K7X4P

THIÊN AN              HOST
MINH
HẢI

2 / 4 NGƯỜI

ROOM SETTINGS

...

[ BẮT ĐẦU ]
```

---

# Host

Room creator is initial host.

Host may:

* configure room
* start game
* remove player from lobby
* replay/start next round
* return finished game to lobby

Host must not have special gameplay advantages.

---

# Ready state

Determine whether Online V1 genuinely needs READY.

Preferred simple model:

```text
joining the lobby is sufficient
host may start when 2–4 connected players exist
```

Do not add Ready unless it materially improves accidental-start prevention.

If Ready is included, define it completely.

---

# Random starter

Preserve current product option.

Host chooses:

```text
STARTER
- FIRST SEAT
- RANDOM
```

Or equivalent.

Random starter is decided canonically by the server/RPC on game start.

---

# ============================================================

# TURN TIMER

# ============================================================

Online mode adds a per-turn countdown.

Host configures it in the lobby.

Valid values:

```text
integer 15–30 seconds inclusive
```

Recommended UI:

```text
[15s] [20s] [30s]
```

with optional custom value constrained to:

```text
15 <= seconds <= 30
```

Default:

```text
20 seconds
```

Database must enforce bounds.

Do not trust only frontend validation.

---

# Canonical timer fields

Design around server timestamps.

Canonical game state should include equivalents of:

```text
turn_started_at
turn_deadline_at
```

Do NOT model the canonical timer as:

```text
remaining_seconds = 19
remaining_seconds = 18
...
```

with database writes every second.

Clients calculate visual countdown locally from the server deadline.

---

# Clock skew

Account for differences between device clocks.

Define a practical strategy.

Possible strategy:

derive server time offset from Supabase response timestamps.

The UI does not require millisecond precision.

Canonical timeout validation always occurs in Postgres using server time.

---

# 5-second warning

Presentation-only behavior may intensify during the final five seconds.

Examples:

```text
5
4
3
2
1
```

red visual warning.

Do not mutate the candidate tension tier merely because time is running out.

Candidate tension and timer pressure are separate presentation dimensions.

Do not increase BOOM output just because timer is low.

---

# ============================================================

# TIMEOUT POLICIES

# ============================================================

Host selects one of three policies.

Define an enum.

Recommended names:

```text
SELF_DESTRUCT
RANDOM_PICK
RANDOM_PICK_WITH_2_STRIKES
```

Store canonical values using stable machine-readable names.

---

# Policy A — SELF_DESTRUCT

When deadline passes without a valid LOCK:

current player loses the round because of timeout.

Round becomes FINISHED.

Use a distinct reason:

```text
TIMEOUT_SELF_DESTRUCT
```

This is not a fake bomb hit.

UI may still present a failure/explosion treatment.

Log the actual reason.

---

# Policy B — RANDOM_PICK

When deadline passes:

server chooses one currently valid candidate uniformly at random.

That candidate becomes an automatic LOCK action for the current player.

Then normal rules apply.

If random candidate equals bomb:

```text
BOOM normally.
```

If SAFE:

```text
range shrinks
turn rotates
new turn timer begins
```

Action history must mark:

```text
origin = TIMEOUT_RANDOM
```

rather than normal PLAYER_LOCK.

---

# Random candidate

The server must choose from the actual valid candidate set.

Do not use eliminated numbers.

Do not ask clients to provide the random number.

---

# Policy C — RANDOM_PICK_WITH_2_STRIKES

Each player has timeout strikes scoped to the active round.

First timeout:

```text
strike becomes 1 / 2
```

server performs RANDOM_PICK.

Normal SAFE/BOOM logic follows.

If that random number hits bomb:

player loses normally immediately.

Second timeout by the same player:

player loses the round from timeout.

Recommended reason:

```text
TIMEOUT_STRIKES_EXCEEDED
```

Do NOT perform another random selection before intentionally losing them on the second strike.

Reset timeout strikes at the beginning of a new round.

---

# UI

Display when relevant:

```text
⚠ HẾT GIỜ 1/2
```

Do not shame the player.

Use concise game-show language.

---

# Timeout concurrency

Multiple clients may detect the expired deadline at the same time.

Design:

```text
resolve_turn_timeout(...)
```

as an atomic idempotent RPC.

Database must verify:

* room/game exists
* game is PLAYING
* expected game/version matches
* expected current player matches
* deadline has actually passed using database clock
* this turn has not already been resolved
* no valid LOCK already won the race

If three clients call the RPC simultaneously:

```text
exactly one resolution occurs
```

Others receive current canonical state / harmless already-resolved result.

---

# ============================================================

# PLAYER SELECTION PRESENCE

# ============================================================

Online players waiting for their turn should see what the active player is considering.

Example:

```text
THIÊN AN ĐANG CHỌN

55
```

or:

```text
Thiên An đang chọn số 55
```

This is social/presentation information.

It is NOT canonical game state.

---

# Provisional selection

When current player taps/selects 55:

broadcast:

```text
PLAYER_SELECTION_CHANGED
```

with:

```text
room ID
game/round ID
player ID
candidate number
optional client sequence/timestamp
```

Other players show:

```text
THIÊN AN ĐANG CHỌN SỐ 55
```

and may softly highlight 55.

If active player changes to 57:

broadcast new provisional selection.

Do not write every provisional selection to Postgres.

---

# Selection validity

Sending a provisional selection does NOT reserve a number.

It does NOT alter candidate bounds.

It does NOT rotate the turn.

It does NOT prove the player will LOCK it.

LOCK remains the canonical action.

---

# Optional privacy setting

Add room setting:

```text
show_live_selection
```

Default:

```text
ON
```

If OFF:

spectators see:

```text
THIÊN AN ĐANG SUY NGHĨ...
```

They only see the number when it is canonically LOCKED.

Host configures this in lobby.

---

# Broadcast abuse

Ignore provisional selection messages from:

* player not in room
* player who is not current player
* invalid candidate number

Determine whether this validation occurs client-side, channel authorization, or both.

Because provisional data is non-canonical, keep the design proportional.

---

# ============================================================

# LOCK ACTION

# ============================================================

The player's most important canonical action is:

```text
LOCK NUMBER
```

Client sends a request equivalent to:

```text
lock_number(
  room_id,
  game_id,
  expected_version,
  selected_number,
  request_id
)
```

Exact contract must be designed.

---

# Atomic validation

RPC validates inside one transaction:

* authenticated user belongs to room
* game is PLAYING
* phase permits locking
* caller is current player
* expected state version matches
* selected number is currently valid
* deadline has not already been resolved
* request has not already been processed

Then determine outcome.

---

# Idempotency

Every canonical mutation request should carry a unique request ID.

Recommended:

```text
UUID generated client-side
```

Database records/deduplicates it.

```text
Double tap
network retry
Realtime retry
browser reconnect
```

must not produce two turns.

---

# State versioning

Maintain a monotonically increasing state/game version.

Every canonical mutation updates it.

Clients may send:

```text
expected_version
```

Stale clients receive a conflict/current-state response rather than overwriting newer state.

---

# ============================================================

# SAFE / BOOM RESOLUTION PHASE

# ============================================================

Online presentation needs synchronization.

Do not immediately jump from LOCK to next turn independently on each client.

Canonical phases should distinguish something like:

```text
PLAYING_TURN
RESOLVING
FINISHED
```

or equivalent.

Design the final state machine.

---

# Resolution delay

Preserve current NB-2M tension timing:

```text
CALM:
450–550 ms

UNEASY:
520–640 ms

DANGER:
600–740 ms

CRITICAL:
700–860 ms

TERMINAL:
820–1000 ms
```

SAFE and BOOM use the same policy.

No result timing leak.

---

# Online synchronization

On canonical LOCK:

server determines a presentation delay within the current tension range.

Store:

```text
resolution_at = database_now + selected_delay
```

and the pending result needed for finalization.

All clients receive the same:

* locked player
* locked number
* resolution_at

Therefore all devices can present:

```text
KLAK
→ suspense
→ result
```

at approximately the same wall-clock moment.

---

# Do not rely only on local setTimeout duration

Network latency differs by device.

Clients should schedule against:

```text
resolution_at
```

rather than:

```text
"wait 700 ms after this packet arrived"
```

If a client receives the event late:

present appropriately without replaying obsolete suspense from the beginning.

---

# Finalization

Design a robust two-phase resolution model.

Recommended:

LOCK RPC:

* validates action
* determines result
* sets phase RESOLVING
* stores pending resolution
* stores resolution_at
* increments version

At/after resolution_at:

any connected client may call an idempotent:

```text
finalize_resolution(...)
```

Database verifies:

```text
resolution_at <= now()
```

Then:

SAFE:

```text
commit new bounds
rotate current player
start new turn/deadline
phase → PLAYING
```

BOOM:

```text
phase → FINISHED
loser recorded
```

This avoids clients independently advancing gameplay.

If all clients disconnect during RESOLVING:

first reconnecting client can finalize after deadline.

Evaluate this design against current Supabase constraints and propose a superior alternative if justified.

Do not require a permanent Node server merely for a 500–1000 ms timer.

---

# ============================================================

# BOOM RECIPIENT PRESENTATION

# ============================================================

Canonical outcome:

```text
BOOM
```

contains:

```text
loser_player_id
bomb_number
reason
round/game ID
```

The database does NOT decide volume.

Each client chooses presentation based on whether:

```text
auth/local player == loser_player_id
```

---

# Victim BOOM

The losing player's own device gets the existing full dramatic treatment.

Target:

```text
presentation profile:
VICTIM
```

Audio:

* 100% accepted BOOM profile
* full transient/body/sub mix
* ear ringing
* muffled aftermath

Visual:

* full permitted flash
* strong result takeover
* screen kick/shake respecting reduced motion

Haptics:

* strong BOOM pattern where supported

Current concept:

```text
[70, 30, 120]
```

The victim should receive the jumpscare.

---

# Spectator BOOM

Other players should not receive the full jumpscare.

Target:

```text
presentation profile:
SPECTATOR
```

Starting mix target:

```text
approximately 0.40–0.50 of victim result intensity
```

Recommended initial design:

```text
0.45 relative explosion impact
```

Do not simply alter the user's global volume preference.

Use a presentation-specific output/profile.

---

# Spectator audio

Retain a recognizable:

```text
BÙM
```

but:

* significantly quieter transient
* reduced low-frequency impact
* reduced tail
* no strong ear-ringing
* no aggressive muffled aftermath

Spectator should think:

```text
"Haha, Thiên nổ rồi."
```

not:

```text
"Why did my phone attack me too?"
```

---

# Spectator visuals

Still show result prominently:

```text
BÙM!

THIÊN AN ĐÃ CHỌN TRÚNG BOM

55
```

But use:

* smaller/lighter screen kick

No need to fully reduce the visual result identity.

---

# Spectator haptic

Use a lighter pattern than victim.

Propose exact target.

Example:

```text
victim:
[70, 30, 120]

spectator:
[30, 25, 45]
```

Tune during NB-3B QA.

---

# Timeout failure presentation

Define presentation profiles for:

```text
TIMEOUT_SELF_DESTRUCT
TIMEOUT_STRIKES_EXCEEDED
```

The losing player's device may use victim-style failure impact.

Spectators use moderate result treatment.

History/log must distinguish timeout from actually selecting the bomb.

---

# ============================================================

# DATABASE ARCHITECTURE

# ============================================================

Design the exact Supabase/Postgres schema.

Prefer a small understandable model.

Candidate entities:

```text
rooms
room_players
room_games
game_actions
```

Potential private/non-exposed game secret storage may also be used.

Do not add tables without a clear reason.

---

# Recommended room responsibilities

`rooms` should represent:

* room identity
* room code
* host
* room lifecycle
* host-controlled settings
* created/updated timestamps
* expiry/cleanup metadata

Settings may include:

```text
max_players
turn_timeout_seconds
timeout_policy
random_starter
show_live_selection
```

Determine whether these belong directly on rooms or a JSON/settings structure.

Prefer typed columns for core rules that require constraints/indexing.

---

# room_players

Design fields for:

* player ID
* room ID
* auth user ID
* nickname
* seat/order
* host relation if necessary
* connection/presence metadata
* joined time
* timeout strikes if strikes belong here

Consider whether timeout strikes belong in player state per active game instead.

Choose the cleanest normalized model.

---

# room_games

Design canonical active round/game state.

Likely responsibilities:

* game ID
* room ID
* status/phase
* round number
* lower bound
* upper bound
* candidate count derivability
* current player
* starter
* state version
* turn_started_at
* turn_deadline_at
* pending locked number
* pending actor
* pending result
* resolution_at
* loser
* finish reason
* created/finished timestamps

Do not persist redundant derived values unless justified.

---

# Bomb number

Use a canonical server-side bomb value generated once at game start.

It must remain constant throughout the round.

Do not regenerate it per turn.

Prefer keeping it out of ordinary client-readable game-state rows if doing so is simple.

A reasonable architecture is:

```text
non-exposed/private game secret storage
```

or equivalent RPC-only access.

This is basic correctness/hygiene, not a mandate for elaborate anti-cheat infrastructure.

Do not let secret handling dominate the architecture.

---

# game_actions

Strongly consider a compact canonical action/event history.

Useful for:

* debugging
* reconnect
* post-game history
* idempotency evidence
* testing

Events may include:

```text
PLAYER_LOCK
TIMEOUT_RANDOM
TIMEOUT_SELF_DESTRUCT
TIMEOUT_STRIKE
SAFE
BOOM
GAME_STARTED
GAME_FINISHED
```

Avoid duplicating every Realtime presence event.

Provisional selections should NOT be stored here.

---

# SQL enums/check constraints

Propose exact machine values for:

* room status
* game phase/status
* timeout policy
* action origin/type
* finish reason

Use either Postgres enums or text + CHECK constraints.

Explain the choice.

---

# Foreign keys

Specify:

* ownership
* cascade behavior
* restrict behavior

Avoid accidental deletion of a finished history due to one player leaving.

---

# Indexes

Specify only useful indexes.

At minimum evaluate:

* room code
* room ID on players
* auth user + room
* active room game
* game action ordering
* request/idempotency ID

---

# ============================================================

# DATA API / GRANTS / RLS

# ============================================================

The Supabase project was created with conservative API exposure.

NB-3B migrations must explicitly define grants/policies.

Design the exact access model.

Frontend uses:

```text
publishable key
authenticated anonymous user
```

Never require:

```text
database password
secret key
service-role key
```

inside Vite/browser code.

---

# RLS principle

Players may:

* read the room they belong to
* read players in that room
* read canonical public state for their room
* invoke allowed RPCs

Players may not directly update canonical game state tables.

Canonical mutations should go through RPC/functions.

---

# Host rules

Host-only actions:

* update lobby settings
* start game
* kick lobby player
* initiate replay/lobby transition where applicable

Define policy/RPC validation.

Do not trust a `host=true` value supplied by client.

Validate against canonical room host identity.

---

# RPC security

Design function strategy.

If using `SECURITY DEFINER`:

* explicitly set safe `search_path`
* validate `auth.uid()`
* validate room membership
* grant EXECUTE only as needed

Do not use `SECURITY DEFINER` carelessly.

---

# Realtime publication

Determine which tables genuinely require Postgres Changes.

Likely:

```text
rooms
room_players
room_games
```

`game_actions` may be optional for realtime if state already carries the needed result.

Define exact subscriptions.

---

# ============================================================

# REALTIME CONTRACT

# ============================================================

Separate:

```text
CANONICAL STATE
```

from:

```text
EPHEMERAL PRESENCE/PRESENTATION
```

---

# Canonical

Use database rows / Postgres Changes for state that must survive reconnect:

* room configuration
* player roster
* game phase
* bounds
* turn
* deadline
* resolution
* winner/loser
* state version

---

# Ephemeral

Use Realtime Broadcast/Presence for data that may safely disappear:

* live provisional selection
* typing/thinking-style activity
* connection/presence signal if useful

Do not use ephemeral broadcast as the only source of gameplay truth.

---

# Channel design

Propose a single room-scoped channel concept.

Example:

```text
room:<room-id>
```

Events might include:

```text
player_selection_changed
player_selection_cleared
```

Do not broadcast secret/canonical outcomes when Postgres state already handles them unless latency/product needs justify it.

---

# Presence

Decide whether Supabase Presence is useful for:

```text
connected
disconnected
last seen
```

Do not confuse Presence with durable room membership.

A player can be temporarily offline while remaining in `room_players`.

---

# ============================================================

# RECONNECT

# ============================================================

Reconnect is a V1 requirement.

Anonymous auth identity should allow the same browser profile to recover its seat.

Persist only appropriate local pointers such as:

```text
last room code / room ID
```

Do not trust localStorage as canonical identity.

Auth UID + database membership wins.

---

# Reconnect flow

On app load:

if anonymous auth session exists and local app remembers an online room:

attempt recovery.

Server/database determines:

* room still exists
* user still belongs
* game state
* current phase
* current deadline
* current resolution deadline

UI shows:

```text
ĐANG KẾT NỐI LẠI...
```

Then restores canonical state.

---

# Mid-turn reconnect

If current player reconnects before deadline:

they regain interaction.

If deadline already passed:

client should request timeout resolution/sync.

---

# During RESOLVING

If reconnect occurs after `resolution_at`:

request idempotent finalization.

Do not replay obsolete full suspense from zero.

---

# Disconnect grace

Design a simple 30–60 second UX grace concept.

Recommended starting point:

```text
45 seconds
```

During transient disconnect:

player remains seated.

Other clients may display:

```text
THIÊN AN MẤT KẾT NỐI
```

Do not automatically remove them immediately.

---

# Current player disconnect

If current player disconnects:

turn timer continues.

When deadline expires:

the configured timeout policy resolves naturally.

This reduces the need for complex AFK logic.

Host may get extra controls later.

Do not overbuild V1.

---

# ============================================================

# HOST DISCONNECT / MIGRATION

# ============================================================

Host leaving should not permanently kill a healthy lobby/game.

Design deterministic host migration.

Recommended:

```text
among connected/current room players
choose lowest seat/order after departing host
```

or oldest joined player.

Choose one exact rule.

Canonical host field updates transactionally.

If no players remain:

room becomes eligible for cleanup.

---

# ============================================================

# LEAVE / KICK

# ============================================================

Define behavior for:

* player voluntarily leaving lobby
* host kicking lobby player
* player leaving during active game
* host leaving during game

Keep V1 reasonable.

Possible policy:

Lobby:

```text
remove normally.
```

Active game:

```text
mark disconnected/left;
do not renumber active turn order destructively.
```

If current player permanently leaves:

timeout policy handles current turn, or define a deterministic forfeit.

Document exact behavior.

---

# ============================================================

# ROOM CLEANUP

# ============================================================

Avoid permanent abandoned room accumulation.

Design:

```text
expires_at
last_activity_at
```

and a cleanup strategy.

Possible V1:

finished/empty rooms expire after a practical TTL.

Do not require the frontend to delete all historical state immediately.

Propose whether Supabase scheduled cleanup is needed now or can be deferred.

---

# ============================================================

# GAME STATE MACHINE

# ============================================================

Provide an explicit authoritative state machine.

At minimum:

```text
LOBBY

→ PLAYING_TURN

→ RESOLVING

→ PLAYING_TURN

or

→ FINISHED
```

Then:

```text
FINISHED
→ REPLAY / NEW ROUND
or
→ LOBBY
```

Define allowed transitions and actor authority.

---

# Local engine reuse

Audit the existing reducer.

Determine what logic can be reused as:

```text
pure rules
```

versus what must move into Postgres/RPC.

Goal:

do not maintain two subtly different definitions of Number Bomb rules.

Propose a boundary such as:

```text
Local mode:
existing reducer is authoritative.

Online mode:
database is authoritative.

Shared:
candidate/range utility definitions
presentation/tension rules
UI formatting
```

Because TypeScript and Postgres cannot literally execute the same function, define tests/vectors that keep behavior aligned.

---

# ============================================================

# ONLINE RANDOMNESS

# ============================================================

Game bomb:

```text
server/database-generated once at round start.
```

Random starter:

```text
server/database-generated when game starts if enabled.
```

Timeout RANDOM_PICK:

```text
server/database chooses valid candidate.
```

Do not ask the acting client to provide any of these random outcomes.

Exact cryptographic anti-cheat strength is not the focus.

Correct centralized outcome generation is.

---

# ============================================================

# PRESENTATION CONTRACT

# ============================================================

Server decides:

```text
WHAT happened.
```

Client decides:

```text
HOW to present it.
```

Canonical server event/state must contain enough data for:

* actor
* locked number
* SAFE/BOOM/timeout result
* new bounds
* next player
* loser
* resolution time
* reason

Client determines:

* tension visuals
* soundscape
* haptic intensity
* victim vs spectator BOOM profile

---

# Live selection text

Spectator example:

```text
THIÊN AN ĐANG CHỌN SỐ 55
```

When LOCK becomes canonical:

```text
THIÊN AN ĐÃ KHÓA SỐ 55
```

Then:

```text
synchronized suspense

SAFE

or

BOOM
```

---

# Player's own screen

Do not redundantly write:

```text
THIÊN AN ĐANG CHỌN...
```

on the actor's screen if the normal selected-number UI is clearer.

Design copy per role:

```text
SELF
OTHER PLAYER
```

---

# ============================================================

# ONLINE AUDIO/HAPTICS CONTRACT

# ============================================================

Preserve existing local mix.

Do not fork the entire audio engine.

Add result presentation variants.

Conceptual API:

```text
playExplosion({
  variant: 'victim' | 'spectator'
})
```

or equivalent.

Do not lock exact API now if another clean architecture exists.

---

# Victim

Full accepted result.

---

# Spectator

Starting target:

```text
explosion intensity ~0.45
```

No strong ringing.

Lighter haptic.

Do not mutate global master volume to achieve this.

---

# Selection/LOCK SFX

Other clients may hear a restrained synchronized LOCK SFX.

Do not play every remote provisional-selection click loudly.

Decide whether remote selection change is:

```text
visual only
```

or very subtle SFX.

Preferred:

```text
visual only.
```

LOCK is the shared audible event.

---

# ============================================================

# FAILURE / ERROR UX

# ============================================================

Define user-facing states for:

* invalid room code
* room full
* room already playing
* nickname duplicate
* network unavailable
* Supabase unavailable
* authentication failure
* host left
* kicked from lobby
* stale turn action
* deadline already passed
* reconnecting
* room expired

Copy should be concise Vietnamese.

Do not expose raw Postgres errors to players.

---

# ============================================================

# ENVIRONMENT CONTRACT

# ============================================================

Expected client config:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

`.env.example` contains names only.

`.env.local` is ignored.

Never use frontend:

```text
database password
service_role
secret API key
```

Design a startup/config boundary so:

local mode works even if Supabase values are absent.

Online button may show a clear unavailable state if configuration is missing.

---

# ============================================================

# PROPOSED TYPES

# ============================================================

Provide conceptual TypeScript contracts for at least:

```text
OnlineRoom

OnlinePlayer

OnlineGameState

OnlineRoomSettings

TimeoutPolicy

GamePhase

CanonicalAction

PendingResolution

RealtimeSelectionEvent

ExplosionPresentationVariant

OnlineConnectionState
```

Do not implement them in source during NB-3A.

---

# ============================================================

# RPC CONTRACT

# ============================================================

Provide final proposed signatures and responsibilities.

At minimum evaluate:

```text
create_room(...)

join_room(...)

update_room_settings(...)

start_game(...)

lock_number(...)

resolve_turn_timeout(...)

finalize_resolution(...)

restart_game(...)

return_to_lobby(...)

leave_room(...)

kick_player(...)

claim/reassign host if necessary
```

Do not add an RPC simply because a name sounds useful.

For each accepted RPC specify:

* caller
* inputs
* validation
* transaction mutation
* return value
* idempotency behavior
* errors

---

# ============================================================

# SCHEMA CONTRACT

# ============================================================

Return a concrete schema table.

For every table:

```text
column
type
nullable
default
constraint
purpose
```

Also specify:

* primary keys
* foreign keys
* unique constraints
* indexes
* RLS
* grants
* Realtime publication

This must be detailed enough for NB-3B to write migrations without redesigning architecture.

---

# ============================================================

# MIGRATION PLAN

# ============================================================

NB-3A must propose ordered migrations.

Example structure:

```text
001_online_types_and_tables.sql
002_online_indexes_constraints.sql
003_online_rls_grants.sql
004_online_rpc_rooms.sql
005_online_rpc_gameplay.sql
006_online_realtime.sql
```

Exact naming may differ.

Explain dependencies.

Do not execute them.

---

# ============================================================

# IMPLEMENTATION SEQUENCE FOR NB-3B

# ============================================================

Define a safe implementation order.

Recommended conceptual order:

1. dependency/client config
2. anonymous auth
3. migrations/schema
4. generated/manual DB types
5. online data service/RPC facade
6. room create/join
7. lobby
8. game synchronization
9. provisional selection broadcast
10. timer/timeout
11. resolving/finalization
12. victim/spectator presentation
13. reconnect
14. host/leave behavior
15. mobile QA
16. E2E multi-context tests

Codex may improve the order.

---

# ============================================================

# TEST PLAN

# ============================================================

Design the tests required for NB-3B.

Unit:

* room-code normalization
* presentation mapping
* timeout policy mapping
* victim/spectator profile
* countdown formatting

Database/integration:

* create room
* join room
* room full
* duplicate nickname
* host-only settings
* start with 2–4 players
* invalid turn rejected
* invalid number rejected
* SAFE transition
* BOOM transition
* state version conflict
* duplicate request ID
* simultaneous lock race
* simultaneous timeout race
* timeout SELF_DESTRUCT
* timeout RANDOM_PICK
* timeout first strike
* timeout second strike
* timeout random hitting bomb
* resolution cannot finalize early
* resolution finalizes once
* host migration

Realtime/E2E:

Use multiple isolated browser contexts.

Example:

```text
Browser A = player A
Browser B = player B
Browser C = player C
```

Prove:

* all see same roster
* all see same current player
* only current player can interact
* provisional selection appears remotely
* provisional selection is not canonical
* LOCK synchronizes
* range synchronizes
* countdown derives from same deadline
* SAFE presentation happens approximately together
* victim BOOM gets victim profile
* spectators get spectator profile
* reconnect recovers seat/state
* page reload does not duplicate player
* stale action cannot mutate state
* replay works

---

# Presentation synchronization tolerance

Specify a practical QA tolerance.

For example:

```text
result presentation onset between active clients
within approximately 100–200 ms
under local/test conditions.
```

Do not promise Internet-wide frame-perfect synchronization.

Define a reasonable target.

---

# ============================================================

# NON-GOALS

# ============================================================

Explicitly exclude from Online V1:

* chat
* friends system
* accounts/profile system
* leaderboards
* ranked play
* public matchmaking
* spectator seats
* voice chat
* anti-cheat arms race
* custom 1–999 ranges
* more than 4 players
* elimination tournament mode

This gate is already large.

---

# ============================================================

# QUESTIONS NB-3A MUST RESOLVE

# ============================================================

Do not return vague questions that can be answered from product requirements.

Make a recommendation.

Resolve:

1. Exact schema.
2. Exact game phases.
3. Exact timeout enum.
4. Exact timer defaults.
5. Exact host migration rule.
6. Whether Ready state exists.
7. How duplicate nicknames work.
8. Exact room-code format.
9. Exact Realtime channel strategy.
10. Exact provisional-selection flow.
11. Exact resolution/finalization flow.
12. Exact reconnect identity strategy.
13. Exact victim/spectator audio contract.
14. Where timeout strikes live.
15. How abandoned rooms expire.

Only leave an OPEN QUESTION if Product Owner genuinely must choose between materially different product behaviors.

---

# ============================================================

# REQUIRED FINAL REPORT

# ============================================================

Return:

```text
NB-3A:

PASS | FAIL


BASELINE:

HEAD:
<commit>

WORKTREE:
<status>

LOCAL V1 PRESERVED:
YES / NO


ONLINE PRODUCT:

PLAYER COUNT:
<contract>

AUTH:
<contract>

ROOM CODE:
<contract>

READY STATE:
YES / NO + reason

HOST MIGRATION:
<contract>

RECONNECT:
<contract>


ROOM SETTINGS:

TURN TIMER:
<contract>

DEFAULT:
<value>

TIMEOUT POLICY:
SELF_DESTRUCT
RANDOM_PICK
RANDOM_PICK_WITH_2_STRIKES

SHOW LIVE SELECTION:
<contract>

RANDOM STARTER:
<contract>


TIMEOUT:

SELF_DESTRUCT:
<exact behavior>

RANDOM_PICK:
<exact behavior>

2 STRIKES:
<exact behavior>

CONCURRENCY:
<contract>


STATE MACHINE:

<exact phases/transitions>


SCHEMA:

TABLES:
<list>

PRIVATE SECRET STORAGE:
<contract>

KEY CONSTRAINTS:
<summary>

INDEXES:
<summary>


RLS / GRANTS:

<exact policy model>


RPC:

<final function list + one-line purpose each>


REALTIME:

POSTGRES CHANGES:
<contract>

BROADCAST:
<contract>

PRESENCE:
<contract>


LIVE SELECTION:

ON:
<behavior>

OFF:
<behavior>

CANONICAL:
NO


RESOLUTION:

LOCK:
<contract>

RESOLUTION_AT:
<contract>

FINALIZATION:
<contract>

SAFE/BOOM TIMING LEAK:
NONE / ISSUE


BOOM PRESENTATION:

VICTIM:
<audio/visual/haptic>

SPECTATOR:
<audio/visual/haptic>

INITIAL SPECTATOR IMPACT TARGET:
<value>

RINGING ON SPECTATOR:
YES / NO


ENVIRONMENT:

CLIENT VARS:
<list>

LOCAL MODE WITHOUT SUPABASE:
PASS BY DESIGN / ISSUE


MIGRATION PLAN:

<ordered files/steps>


NB-3B IMPLEMENTATION ORDER:

<ordered plan>


TEST PLAN:

UNIT:
<summary>

DATABASE:
<summary>

MULTI-CLIENT E2E:
<summary>


RISKS:

<top risks and mitigations>


OPEN PRODUCT QUESTIONS:

NONE

or only genuine Product Owner decisions.


SOURCE FILES MODIFIED:

Expected:
NONE
except optional architecture documentation if explicitly created.


COMMIT:
NO

PUSH:
NO

DEPLOY:
NO
```

---

# Stop conditions

Stop and report rather than entering implementation if:

* current V1 architecture makes the proposed contract impossible without a core redesign;
* Online requires breaking local mode;
* Supabase configuration is missing in a way that prevents meaningful architecture audit;
* a product rule remains genuinely ambiguous enough to affect schema design.

Do not create database objects just to "test the idea."

---

# Successful line

```text
NB-3A PASS — ONLINE UX CONTRACT DEFINED — SUPABASE SCHEMA/RPC/REALTIME CONTRACT DEFINED — TIMER/TIMEOUT RULES DEFINED — SYNCHRONIZED PRESENTATION DEFINED — READY FOR NB-3B IMPLEMENTATION
```
