# NB-2 — Focus Range + Viewport + Audio Tension Polish

## Mission

Polish the existing **BOM SỐ — Đừng chọn sai.** implementation without changing its core game rules.

This gate addresses two Product Owner findings:

1. The active number range loses visual focus because already-safe numbers remain as layout placeholders.
2. Existing sound is functional but does not yet create enough psychological tension.

This is an implementation gate.

Source, CSS, tests, and presentation/audio architecture may be changed as required.

Do not change the fundamental game rules.

---

# Product intent

BOM SỐ is a local 2–4 player party/game-show thriller.

Its tension comes from:

```text
many possibilities
→ shrinking range
→ fewer safe-looking choices
→ increasing psychological pressure
→ LOCK
→ silence
→ SAFE or BOOM
```

The visual and audio presentation must reinforce this curve.

The game should become **more focused** as the candidate set shrinks.

It must not continue visually carrying the dead weight of numbers already proven safe.

---

# Current verified foundation

The existing implementation already has:

```text
2–4 player hot-seat setup
optional player names
randomized starting player
reducer-based game logic
cryptographic bomb randomness
1–99 default range
adaptive critical/final states
SAFE/BOOM presentation
Web Audio
persistent mute
responsive UI
keyboard accessibility
ARIA
reduced motion
deterministic E2E support
unit tests
Playwright E2E
production build
```

Preserve these capabilities unless this gate explicitly refines their presentation.

---

# Baseline safety

Before modifying anything, record:

```text
git status --short
git rev-parse --show-toplevel
git rev-parse HEAD
git diff --stat
git diff --name-only
```

If the repository is intentionally dirty:

```text
DO NOT RESET
DO NOT DISCARD UNRELATED CHANGES
```

Physical repository truth wins.

Do not:

```text
commit
push
deploy
rewrite unrelated source
change game rules without explicit need
```

---

# ============================================================

# PART A — ACTIVE RANGE VISUAL FOCUS

# ============================================================

## Observed problem

Current behavior can reach a state such as:

```text
Current valid range:
63–85

Candidates remaining:
23
```

while the board continues to visually occupy space for:

```text
1–99
```

Numbers outside the valid range are dimmed, but they still consume the primary layout.

This creates four UX problems:

```text
1. The dangerous numbers are pushed below the fold.
2. The user must scroll to reach the actual decision area.
3. Important HUD information leaves the viewport.
4. Psychological focus remains on a 99-number wall even though only 23 numbers matter.
```

This is not the desired behavior.

---

# New primary-board rule

After the candidate range shrinks, the **primary number board must focus on active candidate numbers only**.

Example:

Current valid range:

```text
63–85
```

Primary gameplay board should render/focus on:

```text
63 64 65 66 67 68 69 70 71 72 73 74 75
76 77 78 79 80 81 82 83 84 85
```

Numbers outside the candidate range must no longer occupy primary-board grid cells.

They may remain in game history/state internally.

They may optionally be represented in a secondary history/range visualization if useful.

They must **not** consume primary gameplay layout.

Do not create empty placeholders for eliminated numbers.

---

# Game logic remains authoritative

This visual change must not redefine game truth.

The reducer/game engine remains responsible for determining:

```text
lower valid bound
upper valid bound
candidate count
whether a number is selectable
bomb resolution
turn rotation
```

The primary board derives its rendered candidate collection from authoritative game state.

Do not create a separate UI-only candidate truth.

---

# Candidate centering

The current candidate group must be visually centered inside the gameplay stage.

The board should feel increasingly concentrated around danger.

Do not simply left-align a shrinking list into a large empty container.

Use layout rules that produce a balanced centered composition.

Examples:

```text
23 remaining
→ compact centered grid

10 remaining
→ larger centered grid

5 remaining
→ large choice cards

3 remaining
→ three dominant danger choices

2 remaining
→ two very large choices

1 remaining
→ dedicated inevitable-candidate state
```

---

# Adaptive layout targets

These values are guidance, not immutable pixel contracts.

Choose the best responsive implementation.

## Large candidate set

Approximately:

```text
31–99 candidates
```

Use a compact grid.

On wide desktop, prefer enough columns that the board fits within the viewport.

Possible targets:

```text
>= 1500 px viewport:
~15 columns

1200–1499 px:
~13 columns

900–1199 px:
~11 columns
```

Do not force these exact counts if CSS Grid can produce a better responsive result.

The requirement is:

```text
opening board remains readable
+
desktop height remains controlled
```

---

## Medium candidate set

Approximately:

```text
11–30 candidates
```

Only active candidates should appear.

Increase spacing and visual weight.

Keep the complete candidate set near the visual center of the board.

The state:

```text
63–85
23 candidates
```

must not require the user to scroll through eliminated `1–62` first.

---

## Danger candidate set

Approximately:

```text
6–10 candidates
```

Increase:

```text
number size
cell size
spacing
danger emphasis
```

Reduce irrelevant surrounding UI noise.

---

## Critical candidate set

```text
2–5 candidates
```

Render the remaining candidates as high-stakes central choices.

They should feel much larger than opening-round number cells.

Avoid maintaining a large empty “99 number” board frame around them.

---

## Final candidate

When exactly one candidate remains:

Do not show a normal selection grid pretending there is still a choice.

Use the existing/special inevitable-result presentation.

Example intent:

```text
CHỈ CÒN MỘT CON SỐ.

29
```

Current player understands that the bomb is inevitable.

Preserve whatever deliberate confirm/detonate interaction already exists if it is working correctly.

---

# ============================================================

# PART B — VIEWPORT FIT

# ============================================================

## Desktop product requirement

Normal desktop gameplay should prioritize fitting inside one usable viewport.

Target typical desktop/laptop sizes including:

```text
1920×1080
1728×864
1440×900
1366×768
```

At normal browser zoom:

The player should not need vertical scrolling merely to:

```text
see current player
see current range
see candidate count
see system/tension status
see the active candidate board
make a selection
confirm the selection
```

A small tolerance for very short-height devices is acceptable.

Do not design desktop around mandatory scroll.

---

# Header compression

The current visual identity should remain.

Keep:

```text
BOM SỐ
Đừng chọn sai.
turn number
audio control
```

But review vertical padding and unused space.

The header should feel deliberate and compact.

Do not shrink typography until it loses personality.

---

# Status/HUD preservation

The information currently represented by:

```text
LƯỢT HIỆN TẠI
PHẠM VI HỢP LỆ
CÒN LẠI
TRẠNG THÁI HỆ THỐNG
```

is important gameplay information.

It must remain visible during normal desktop number selection.

Especially preserve:

```text
TRẠNG THÁI HỆ THỐNG
```

The tension state is part of the game experience and must not disappear merely because the user has scrolled down to active numbers.

Possible implementation strategies:

```text
fit everything without scroll
compact HUD
sticky HUD
responsive HUD compression
```

Prefer true viewport fit on desktop.

Use sticky behavior where beneficial on constrained/mobile layouts.

---

# Mobile HUD

Mobile may scroll vertically.

Horizontal scrolling is forbidden.

When vertical scrolling occurs, preserve a compact gameplay status surface containing at least:

```text
current player
valid range
candidate count
tension state
```

Consider a compact sticky status bar below the main header.

Do not allow the active decision area to become disconnected from the game state.

---

# Selection/action bar

The selection confirmation control must not cover candidate numbers.

Current controls may include concepts such as:

```text
SỐ ĐÃ CHỌN
ĐỔI SỐ
KHÓA SỐ
```

On desktop:

Prefer positioning it naturally within the gameplay composition.

If sticky/fixed positioning remains, reserve actual layout space for it.

No active candidate may be hidden underneath the action bar.

On mobile:

Sticky confirmation is acceptable if it improves reachability, but again it must not obscure candidate content.

---

# Helper copy

Instructional copy such as:

```text
Chạm hoặc dùng bàn phím để chọn một số
```

is useful during onboarding.

It does not need to consume prominent vertical space forever.

Consider:

```text
more compact presentation
reduced prominence after first interaction
integration into footer/action area
```

Do not remove necessary accessibility guidance.

---

# ============================================================

# PART C — TENSION MODEL

# ============================================================

Create or refine a single presentation-level tension model derived from candidate count.

Do not duplicate unrelated tension calculations across CSS and audio components.

Suggested conceptual levels:

```text
CALM
UNEASY
DANGER
CRITICAL
TERMINAL
```

Suggested mapping:

```text
31+ candidates:
CALM

16–30:
UNEASY

8–15:
DANGER

4–7:
CRITICAL

1–3:
TERMINAL
```

The exact thresholds may be tuned if current game presentation already has a useful model.

One source of truth should drive both:

```text
visual atmosphere
audio atmosphere
```

---

# Visual properties influenced by tension

Possible properties:

```text
accent hue
danger glow
background pressure
border intensity
system status meter
subtle pulse
glitch frequency
selection emphasis
resolution pacing
```

Important:

Do not make the entire game red from the opening turn.

There must be room to escalate.

Expected progression:

```text
CALM
dark / teal / neutral

UNEASY
yellow / amber warning

DANGER
stronger amber/red transition

CRITICAL
red warning

TERMINAL
high-pressure red / unstable terminal state
```

Preserve the current cyber-terminal visual identity.

This is polish, not a redesign into a different game.

---

# ============================================================

# PART D — AUDIO TENSION REDESIGN

# ============================================================

## Goal

Existing audio is functional.

This gate must make it psychologically unsettling.

The desired sound language is:

```text
fictional dangerous terminal
electrical device
mechanical relay
low-frequency pressure
irregular machine activity
heartbeat under danger
strategic silence
violent but controlled BOOM
```

Avoid:

```text
cheerful arcade beeps
casino success sounds
bright notification dings
constant loud horror noise
realistic military audio
copyrighted third-party assets unless explicitly provided
```

Prefer Web Audio synthesis and internally generated textures.

Keep the audio architecture replaceable so custom recorded assets can be introduced later.

---

# Audio layer 1 — Ambient low drone

During active gameplay, introduce a subtle low-frequency ambient bed.

Goal:

The player should often **feel it before consciously noticing it**.

Possible technique:

```text
low oscillator / blended oscillators
very low gain
low-pass filtered noise
slow modulation
```

Approximate spectral region:

```text
40–80 Hz fundamental pressure
+
subtle low-mid texture
```

Do not create an obnoxious constant hum.

The drone should remain restrained in CALM state.

Its presence/intensity may increase slightly with tension.

---

# Audio layer 2 — Irregular electrical texture

Add occasional:

```text
relay click
electrical tick
static burst
terminal crackle
tiny mechanical switching noise
```

Critical requirement:

Timing must not be perfectly periodic.

Do not create:

```text
tick...
tick...
tick...
tick...
```

like a metronome.

Use irregular scheduling.

Example conceptual spacing:

```text
1.5s
4.2s
2.1s
5.0s
...
```

Tension may influence average frequency.

Keep these effects subtle.

Optional very light stereo panning may be used for electrical texture.

Do not pan the core heartbeat aggressively.

---

# Audio layer 3 — Adaptive heartbeat

Heartbeat should not dominate the opening game.

Suggested behavior:

```text
31+ candidates:
off or nearly imperceptible

16–30:
slow and subtle

8–15:
clearly audible

4–7:
fast / strong

1–3:
high-pressure heartbeat
```

Escalation should involve more than volume.

Vary:

```text
BPM
spacing
low-frequency energy
attack
gain
```

Avoid clipping.

Do not make it painfully loud.

---

# Resolution silence rule

This is a critical dramatic requirement.

When the player confirms:

```text
KHÓA SỐ
```

the established soundscape must not simply continue unchanged.

Sequence concept:

```text
heartbeat / ambient tension
→ LOCK
→ sudden duck/cut
→ brief silence
→ result
```

Target silence window:

approximately:

```text
350–600 ms
```

Adjust for existing animation timing.

Silence should feel intentional.

It is part of the jumpscare/tension design.

---

# Lock sequence

Current presentation concepts such as:

```text
ĐANG QUÉT // KHÓA TẦN SỐ
75
ĐANG ĐỐI CHIẾU VỚI SỐ BOM
```

are visually appropriate.

Audio should reinforce this sequence with restrained machine texture.

Do not fill the entire wait with loud scanning beeps.

Allow anticipation to build.

---

# SAFE sound

SAFE must not sound celebratory.

Avoid:

```text
ding
coin
success chime
happy UI notification
```

Desired character:

```text
mechanical relay
heavy switch
electrical latch
dry confirmation
```

Concept:

```text
... silence ...

CLACK.

AN TOÀN
```

After SAFE:

resume the ambient soundscape at the new tension level.

Because the range is smaller, the resumed atmosphere may now be more dangerous than before.

---

# BOOM sound

BOOM must be a layered impact, not one generic beep or single oscillator burst.

Build at least conceptual layers:

## 1. Transient

Very short sharp noise:

```text
KRAK
```

High/mid-frequency attack.

---

## 2. Low impact

Strong low-frequency hit:

```text
WHUMP
```

Approximate region:

```text
35–60 Hz
```

Decay roughly:

```text
400–700 ms
```

Tune safely.

---

## 3. Distortion/static

Very short post-impact electrical destruction texture:

```text
ZZT / glitch / static
```

---

## 4. Tail

Low rumble / filtered noise tail:

approximately:

```text
0.8–1.5 s
```

The combined impression should resemble:

```text
KRAK — WHUMMMM — zzt
```

not:

```text
beep
```

---

# BOOM visual/audio synchronization

Synchronize major audio transient with:

```text
brief flash
single strong screen shake
red impact state
BÙM typography
```

Do not use repeated rapid flashes.

Recommended flash:

```text
~50–80 ms
```

One strong impact is preferable to a long strobe.

Respect reduced-motion preferences.

---

# Volume safety

Jumpscare does not mean uncontrolled loudness.

Do not produce a huge gain spike relative to normal gameplay.

Manage:

```text
master gain
compression if useful
layer gains
decay
```

The psychological surprise should come from:

```text
contrast
silence
timing
frequency
visual synchronization
```

not raw volume abuse.

---

# Mute behavior

Preserve:

```text
visible mute/unmute control
localStorage mute preference
browser autoplay restrictions
audio unlock after explicit interaction
```

No sound should violate browser autoplay policies.

---

# ============================================================

# PART E — RESPONSIVE BEHAVIOR

# ============================================================

## Desktop

Priority:

```text
status visible
active range centered
minimal/no vertical scroll
confirmation reachable
```

The opening 99-number board may use more columns to reduce rows.

Once the range shrinks:

do not preserve the geometry of the old 99-number board.

Reflow the candidates.

---

## Mobile

Mobile may use vertical scroll.

Requirements:

```text
no horizontal overflow
comfortable touch targets
candidate numbers remain easy to select
active range remains visually dominant
compact sticky status if needed
confirmation controls reachable
```

Do not force a 15-column desktop grid onto mobile.

---

# ============================================================

# PART F — ACCESSIBILITY

# ============================================================

Preserve existing accessibility behavior.

Candidate buttons must remain:

```text
keyboard accessible
clearly focused
correctly labelled
```

Numbers no longer in the candidate set should not remain as hundreds of useless keyboard-focusable placeholders.

Primary tab order should naturally reflect current actionable candidates.

Maintain appropriate:

```text
aria-live
disabled semantics where applicable
dialog semantics
focus management
```

Respect:

```text
prefers-reduced-motion
```

Reduced-motion BOOM must retain:

```text
audio impact if audio enabled
brief color/opacity transition
clear result communication
```

without aggressive screen movement.

---

# ============================================================

# PART G — GAME LOGIC NON-REGRESSION

# ============================================================

Do not change:

```text
bomb generation semantics
candidate-bound semantics
SAFE range reduction
turn rotation
2-player behavior
3-player behavior
4-player behavior
losing-player determination
restart rules
final-candidate rules
```

Any presentation refactor must continue to consume the reducer as source of truth.

---

# Candidate truth example

If:

```text
bomb = 81
```

and current state is:

```text
63–85
```

then the UI may show:

```text
63 ... 85
```

If player chooses:

```text
75
```

and it is SAFE below the bomb:

new authoritative range becomes:

```text
76–85
```

The primary board should then reflow around:

```text
76 77 78 79 80 81 82 83 84 85
```

Do not continue laying out:

```text
1–75
86–99
```

as dead grid geometry.

---

# ============================================================

# PART H — TESTS

# ============================================================

Run all existing tests.

Add/update tests needed to prove the new presentation behavior.

---

## Unit tests

Where appropriate, test:

```text
tension mapping by candidate count
audio tension parameter derivation
candidate display selector/helper
```

Do not over-test CSS internals.

---

## E2E — desktop viewport

At minimum verify desktop states at representative resolutions:

```text
1440×900
1366×768
```

At the opening 99-number state:

```text
game controls visible
board reachable
no unnecessary body vertical overflow if feasible
```

After shrinking to approximately:

```text
20–30 candidates
```

prove:

```text
eliminated numbers no longer occupy primary board cells
current candidate set is visible
system HUD remains visible
candidate group is centered/reflowed
```

---

## E2E — active range

Force deterministic bomb state.

Example:

```text
bomb = 81
```

Drive the game until:

```text
63–85
```

Assert that the primary board contains only currently valid candidate numbers.

The exact DOM strategy may differ, but user-facing board truth must be:

```text
63 through 85
```

not a 99-cell disabled board.

---

## E2E — critical states

Verify visual/playable states for:

```text
10 candidates
5 candidates
3 candidates
2 candidates
1 candidate
```

At 3 candidates:

choices should be visibly large and dominant.

At 1 candidate:

special final state must activate correctly.

---

## E2E — selection bar

Verify:

```text
selection/lock controls do not cover active candidate buttons
```

Use bounding boxes if useful.

---

## E2E — mobile

At:

```text
390×844
```

verify:

```text
no horizontal overflow
candidate grid reflows
HUD remains understandable
selection control reachable
```

Vertical scroll is allowed.

---

## Audio testing

Do not attempt brittle waveform-perfect E2E tests.

Test deterministic presentation parameters where practical.

Examples:

```text
candidate count → heartbeat intensity/BPM
candidate count → ambient level
LOCK → tension duck state
SAFE → resume state
BOOM → explosion sequence invoked
mute persistence
```

---

# ============================================================

# PART I — VISUAL QA

# ============================================================

Manual/automated screenshot QA must inspect:

```text
setup
99 candidates
~23 candidates
10 candidates
5 candidates
3 candidates
1 candidate
lock/scanning state
SAFE
BOOM
```

At minimum use:

```text
desktop wide
desktop laptop
mobile
```

Explicitly inspect:

```text
Is TRẠNG THÁI HỆ THỐNG still visible?

Are active candidates the visual focus?

Are eliminated safe numbers gone from primary layout?

Does the candidate cluster feel centered?

Does any action bar overlap candidate buttons?

Does the game become visually more intense as the range shrinks?

Does the layout reduce rather than accumulate empty/dead space?
```

---

# ============================================================

# PART J — AUDIO QA

# ============================================================

Listen through at least one deterministic full game.

Verify:

## Opening

```text
restrained atmosphere
no annoying heartbeat
no constant loud noise
```

## Mid-game

```text
subtle unease
irregular electrical activity
```

## 10 or fewer

```text
heartbeat clearly contributes to pressure
```

## 3 or fewer

```text
audio is noticeably more intense than opening
```

## LOCK

```text
heartbeat/ambient is deliberately ducked or stopped
silence is perceptible
```

## SAFE

```text
mechanical/dry
not cheerful
soundscape resumes
```

## BOOM

```text
sharp transient
low impact
distorted/static texture
tail
visual sync
no painful volume spike
```

---

# ============================================================

# PART K — VERIFICATION

# ============================================================

Run:

```text
typecheck
lint
unit tests
Playwright E2E
production build
```

Use the repository's actual npm scripts.

All must pass.

If a pre-existing unrelated failure exists, prove it clearly rather than silently changing unrelated code.

---

# Required final report

Return:

```text
NB-2:

PASS | FAIL

BASELINE:
<HEAD/status>

CORE GAME LOGIC CHANGED:
YES / NO
expected: NO

ACTIVE RANGE:

PRIMARY BOARD:
<implementation>

ELIMINATED PLACEHOLDERS:
REMOVED / STILL PRESENT

CENTERING:
<implementation>

99-CANDIDATE VIEW:
<result>

~23-CANDIDATE VIEW:
<result>

10-CANDIDATE VIEW:
<result>

5-CANDIDATE VIEW:
<result>

3-CANDIDATE VIEW:
<result>

1-CANDIDATE VIEW:
<result>


VIEWPORT:

1440×900:
<result>

1366×768:
<result>

390×844:
<result>

SYSTEM HUD:
VISIBLE / ISSUE

ACTION BAR OVERLAP:
NONE / ISSUE


TENSION MODEL:

LEVELS:
<exact mapping>

VISUAL DRIVERS:
<summary>

AUDIO DRIVERS:
<summary>


AUDIO:

AMBIENT DRONE:
<implementation>

ELECTRICAL TEXTURE:
<implementation>

HEARTBEAT:
<implementation>

LOCK SILENCE:
<implementation/timing>

SAFE:
<implementation>

BOOM:
<layers/timing>

MUTE:
<result>

REDUCED MOTION:
<result>


TESTS:

TYPECHECK:
PASS / FAIL

LINT:
PASS / FAIL

UNIT:
PASS / FAIL
<count>

E2E:
PASS / FAIL
<count>

BUILD:
PASS / FAIL


VISUAL QA:
<states/resolutions checked>

AUDIO QA:
<states listened/tested>


UNRELATED WORKTREE CHANGES:
PRESERVED / NONE / ISSUE

COMMIT:
NO

PUSH:
NO

DEPLOY:
NO
```

---

# Stop conditions

Stop and report rather than masking the problem if:

```text
candidate range truth becomes duplicated
game reducer semantics must be changed to accomplish presentation
audio implementation causes browser instability
desktop viewport fit requires inaccessible touch/click targets
mobile gains horizontal overflow
existing unrelated worktree changes would need to be destroyed
```

---

# Product principle

The number wall is useful when the game has many possibilities.

It must not become visual baggage after those possibilities are gone.

The intended progression is:

```text
99 numbers
→ broad field

23 numbers
→ focused cluster

10 numbers
→ dangerous choices

5 numbers
→ confrontation

3 numbers
→ almost no escape

1 number
→ inevitability
```

At the same time, sound should progress:

```text
quiet machine
→ unease
→ heartbeat
→ pressure
→ silence
→ SAFE / BOOM
```

The game must feel as though the interface itself is closing in on the current player.

---

Successful line:

```text
NB-2 PASS — ACTIVE RANGE RECENTERED — DESKTOP VIEWPORT FOCUSED — SYSTEM HUD PRESERVED — ADAPTIVE CREEPY AUDIO TENSION VERIFIED
```
