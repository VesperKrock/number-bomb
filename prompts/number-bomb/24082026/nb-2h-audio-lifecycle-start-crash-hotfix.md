# NB-2H — Audio Lifecycle Start Crash Hotfix

## Mission

Fix the confirmed runtime crash introduced around the NB-2 audio/presentation work.

Product Owner manual QA reproduced a persistent full black screen immediately after pressing:

```text
BẮT ĐẦU
```

Browser Console proves the exact failure:

```text
Uncaught TypeError: audio.startSoundscape is not a function
at GameScreen.tsx:71:13
```

React reports the failure inside:

```text
<GameScreen>
```

This is a release blocker.

The goal of this gate is to restore the correct audio lifecycle contract and prove that normal game-start/restart flows are stable.

---

# Scope

This is a targeted hotfix.

Primary areas:

```text
src/components/GameScreen.tsx
src/audio/*
src/presentation/*
```

Physical repository truth wins.

Inspect actual call sites and implementation before changing anything.

Do not assume the method should simply be recreated under the old name.

Determine the intended current contract.

---

# Baseline

Before modifying:

```text
git status --short
git rev-parse --show-toplevel
git rev-parse HEAD
git diff --stat
git diff --name-only
```

If this workspace still has no `.git`, report that fact and continue without inventing Git state.

Do not reset or destroy unrelated work.

---

# Proven failure

Observed Product Owner runtime sequence:

```text
Setup screen
→ press BẮT ĐẦU
→ GameScreen mounts
→ full black screen
```

Console:

```text
Uncaught TypeError: audio.startSoundscape is not a function
at GameScreen.tsx:71:13
```

This means the current consumer and audio implementation disagree about the available lifecycle API.

---

# Root-cause requirement

Determine exactly which condition is true:

```text
A. startSoundscape was renamed

B. startSoundscape was removed during NB-2 refactor

C. another method now represents the correct lifecycle entry point

D. GameScreen is receiving the wrong audio object/instance

E. export/import shape changed

F. another exact cause
```

Report the proven cause.

Do not guess.

---

# Forbidden fake fixes

Do NOT resolve this by doing any of the following unless technically justified as part of a real lifecycle design:

```ts
audio.startSoundscape?.()
```

Do not merely wrap it in:

```ts
try {
  ...
} catch {
}
```

Do not:

```text
disable soundscape
remove the call
silently ignore audio failures
add arbitrary delays
hide the React error
```

The expected NB-2 audio experience must continue to exist.

---

# Desired audio lifecycle

There must be one clear and truthful orchestration contract.

Conceptually the application needs lifecycle operations equivalent to:

```text
gameplay starts
→ soundscape starts

tension changes
→ soundscape parameters update

number locks
→ soundscape ducks / pauses for silence

SAFE
→ mechanical SAFE effect
→ soundscape resumes at new tension

BOOM
→ normal soundscape stops/ducks
→ layered BOOM sequence runs

leave game / setup / restart / unmount
→ timers, schedulers and active audio nodes clean up
```

Exact method names are implementation details.

Do not maintain multiple conflicting lifecycle APIs.

---

# Start behavior

Pressing:

```text
BẮT ĐẦU
```

must always transition from Setup into a usable game board.

Required with:

```text
audio enabled
audio muted

randomized starter ON
randomized starter OFF

2 players
3 players
4 players
```

There must be no persistent blank/black screen.

---

# Audio ON path

When audio is enabled:

```text
BẮT ĐẦU
→ GameScreen renders
→ soundscape initializes successfully
```

Confirm:

```text
ambient drone works
electrical texture scheduler works
heartbeat follows tension
```

Opening CALM state must remain restrained according to NB-2.

---

# Muted path

When audio is muted before game start:

```text
BẮT ĐẦU
```

must still enter gameplay normally.

Muted state must not cause:

```text
missing audio object
missing lifecycle method
initialization exception
scheduler exception
```

Unmuting during gameplay should restore appropriate current-state audio if that is the existing product behavior.

Preserve mute preference persistence.

---

# LOCK behavior

NB-2 established deliberate silence around LOCK.

Preserve the intended sequence:

```text
current tension soundscape
→ KHÓA SỐ
→ duck/stop
→ approximately 470–580 ms perceptible silence
→ result
```

Do not regress this while repairing start lifecycle.

---

# SAFE behavior

Preserve:

```text
dry mechanical SAFE confirmation
no cheerful success chime
soundscape resumes
new tension level applies
```

The resumed soundscape must correspond to the newly reduced candidate range.

---

# BOOM behavior

Preserve the NB-2 layered BOOM design:

```text
sharp transient
+
low-frequency impact
+
electrical/static destruction texture
+
filtered tail
```

Do not regress to a single simple beep.

Verify cleanup after BOOM.

---

# Restart and setup cleanup

Explicitly test:

```text
Setup
→ Start
→ Play
→ Về thiết lập
→ Start again
```

and:

```text
Setup
→ Start
→ BOOM
→ Chơi lại
```

and repeated cycles.

Audio resources from previous sessions must not continue indefinitely.

Look for leaks involving:

```text
setTimeout
setInterval
recursive scheduler timers
oscillators
AudioBufferSourceNodes
GainNodes
StereoPanners
AudioContext-connected graphs
requestAnimationFrame if applicable
```

Do not require every reusable node to be destroyed if the architecture intentionally reuses it.

The requirement is:

```text
no duplicated soundscape
no accumulating heartbeat
no accumulating relay scheduler
no stale callbacks
no crash
```

---

# Repeated-cycle QA

Perform a repeated lifecycle test.

At minimum:

```text
20 start/restart/setup cycles
```

Mix:

```text
audio ON
audio muted
mute toggled during gameplay
random starter ON/OFF
```

No cycle may produce:

```text
black screen
uncaught exception
duplicate ambient audio
duplicate heartbeat
unexpected delayed BOOM/SAFE sound from a prior game
```

---

# Error handling

This bug also demonstrates that a runtime component error currently results in a blank black application.

Do not expand this hotfix into a broad error-boundary redesign unless necessary.

However, report whether an application-level Error Boundary currently exists.

If absent:

```text
REPORT ONLY
```

unless adding one is truly tiny and cannot obscure the root bug.

Primary requirement remains fixing the actual crash.

---

# Regression test

Add a regression test that would have caught:

```text
GameScreen calling a nonexistent audio lifecycle method
```

Prefer testing public behavior rather than a brittle method-name assertion.

Possible valid approaches:

```text
mount/start gameplay with real audio facade
assert GameScreen enters playing state without runtime exception

or

E2E press BẮT ĐẦU with pageerror listener
assert no pageerror
assert game HUD is visible
```

The regression must fail against the broken NB-2 state.

---

# E2E runtime error guard

For the start flow, capture unexpected browser errors.

At minimum prove:

```text
press BẮT ĐẦU

pageerror count = 0

BOM SỐ game HUD visible

active number board visible
```

Test both:

```text
audio enabled
audio muted
```

---

# Existing NB-2 behavior preservation

Do not regress:

```text
active candidate recentering
eliminated-placeholder removal
desktop viewport fit
system HUD visibility
action dock non-overlap
adaptive tension model
mobile no-horizontal-overflow
reduced motion
```

---

# Verification

Run repository-equivalent commands for:

```text
typecheck
lint
unit tests
Playwright E2E
production build
```

All must pass.

Also run the repeated lifecycle QA.

---

# Required final answer

Return:

```text
NB-2H:

PASS | FAIL

ROOT CAUSE:
<exact explanation>

BROKEN CONTRACT:
<caller vs implementation>

FIX:
<exact lifecycle contract restored>


START GAME:

AUDIO ON:
PASS / FAIL

MUTED:
PASS / FAIL

RANDOM STARTER ON:
PASS / FAIL

RANDOM STARTER OFF:
PASS / FAIL


AUDIO LIFECYCLE:

START:
<result>

TENSION UPDATE:
<result>

LOCK SILENCE:
<result>

SAFE RESUME:
<result>

BOOM:
<result>

CLEANUP:
<result>


REPEATED CYCLES:

COUNT:
20+

BLACK SCREEN:
NONE / ISSUE

PAGE ERRORS:
0 / ISSUE

DUPLICATE AUDIO:
NONE / ISSUE

STALE AUDIO CALLBACK:
NONE / ISSUE


REGRESSION COVERAGE:
<test name/path>


NB-2 PRESENTATION REGRESSION:
NONE / ISSUE


ERROR BOUNDARY:
PRESENT / ABSENT
<report only unless changed>


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
```

---

# Stop conditions

Stop and report if fixing this requires:

```text
removing the NB-2 soundscape entirely
changing game reducer semantics
discarding unrelated changes
masking recurring runtime errors
```

Do not claim PASS while a browser `pageerror` still occurs during normal Start.

---

# Successful line

```text
NB-2H PASS — AUDIO LIFECYCLE CONTRACT RESTORED — START GAME BLACK SCREEN FIXED — REPEATED START/RESTART VERIFIED
```
