# NB-2R — Mobile Game Shell + Scrollable Number Field + Haptics

## Mission

Perform the final responsive/mobile presentation gate for:

BOM SỐ
Đừng chọn sai.

Current desktop gameplay is accepted.

Do NOT redesign desktop.

The Product Owner manually inspected the game in Chrome responsive mode and found that mobile currently behaves like a desktop canvas being clipped by a narrow viewport.

That is not acceptable.

Mobile must become a deliberate layout.

Core mobile composition:

┌─────────────────────────┐
│ COMPACT GAME STATUS     │
├─────────────────────────┤
│                         │
│ CANDIDATE NUMBER FIELD  │
│                         │
│   vertical scroll only  │
│   when necessary        │
│                         │
├─────────────────────────┤
│ SELECTED      KHÓA SỐ   │
└─────────────────────────┘

The player must be able to use BOM SỐ comfortably on a real phone with one hand.

---

# Baseline

NB-2 / NB-2H / NB-2P / NB-2M behavior must remain intact.

Preserve:

- candidate-only rendering
- tension model
- adaptive interaction SFX
- adaptive BOOM contrast
- randomized tension-dependent resolution delay
- creepy soundscape
- SAFE behavior
- BOOM + ringing aftermath
- audio lifecycle cleanup
- mute persistence
- desktop one-viewport gameplay where already achieved

Do not change core reducer/game semantics.

---

# Runtime hygiene before layout work

Product Owner mobile QA screenshot currently shows a React development warning:

"The final argument passed to useEffect changed size between renders.
The order and size of this array must remain constant."

It references a GameScreen/audio-related effect.

Because recent work changed callback signatures, this may be a Vite Fast Refresh retained-runtime artifact.

Do not assume either way.

First:

1. perform a full hard reload / fresh browser runtime;
2. reproduce gameplay;
3. inspect Console.

If the warning disappears completely in a fresh runtime:

REPORT:
FAST REFRESH ARTIFACT VERIFIED

Do not make unnecessary code changes.

If the warning persists in a fresh runtime:

FIX IT.

useEffect dependency arrays must have stable length and ordering between renders.

Forbidden workaround:

- suppressing console
- ignoring the warning
- conditional dependency arrays
- try/catch around React
- removing required dependencies merely to silence lint

NB-2R may not PASS with fresh-runtime React page errors.

---

# Scope

Likely areas:

src/components/*
src/styles/*
src/presentation/*
src/audio/*
responsive CSS
mobile layout components/helpers
tests

Physical repository truth wins.

Do not perform unrelated redesign.

---

# Breakpoint policy

Use CSS/responsive layout behavior.

Do NOT use user-agent sniffing.

Primary mobile shell target:

<= 640px

Desktop/tablet behavior above that threshold should preserve the accepted current layout unless minor breakpoint smoothing is required.

Do not detect "iPhone", "Android", etc.

---

# MOBILE PRODUCT PHILOSOPHY

Mobile is NOT:

"desktop scaled down until it almost fits."

Mobile IS:

"a compact control surface for the same game."

Preserve the information hierarchy, not every desktop label.

Desktop may remain information-rich.

Mobile may deliberately remove redundant copy.

---

# ============================================================
# PART A — MOBILE SHELL
# ============================================================

Use viewport-aware sizing.

Prefer:

100dvh

with sensible fallback if necessary.

The gameplay screen should conceptually contain:

1. top compact HUD
2. center board viewport
3. bottom action dock

The center receives remaining height.

Avoid making the entire document 1500–2500 px tall when playing.

---

# Top HUD

The top gameplay information must stay reachable/visible while the player scrolls through a large 99-number opening board.

Preferred behavior:

sticky or structurally fixed within the mobile game shell.

Do not blindly copy the large desktop dashboard.

---

# Required top information

Mobile must retain:

- BOM SỐ identity
- current player
- valid candidate range
- candidate count
- system/tension state in a compact form
- sound control
- haptics control when supported

Example conceptual layout:

BOM SỐ                 🔊  📳

P1  Player 1
01–99 · 99             ● ỔN ĐỊNH

Exact layout may differ.

---

# Mobile labels

Values are more important than verbose labels.

Desktop currently contains information such as:

LƯỢT HIỆN TẠI
PHẠM VI HỢP LỆ
CÒN LẠI
TRẠNG THÁI HỆ THỐNG
TIẾP THEO
PHẠM VI ĐANG HOẠT ĐỘNG
xx ĐIỂM NGUY HIỂM
LƯỢT 01

On mobile, redundant text may be reduced or removed.

Do not remove gameplay-critical values.

Good compression examples:

PHẠM VI HỢP LỆ 01–99
+
CÒN LẠI 99

may become:

01–99 · 99 SỐ

System state may become:

● ỔN ĐỊNH

instead of retaining the full desktop meter plus multiple descriptive labels.

---

# Turn-order information

The full desktop:

Player 1 > Player 2

"TIẾP THEO"

row is optional on mobile.

If it causes vertical waste, simplify or remove it.

Current player remains mandatory.

Turn transition after SAFE must remain obvious.

---

# Header height

Keep the top zone compact.

Do not consume 30–40% of a phone screen with HUD chrome.

Target conceptually:

~110–160 px total gameplay top region

depending on device height.

Tune visually.

---

# ============================================================
# PART B — NUMBER FIELD
# ============================================================

The center candidate region is the primary flexible/scrollable area.

When many candidates exist, scrolling is allowed.

This is intentional.

But:

the whole page should not become uncontrolled scrolling.

Prefer a dedicated board viewport:

overflow-y: auto
overflow-x: hidden

---

# Critical invariant

While scrolling numbers:

the user must retain access to:

- current player/status above
- selected number / KHÓA SỐ below

The board itself may move.

The game controls must not disappear offscreen.

---

# Opening 99 candidates

For approximately 390–440 px viewport width:

target roughly 5 columns where practical.

Example:

01 02 03 04 05
06 07 08 09 10
...

Exact number may vary if accessibility/touch geometry proves 4 columns better on the smallest viewport.

Do not force 6–8 tiny columns simply to avoid scrolling.

Vertical scrolling is acceptable.

Horizontal scrolling is NOT.

---

# Touch target sizing

Candidate buttons must remain comfortably tappable.

Aim for approximately:

>= 44 px effective touch target

where practical.

Do not create tiny 28px desktop-style targets on a phone.

Visible card geometry may differ from its minimum interactive target if necessary.

---

# Selected candidate

Selected state must remain visually obvious under:

- sunlight/high brightness
- touch interaction
- danger/critical color changes

Do not rely exclusively on hover.

Mobile has no hover assumption.

---

# Adaptive candidate density

Continue respecting candidate count.

Opening:

small/compact cards
multiple rows
scroll allowed

~23 candidates:

reflow toward fewer rows / larger cards

10 candidates:

larger, more dominant

5 candidates:

large critical cards

3 candidates:

three dramatic choices

2 candidates:

two very large choices

1 candidate:

single final candidate treatment

Do not leave 99-grid sizing active when only 3 numbers remain.

---

# Centering

When the candidate field no longer requires scrolling:

center the candidate cluster within the available center region where visually appropriate.

Especially:

10
5
3
2
1

candidate states.

---

# Scroll position after SAFE

When a SAFE result dramatically changes the candidate range:

do not leave the user stranded at an irrelevant scroll offset.

After the new range becomes active:

ensure the new candidate cluster is visible.

Preferred behavior:

reset/recenter the board scroll position when candidate bounds change.

Avoid disorienting animated scrolling.

Respect reduced motion.

---

# ============================================================
# PART C — BOTTOM ACTION DOCK
# ============================================================

Mobile needs a persistent action surface.

Concept:

ĐÃ CHỌN   54         🔒 KHÓA SỐ

It must remain reachable while the number field scrolls.

---

# Dock behavior

Prefer:

sticky/fixed structural bottom region inside the mobile shell.

Do not let the board scroll over/behind interactive content without reserved space.

---

# Safe area

Support device bottom safe areas using:

env(safe-area-inset-bottom)

where available.

The KHÓA SỐ button must not collide with:

- iPhone home indicator
- browser bottom UI
- device safe-area inset

---

# Board padding

If the bottom dock overlays content, reserve equivalent bottom padding in the board.

The final candidate row must be fully reachable.

No number may become hidden behind KHÓA SỐ.

---

# Selected state

When no number has been selected:

show the empty/disabled state clearly.

When selected:

show the chosen number prominently.

Example:

ĐÃ CHỌN
54

KHÓA SỐ

Avoid unnecessarily verbose copy.

---

# Lock target

KHÓA SỐ is one of the most important touch targets.

It should:

- be at least ~44 px high
- have sufficient horizontal width
- clearly show disabled/enabled state
- support keyboard activation where keyboard exists

Do not require precision tapping.

---

# ============================================================
# PART D — MOBILE SETUP
# ============================================================

Inspect setup at the same mobile widths.

Setup must:

- fit width
- avoid horizontal overflow
- preserve 2/3/4 player selection
- preserve optional names
- preserve random-starter option
- keep BẮT ĐẦU easily reachable

Setup page may vertically scroll normally if needed.

The strict top/center/bottom shell requirement primarily applies to active gameplay.

---

# ============================================================
# PART E — HAPTICS
# ============================================================

Add optional haptic feedback for devices/browser environments that support the Web Vibration API.

Feature detection only.

Conceptually:

if ('vibrate' in navigator) {
  navigator.vibrate(...)
}

Do not UA sniff.

Unsupported browser:

graceful no-op.

No crash.
No warning spam.
No fake fallback.

---

# Haptic support detection

Create a small presentation/haptics abstraction rather than scattering navigator.vibrate calls throughout components.

Conceptually:

src/presentation/haptics.ts

or equivalent.

Responsibilities:

- feature detection
- preference
- trigger semantic patterns
- safe no-op
- cancellation if needed

---

# Haptic events

Use restrained patterns.

Target starting values:

SELECT:
8–12 ms

Recommended:
10 ms

LOCK:
22–32 ms

Recommended:
28 ms

SAFE:
short double pulse

Recommended:
[16, 32, 16]

BOOM:
stronger result pattern

Recommended:
[70, 30, 120]

These are milliseconds.

Tune slightly if real-device behavior warrants it.

Do not turn BOOM into several seconds of vibration.

---

# Important haptic principle

The game already uses audio tension.

Do NOT vibrate on every heartbeat.

Do NOT continuously vibrate in TERMINAL.

That would:

- become annoying
- remove surprise
- drain battery
- make BOOM less distinctive

Haptics are event feedback, not a second soundscape.

---

# Interaction hierarchy

Target feel:

SELECT:
tiny tap

LOCK:
clear mechanical confirmation

SAFE:
short two-pulse release

BOOM:
single stronger physical shock pattern

---

# Haptics and sound are separate preferences

Mute does NOT automatically disable haptics.

Create a separate haptic preference.

Example persisted settings:

number-bomb-muted

number-bomb-haptics

or integrate cleanly into the existing settings storage.

---

# Haptics toggle

When vibration is supported:

show a compact haptics toggle.

Possible icon/text:

📳 RUNG

or another visual consistent with the terminal UI.

When unsupported:

prefer hiding the control entirely.

Do not show a permanently useless enabled toggle.

---

# Default

When supported:

haptics may default ON.

Persist explicit user choice.

---

# Trigger correctness

Do not trigger haptics from render.

Do not trigger haptics merely because a React effect reruns.

Haptics must be associated with semantic user/game events.

Examples:

actual candidate selection
actual LOCK confirmation
actual SAFE presentation
actual BOOM presentation

A rerender must not vibrate again.

---

# BOOM synchronization

BOOM haptic should align closely with the main explosion impact.

Conceptually:

visual flash
+
KRAK/WHUMP audio
+
first BOOM vibration pulse

should feel simultaneous.

Do not begin the BOOM vibration during the suspense silence.

---

# Reduced motion

prefers-reduced-motion controls visual movement.

It does not automatically disable haptics.

However, preserve a user haptic toggle.

Do not infer that reduced motion means "no vibration" unless existing accessibility policy explicitly requires it.

---

# ============================================================
# PART F — MOBILE AUDIO
# ============================================================

Do not create a separate mobile audio mix in this gate unless a real bug demands it.

Preserve NB-2M:

- adaptive Select attenuation
- adaptive LOCK attenuation
- tension-dependent BOOM bus
- suspense timing
- ringing
- soundscape

Do not boost BOOM again.

---

# ============================================================
# PART G — PORTRAIT-FIRST
# ============================================================

Primary phone QA is portrait.

Required widths/heights:

390×844
393×852
430×932
440×956

Do not optimize only for one emulated iPhone preset.

---

# Very short phones

Also inspect a reduced-height scenario if practical.

The top and bottom shell must not leave zero usable board area.

If height is constrained:

compress non-critical top labels before reducing candidate touch targets below usability.

---

# Landscape

Landscape phone support is secondary.

It must not crash or horizontally overflow catastrophically.

A compact desktop/tablet-like layout is acceptable if usable.

Do not expand this gate into a full landscape redesign.

---

# ============================================================
# PART H — DESKTOP NON-REGRESSION
# ============================================================

Desktop is already accepted.

Check:

1366×768
1440×900

Expected:

same information-rich desktop HUD
same candidate field behavior
same bottom selection bar
same overall visual proportions

Mobile-specific simplification must not leak into desktop.

---

# ============================================================
# PART I — ACCESSIBILITY
# ============================================================

Preserve:

- keyboard navigation
- focus states
- ARIA announcements
- disabled semantics
- reduced motion
- mute

Mobile layout must not remove accessible labels merely because visible labels are shortened.

Visible:

01–99 · 99

may still have an accessible name equivalent to:

Phạm vi hợp lệ 01 đến 99, còn lại 99 số.

Do not sacrifice accessibility for compactness.

---

# ============================================================
# PART J — TESTS
# ============================================================

Add/update responsive E2E coverage.

Required viewport matrix:

390×844
393×852
430×932
440×956

Desktop regression:

1366×768
1440×900

---

# Candidate-state matrix

At mobile widths inspect/test:

99
~23
10
5
3
2
1

candidate states.

Verify:

- no horizontal overflow
- correct candidate-only rendering
- card sizing adapts
- board scrolls only when appropriate
- action dock remains reachable

---

# Mobile scroll test

For 99 candidates:

1. start game;
2. scroll candidate board toward high numbers;
3. prove top HUD remains accessible;
4. prove bottom action dock remains accessible;
5. select a high candidate;
6. prove selected number displays correctly;
7. lock successfully.

No full-page horizontal movement.

---

# Range-change scroll test

Example:

99 candidates
→ select SAFE number
→ candidate range becomes smaller

Verify:

new active candidates become visible without the player manually hunting for them.

No stale scroll position should make the board appear blank.

---

# Haptics tests

Browser automation cannot physically feel vibration.

Mock/instrument navigator.vibrate.

Verify semantic calls:

SELECT:
10

LOCK:
28

SAFE:
[16,32,16]

BOOM:
[70,30,120]

Equivalent tuned values within the accepted ranges are okay if documented.

Verify:

haptics disabled:
zero calls

unsupported:
zero crash

rerender:
no duplicate call

replay:
no stale vibration event

---

# Console/pageerror

For fresh-runtime mobile E2E:

pageerror count = 0

Investigate significant React console errors.

Specifically verify the prior useEffect dependency-size warning does not occur in a fresh runtime.

---

# ============================================================
# PART K — VISUAL QA
# ============================================================

Capture screenshots/artifacts for at least:

390×844:
- opening 99
- selected number
- ~23
- 10
- 5
- 3
- 1
- SAFE
- BOOM

440×956:
- opening
- mid-range
- critical
- BOOM

1366×768:
- desktop opening

1440×900:
- desktop opening

---

# Mobile acceptance questions

Answer during QA:

Can I read the current player?

Can I see range/count?

Can I reach KHÓA SỐ at all times?

Can I scroll from 01 to 99 without losing the controls?

Can I tap candidates comfortably?

Does the board become visually stronger as candidates shrink?

Is there zero horizontal overflow?

Does the final candidate remain above the action dock?

Does safe-area padding work?

Does the layout feel designed for a phone rather than cropped from desktop?

---

# ============================================================
# PART L — NON-REGRESSION
# ============================================================

Preserve NB-2M timing:

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

Preserve adaptive interaction multipliers.

Preserve tension BOOM gains.

Preserve audio lifecycle.

Preserve game logic.

---

# Verification

Run repository equivalents of:

typecheck
lint
unit tests
Playwright E2E
production build

All must pass.

---

# Required final report

NB-2R:

PASS | FAIL


RUNTIME:

FRESH RELOAD:
PASS / FAIL

USEEFFECT DEPENDENCY WARNING:
NONE / PRESENT

PAGE ERRORS:
0 / ISSUE


CORE GAME LOGIC CHANGED:
YES / NO

Expected:
NO


MOBILE SHELL:

BREAKPOINT:
<actual>

TOP HUD:
<implementation>

CENTER BOARD:
<implementation>

BOTTOM DOCK:
<implementation>

SAFE AREA:
<implementation>


MOBILE INFORMATION REMOVED/COMPRESSED:
<summary>


BOARD:

99:
<columns / scroll result>

23:
<layout>

10:
<layout>

5:
<layout>

3:
<layout>

2:
<layout>

1:
<layout>

HORIZONTAL OVERFLOW:
NONE / ISSUE

RANGE-CHANGE RECENTER:
PASS / FAIL


HAPTICS:

SUPPORTED DETECTION:
<implementation>

SELECT:
<pattern>

LOCK:
<pattern>

SAFE:
<pattern>

BOOM:
<pattern>

HEARTBEAT VIBRATION:
NO

TOGGLE:
<implementation>

PERSISTENCE:
PASS / FAIL

UNSUPPORTED BROWSER:
PASS / FAIL

DUPLICATE RERENDER HAPTIC:
NONE / ISSUE


VIEWPORT QA:

390×844:
PASS / FAIL

393×852:
PASS / FAIL

430×932:
PASS / FAIL

440×956:
PASS / FAIL

1366×768:
PASS / FAIL

1440×900:
PASS / FAIL


DESKTOP REGRESSION:
NONE / ISSUE


AUDIO REGRESSION:
NONE / ISSUE


ACCESSIBILITY:
PASS / FAIL


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


UNRELATED CHANGES:
PRESERVED / NONE / ISSUE

COMMIT:
NO

PUSH:
NO

DEPLOY:
NO

---

# Stop conditions

Stop and report rather than hiding a problem if:

- mobile requires changing core game semantics;
- horizontal overflow remains;
- bottom dock covers candidates;
- mobile changes break accepted desktop layout;
- fresh runtime still has React dependency-array errors;
- haptics fire repeatedly from rerenders;
- unsupported vibration API causes crashes;
- audio lifecycle regresses.

---

# Product acceptance

Desktop:

full cyber-terminal control room.

Mobile:

compact bomb controller.

Desired mobile feeling:

┌────────────────────────┐
│ BOM SỐ          🔊 📳  │
│ P1 THIÊN     63–85 ·23 │
│              ● BẤT ỔN  │
├────────────────────────┤
│ 63  64  65  66  67     │
│ 68  69  70  71  72     │
│ 73  74  75  76  77     │
│ 78  79  80  81  82     │
│ 83  84  85             │
│                        │
│     [scroll region]    │
├────────────────────────┤
│ ĐÃ CHỌN 81   🔒 KHÓA   │
└────────────────────────┘

Tap:
tiny haptic.

Lock:
clear haptic.

Silence.

BOOM:
audio + visual + stronger physical pulse.

The phone version should feel intentional.

---

Successful line:

NB-2R PASS — MOBILE SHELL FITS — NUMBER FIELD SCROLLS WITHOUT HUD LOSS — ACTION DOCK STAYS REACHABLE — HAPTICS VERIFIED — DESKTOP PRESERVED — V1 READY FOR BASELINE