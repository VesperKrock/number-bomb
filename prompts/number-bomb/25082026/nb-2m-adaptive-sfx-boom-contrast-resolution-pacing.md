# NB-2M — Adaptive SFX + BOOM Contrast + Resolution Pacing

## Mission

Perform a narrow calibration pass on BOM SỐ after Product Owner manual acoustic QA.

The current BOOM character is acceptable.

The remaining problem is dynamic contrast:

- selection SFX became too loud,
- LOCK SFX became too loud,
- LOCK can feel almost as strong as BOOM,
- repeated result timing becomes predictable,
- therefore BOOM loses surprise impact.

The desired behavior is:

early game:
TCHK
KLAK
...
result

late game:
tik
klak
............
BOOM

The game should become psychologically quieter and slower as candidate count shrinks.

Do not make the entire game louder.

Do not redesign BOOM from scratch.

---

# Scope

Primary likely areas:

src/audio/design.ts
src/audio/GameAudio.ts
src/presentation/tension.ts
presentation/result timing source
relevant tests

Physical source truth wins.

Inspect actual implementation before editing.

---

# Absolute constraints

Do NOT change:

- bomb generation,
- bomb persistence,
- candidate bounds,
- SAFE range semantics,
- turn rotation,
- loser determination,
- restart semantics,
- player count behavior,
- final-candidate semantics.

This gate changes presentation/audio timing only.

No commit.
No push.
No deploy.

Preserve unrelated work.

---

# CHANGE 1 — Interaction SFX must recede with tension

## Problem

Current boosted Select and LOCK sounds are too strong relative to BOOM.

They should remain audible, but they must stop competing with the result impact.

First reduce the current raw interaction SFX baseline.

Use these target base values unless physical implementation requires an equivalent representation.

### Selection base

```ts
selection: {
  snapFrequency: 1_650,
  snapVolume: 0.10,

  bodyFrequency: 780,
  bodyVolume: 0.045,
  bodyDuration: 0.055,
}

Current boosted values were approximately:

snapVolume 0.18
bodyVolume 0.085

Therefore this is approximately a 45–50% baseline reduction.

LOCK base
lock: {
  snapFrequency: 2_400,
  snapVolume: 0.20,

  bodyFrequency: 920,
  bodyVolume: 0.11,
  bodyDuration: 0.09,

  lowFrequency: 210,
  lowVolume: 0.075,
  lowDuration: 0.11,

  secondaryFrequency: 560,
  secondaryVolume: 0.06,
  secondaryDelayMs: 72,
}

LOCK must remain more prominent than ordinary selection.

But it must be clearly below BOOM.

Adaptive interaction multiplier

Do not duplicate candidate-count thresholds manually if a shared TensionProfile already exists.

Use the existing tension state as the source of truth.

Apply these multipliers to the interaction base volumes:

Tension	SELECT multiplier	LOCK multiplier
CALM	1.00	1.00
UNEASY	0.90	0.90
DANGER	0.75	0.78
CRITICAL	0.55	0.62
TERMINAL	0.35	0.45

Example:

CALM selection snap:

0.10 × 1.00 = 0.10

TERMINAL selection snap:

0.10 × 0.35 = 0.035

CALM LOCK snap:

0.20 × 1.00 = 0.20

TERMINAL LOCK snap:

0.20 × 0.45 = 0.09

This reduction is intentional.

The player must still hear the action, but the game should feel as though the machine is becoming quieter before the result.

Interaction sound character

Preserve:

Selection:

short mechanical TCHK

LOCK:

stronger mechanical KLAK

Do not convert either into:

casino sound,
melody,
success chime,
bright UI beep.

Desired relative hierarchy:

SELECT < LOCK << BOOM

At TERMINAL:

SELECT << LOCK <<< BOOM
CHANGE 2 — BOOM contrast may escalate slightly with tension
Principle

Do not increase BOOM by 50%.

Do not simply multiply raw explosion volume aggressively.

The existing explosion already has an acceptable character.

Use only a modest tension-dependent impact-bus increase.

Target effective BOOM impact bus:

Tension	Target impactBusGain
CALM	1.65
UNEASY	1.70
DANGER	1.75
CRITICAL	1.80
TERMINAL	1.85

This means an early accidental bomb is still strong.

A late-game bomb is slightly stronger.

Most of the perceived escalation should come from:

quieter Select,
quieter LOCK,
longer silence,
dynamic contrast.

Not from reckless gain.

Implementation requirement for adaptive BOOM

Use existing tension truth.

Do not create a second independent candidate-count mapping inside GameAudio if avoidable.

Preferred approaches:

Current TensionProfile provides an audio BOOM multiplier/gain.

or

GameAudio retains the current tension profile/state from startSoundscape/update lifecycle and uses it when playExplosion runs.

Choose whichever matches the architecture cleanly.

Do not introduce a fragile global variable.

Do not break the NB-2H lifecycle contract.

Master dynamics

Do NOT continue increasing global master output in this gate.

Keep the currently accepted master calibration unless tests reveal a real bug.

Expected current intent:

masterGain: 0.95
safetyGain: 1.0
compressor threshold: -10
compressor ratio: 3
limiter threshold: -1

The problem is relative mix, not insufficient master output.

BOOM layers

Preserve the current accepted BOOM design:

sharp transient,
laptop-audible body,
sub impact,
mid destruction,
electrical failure,
rubble tail,
post-BOOM ringing,
muffled aftermath.

Do not significantly boost the ringing tone.

Do not increase ringing merely because BOOM gain increases.

CHANGE 3 — Resolution should slow down as danger rises
Product goal

Currently the player learns the rhythm:

LOCK
→ roughly half a second
→ result

Repeated QA makes this predictable.

The result delay must:

increase as candidate count decreases,
contain bounded randomness,
remain responsive early,
become uncomfortable late,
never feel frozen.
Exact target resolution timing

Use these ranges for the silence / suspense period after LOCK and before SAFE or BOOM resolution presentation:

Tension	Minimum	Maximum
CALM	450 ms	550 ms
UNEASY	520 ms	640 ms
DANGER	600 ms	740 ms
CRITICAL	700 ms	860 ms
TERMINAL	820 ms	1000 ms

Use a random value inside the range for each resolution.

Examples:

CALM:
487 ms

UNEASY:
603 ms

DANGER:
671 ms

CRITICAL:
814 ms

TERMINAL:
927 ms

Do not always use the midpoint.

Do not use an unbounded delay.

Why these values

The increase per tension stage is roughly:

+80 to +140 ms

The intent is that late game feels perceptibly slower without adding multi-second dead time.

TERMINAL maximum:

1000 ms

Do not exceed this in this gate.

One second of silence is enough.

LOCK sequence

The desired timing is:

player confirms number

KLAK
↓
soundscape rapidly ducks
↓
near silence
↓
adaptive randomized wait
↓
SAFE or BOOM

The LOCK sound itself must occur before or at the beginning of the soundscape collapse.

Do not accidentally duck/cancel the LOCK effect itself.

Terminal psychological behavior

At TERMINAL the experience should approximate:

heartbeat...

LUB-DUB...

player presses KHÓA SỐ

klak

[heartbeat and machine disappear]

...

.........

BOOM

or:

klak

.........

CLACK
AN TOÀN

The player should not know whether the result will happen at:

830 ms
910 ms
985 ms

within the allowed range.

SAFE must use the same suspense timing

Do not make BOOM uniquely slower than SAFE.

Doing so could leak the result through timing.

SAFE and BOOM must use the same tension-dependent randomized timing mechanism.

Critical requirement:

result type must not be inferable from delay duration

Generate/select the presentation delay independently of whether the chosen number is SAFE or BOOM.

Randomness note

This presentation timing randomness is NOT bomb randomness.

Do not alter secret-number generation.

Normal Math.random is acceptable for non-security presentation jitter unless the existing code uses another presentation RNG abstraction.

Do not couple it to bomb generation.

Tension mapping

Continue using the current product tension model:

CALM:
31+ candidates

UNEASY:
16–30

DANGER:
8–15

CRITICAL:
4–7

TERMINAL:
1–3

The exact source must remain centralized.

Do not scatter these thresholds into GameScreen, GameAudio and timers independently.

Testing
Unit

Add/update deterministic coverage for interaction mix mapping.

Verify:

CALM select = 1.00 multiplier
UNEASY = 0.90
DANGER = 0.75
CRITICAL = 0.55
TERMINAL = 0.35

Verify LOCK mapping:

1.00
0.90
0.78
0.62
0.45

Verify BOOM target:

1.65
1.70
1.75
1.80
1.85
Resolution timing unit tests

Make the timing function independently testable if practical.

For every tension level prove:

delay >= min
delay <= max

Test many samples.

Suggested:

1000 samples per tension level

No sample may escape the configured bounds.

Also verify:

CALM max < TERMINAL min

to prove meaningful escalation.

SAFE/BOOM timing non-leak test

Prove that timing bounds are determined by tension, not result type.

SAFE and BOOM at the same tension must consume the same delay policy.

Do not create:

safeDelay(...)
boomDelay(...)

with different timing signatures unless both delegate to the exact same shared policy.

E2E

Preserve existing E2E.

Verify at minimum:

CALM selection remains audible/instrumented.
TERMINAL interaction multiplier is lower.
LOCK enters resolution phase.
Result does not appear before tension-specific minimum.
Result appears before/at tension-specific maximum plus reasonable browser scheduling tolerance.
SAFE works.
BOOM works.
No page errors.
Replay works.
Audio cleanup remains correct.

Do not make Playwright test subjective loudness.

Use implementation instrumentation/diagnostics where appropriate.

Lifecycle

Preserve all NB-2H guarantees:

no duplicate drone
no duplicate heartbeat
no duplicate relay scheduler
no stale SAFE
no stale BOOM
no stale ringing
no stale result timer

When returning to setup or replaying during pending presentation state:

cancel obsolete timers correctly.

Manual QA matrix

Product Owner should be able to manually test:

Opening / CALM

Expected:

Select:
clearly audible but restrained

LOCK:
clearly audible

Wait:
~0.45–0.55 s

BOOM:
strong
UNEASY

Expected:

interaction slightly quieter
wait slightly longer
DANGER

Expected:

heartbeat now matters more than clicks
select/lock noticeably recede
wait ~0.60–0.74 s
CRITICAL

Expected:

interaction is subdued
machine tension dominates
wait ~0.70–0.86 s
TERMINAL

Expected:

selection small
LOCK restrained
soundscape disappears
silence feels long
result arrives unpredictably around 0.82–1.00 s
BOOM dominates the entire previous sound field

This is the key acceptance state.

Desired perceived hierarchy

Conceptual only:

CALM

ambient      ███
select       █████
lock         ███████
BOOM         ███████████████


TERMINAL

ambient      █████
heartbeat    ███████
select       ██
lock         ███
silence

BOOM         █████████████████

The point is contrast.

Do not turn these bars into literal numeric gain ratios.

Reduced motion

No change required to reduced-motion behavior.

Audio timing may still escalate when reduced motion is enabled.

Mute remains independent.

Mute

Muted mode must remain silent.

Adaptive SFX logic must not accidentally create AudioContext/nodes while muted.

Unmute must not replay a result that occurred while muted.

Verification commands

Run repository equivalents of:

typecheck
lint
unit tests
Playwright E2E
production build

All must pass.

Final report

Return:

NB-2M:

PASS | FAIL

CORE GAME LOGIC CHANGED:
YES / NO

INTERACTION SFX:

BASE SELECT:
<actual values>

BASE LOCK:
<actual values>

SELECT MULTIPLIERS:
CALM:
UNEASY:
DANGER:
CRITICAL:
TERMINAL:

LOCK MULTIPLIERS:
CALM:
UNEASY:
DANGER:
CRITICAL:
TERMINAL:

BOOM:

CALM:
<effective impact gain>

UNEASY:
<effective impact gain>

DANGER:
<effective impact gain>

CRITICAL:
<effective impact gain>

TERMINAL:
<effective impact gain>

RINGING BOOSTED:
NO expected

RESOLUTION PACING:

CALM:
<range>

UNEASY:
<range>

DANGER:
<range>

CRITICAL:
<range>

TERMINAL:
<range>

SAFE/BOOM SHARE SAME POLICY:
YES / NO

RESULT-TIMING LEAK:
NONE / ISSUE

AUDIO LIFECYCLE:

DUPLICATE AUDIO:
NONE / ISSUE

STALE RESULT TIMER:
NONE / ISSUE

STALE BOOM:
NONE / ISSUE

STALE RINGING:
NONE / ISSUE

PAGEERROR:
0 / ISSUE

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

COMMIT:
NO

PUSH:
NO

DEPLOY:
NO

Stop conditions

Stop and report if:

adaptive delay changes actual game reducer semantics,
SAFE and BOOM require distinguishable delay policies,
interaction attenuation makes TERMINAL actions effectively inaudible,
BOOM escalation causes uncontrolled clipping,
NB-2H lifecycle regresses,
page errors appear.

Do not solve any of those by silently removing audio.

Product acceptance

The most important before/after behavior is:

BEFORE:

TCHK!
KLAK!
...
BOOM!

All events compete for attention.

AFTER:

early game:

tchk
KLAK
.....
result

late game:

tik
klak

............

KRAK — WHUMMMMM!!!

BÙM!

iiiiiiiiiiiiiiiiii...

The game becomes quieter and slower immediately before danger resolves.

The explosion wins through contrast.

---

Successful line:

```text
NB-2M PASS — INTERACTION SFX RECEDES WITH TENSION — BOOM CONTRAST ESCALATES — RESOLUTION DELAY SLOWS ADAPTIVELY — AUDIO LIFECYCLE VERIFIED