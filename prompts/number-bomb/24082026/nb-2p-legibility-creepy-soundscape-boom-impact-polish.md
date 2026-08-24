# NB-2P — Legibility + Creepy Soundscape + BOOM Impact Polish

## Mission

Perform the final presentation polish pass for:

# BOM SỐ

## Đừng chọn sai.

NB-2 already established:

```text
active candidate recentering
desktop viewport fit
adaptive tension model
creepy soundscape architecture
LOCK silence
mechanical SAFE
layered BOOM
```

NB-2H then restored and hardened the audio lifecycle contract after the Fast Refresh/runtime facade mismatch.

Those foundations must remain intact.

This gate addresses the remaining Product Owner manual-QA findings:

```text
1. Some typography is visually stylish but too small during real gameplay.

2. The soundscape is technically correct but does not yet feel creepy enough.

3. BOOM does not have enough perceived impact.

4. The explosion needs a memorable post-impact auditory aftermath:
   cinematic temporary ear-ringing / "iiiiiiiiiiii..." sensation.

5. The entire sound curve should produce anticipation and surprise,
   not merely a collection of functional sound effects.
```

This is a presentation polish gate.

It must not change core game semantics.

---

# Product goal

The intended emotional progression is:

```text
OPENING

"Haha, chọn đại thôi."


MID GAME

"Khoan... còn ít số rồi."


DANGER

"Đừng có trúng..."


LOCK

"..."

silence


SAFE

"Phù."


or


BOOM

"ĐỆT—!"


AFTERMATH

iiiiiiiiiiiiiiiiii...
```

The game should create a short genuine party-game jumpscare through:

```text
anticipation
contrast
timing
full-spectrum impact
visual synchronization
post-impact aftermath
```

not through uncontrolled raw loudness.

---

# Absolute boundaries

Do not change:

```text
bomb generation semantics
bomb persistence during a game
candidate bounds
SAFE range reduction
turn rotation
2-player logic
3-player logic
4-player logic
loser determination
restart semantics
final-candidate semantics
```

Do not:

```text
commit
push
deploy
reset unrelated work
discard Product Owner changes
replace the entire visual identity
```

---

# Baseline inspection

Before modification, report available repository state:

```text
git status --short
git rev-parse --show-toplevel
git rev-parse HEAD
git diff --stat
git diff --name-only
```

If `.git` still does not exist:

```text
REPORT THAT FACT
```

Do not invent Git state.

---

# ============================================================

# PART A — TYPOGRAPHY / LEGIBILITY

# ============================================================

## Product Owner observation

Current overall layout is visually successful.

Do not redesign it.

However, real use at desktop distance shows that several secondary text elements are too small.

Examples include:

```text
LƯỢT HIỆN TẠI
PHẠM VI HỢP LỆ
CÒN LẠI
TRẠNG THÁI HỆ THỐNG
TIẾP THEO
PHẠM VI ĐANG HOẠT ĐỘNG
xx ĐIỂM NGUY HIỂM
helper/instruction text
small player metadata
```

The cyber-terminal aesthetic currently relies too heavily on tiny uppercase type.

Improve readability without turning the interface into oversized mobile UI.

---

# Typography hierarchy

Create or refine a deliberate typography scale.

Suggested conceptual hierarchy:

## Level 1 — Game identity

```text
BOM SỐ
```

Current scale is already strong.

Do not significantly enlarge it.

---

## Level 2 — Primary gameplay values

Examples:

```text
Player 1
01–99
99
candidate number
```

These must be immediately readable.

Candidate numbers in the opening state should remain compact enough to fit the viewport but should no longer feel unnecessarily tiny on large desktop screens.

---

## Level 3 — Gameplay labels

Examples:

```text
LƯỢT HIỆN TẠI
PHẠM VI HỢP LỆ
CÒN LẠI
TRẠNG THÁI HỆ THỐNG
```

Increase approximately:

```text
15–25%
```

from current effective appearance if needed.

Exact CSS size is implementation-dependent.

The requirement is visual readability, not a fixed px value.

---

## Level 4 — Supporting/helper copy

Examples:

```text
HÃY CHỌN MỘT SỐ
TIẾP THEO
PHẠM VI ĐANG HOẠT ĐỘNG
ĐIỂM NGUY HIỂM
```

These must remain readable without leaning toward the screen.

Avoid sub-10px effective text on normal desktop rendering.

Suggested target:

```text
~11–14px minimum effective range
```

depending on font and viewport.

---

# Responsive typography

Prefer responsive sizing where useful.

Example strategy:

```css
font-size: clamp(minimum, viewport-relative, maximum);
```

Do not blindly use one scale globally.

Candidate numbers may use a separate clamp from HUD labels.

Example conceptual ranges:

```text
HUD labels:
12–14px

candidate numbers opening:
16–20px

candidate numbers danger:
20–30px+

critical cards:
substantially larger
```

Tune against real screenshots.

---

# Typography constraints

After readability changes:

```text
1440×900
1366×768
```

must still retain the NB-2 viewport-fit goal.

Do not solve legibility by reintroducing mandatory desktop scrolling.

Do not break:

```text
HUD alignment
candidate centering
selection dock
system tension meter
```

---

# ============================================================

# PART B — CREEPY AUDIO PRODUCT DIRECTION

# ============================================================

## Current problem

The audio implementation is structurally good.

However, Product Owner manual listening reports:

```text
technically present
but
not psychologically creepy enough
```

The soundscape should feel like:

```text
an unstable fictional machine
that knows something the player does not
```

not:

```text
normal UI audio with a heartbeat added
```

---

# Core audio philosophy

Do not simply increase every gain.

Create contrast.

The emotional curve should be:

```text
CALM
restrained mechanical room tone

UNEASY
subtle pressure + irregular machine activity

DANGER
recognizable heartbeat + increasingly unstable texture

CRITICAL
compressed psychological space

TERMINAL
machine feels hostile / inevitable

LOCK
sound disappears

RESULT
SAFE or violent BOOM
```

---

# Shared tension truth

Continue using the single tension source established by NB-2.

Expected conceptual levels:

```text
31+:
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

Do not duplicate candidate-count logic across unrelated audio modules.

---

# ============================================================

# PART C — AMBIENT DRONE IMPROVEMENT

# ============================================================

## Existing issue

Very-low-frequency content around approximately:

```text
46–54 Hz
```

can sound effective on good headphones/subwoofers but may almost disappear on:

```text
laptop speakers
phone speakers
small Bluetooth speakers
```

Preserve the low-frequency foundation, but do not depend on it exclusively.

---

# Add audible low-mid pressure

Introduce subtle harmonic/body energy approximately around:

```text
90–140 Hz
```

This should make the machine atmosphere perceptible on ordinary speakers.

Possible techniques:

```text
additional oscillator harmonic
filtered saturation
subtle waveshaping
low-mid filtered noise
```

Do not create a loud continuous buzz.

---

# Uneasy beating texture

Consider two close frequencies at very low gain, e.g. conceptually:

```text
~92 Hz
~96–99 Hz
```

or another musically/psychoacoustically appropriate pair.

The small frequency difference may create a slow beating/interference sensation:

```text
wuh... wuh... wuh...
```

The user should not necessarily identify it consciously.

It should contribute to unease.

Avoid making this seasick or irritating.

---

# Drone behavior by tension

## CALM

```text
barely perceptible
stable
dark
```

## UNEASY

```text
slightly more body
subtle modulation
```

## DANGER

```text
noticeably present but still below heartbeat
```

## CRITICAL

```text
more pressure
slightly less stable
```

## TERMINAL

```text
claustrophobic
machine feels unstable
but still leaves dynamic headroom for BOOM
```

Critical requirement:

Do not make TERMINAL so loud that BOOM has nowhere to jump.

---

# ============================================================

# PART D — IRREGULAR ELECTRICAL / MACHINE TEXTURE

# ============================================================

Preserve irregular machine activity.

Possible elements:

```text
relay clicks
tiny switch noise
brief static
electrical crackle
digital fault
dry mechanical tick
```

Do not schedule them periodically.

Avoid:

```text
tick
tick
tick
tick
```

Use randomized but bounded intervals.

Tension may influence:

```text
average interval
texture intensity
spectral harshness
```

TERMINAL may have more activity than CALM.

But leave meaningful silence.

---

# Stereo

Very subtle stereo movement/panning may remain for:

```text
static
relay
machine texture
```

Do not aggressively pan:

```text
heartbeat
main BOOM body
primary warning
```

The main threat should remain centered.

---

# ============================================================

# PART E — HEARTBEAT REDESIGN

# ============================================================

## Desired character

Heartbeat should feel more organic and less like:

```text
one bass click every beat
```

Use a two-part heartbeat:

```text
LUB — DUB
```

Concept:

```text
primary low hit
→ approximately 100–170 ms
→ secondary smaller hit
```

The second hit should be:

```text
quieter
slightly different pitch/envelope
```

---

# Tension heartbeat

Suggested qualitative progression:

## CALM

```text
OFF
```

or effectively inaudible.

## UNEASY

Approximately:

```text
45–52 BPM
very subtle
```

## DANGER

Approximately:

```text
58–68 BPM
clearly perceptible
```

## CRITICAL

Approximately:

```text
74–84 BPM
strong
```

## TERMINAL

Approximately:

```text
90–105 BPM
high-pressure
```

Tune by ear.

Do not mechanically obey BPM if a slightly different curve sounds better.

---

# Terminal psychological effect

At 1–3 candidates, heartbeat should feel substantially different from opening gameplay.

The user should recognize without looking at the HUD that the game has entered a dangerous state.

---

# ============================================================

# PART F — LOCK / SILENCE

# ============================================================

This is one of the most important requirements in this gate.

The jumpscare must start before BOOM.

When the user confirms:

```text
KHÓA SỐ
```

the audio environment should collapse.

Existing NB-2 silence:

```text
~470–580 ms
```

is valid.

Tune within approximately:

```text
450–700 ms
```

if manual listening shows improvement.

---

# Silence behavior

Before LOCK:

```text
heartbeat
ambient drone
machine texture
```

At LOCK:

```text
heartbeat stops
ambient strongly ducks/stops
scheduled texture suppressed
```

Then:

```text
near silence
```

The user should consciously notice:

```text
"Ơ... im rồi."
```

before resolution.

---

# Special terminal heartbeat interruption

At TERMINAL, experiment with intentionally cutting the heartbeat at an uncomfortable point.

Example:

```text
LUB...
```

then no expected:

```text
DUB
```

because LOCK occurs.

Do not force this if implementation becomes brittle.

But the intended psychological effect is:

```text
the brain expects another hit
and does not receive it
```

Then:

```text
BOOM
```

---

# ============================================================

# PART G — SAFE RESULT

# ============================================================

Preserve SAFE as restrained relief.

SAFE should not become cheerful.

Sequence:

```text
LOCK

silence

CLACK

AN TOÀN
```

Use:

```text
mechanical latch
relay
dry electrical confirmation
```

Avoid:

```text
success melody
casino sound
coin
bright chime
```

After SAFE:

```text
resume soundscape
```

using the **new, smaller candidate count**.

Because danger increased, the resumed audio may be more intense than before.

---

# ============================================================

# PART H — BOOM IMPACT REDESIGN

# ============================================================

## Product requirement

The current BOOM is too weak in real listening.

At normal system/browser output and game sound enabled, the explosion should be:

```text
clearly and immediately more impactful
than every normal gameplay sound
```

It should create a genuine party-game startle response.

However:

```text
DO NOT create uncontrolled peak amplitude
DO NOT rely on clipping
DO NOT emit painfully loud pure high-frequency tones
```

Use **perceived loudness and contrast**.

---

# Full-spectrum BOOM

Do not rely mainly on sub-bass.

The BOOM must contain useful information across speaker capabilities.

Use at least these conceptual layers.

---

## Layer 1 — Crack / transient

Purpose:

```text
instant surprise
```

Character:

```text
KRAK
```

Very fast attack.

Approximate spectral emphasis:

```text
1–4 kHz
```

May use:

```text
noise burst
filtered transient
waveshaped click/crack
```

Duration:

```text
very short
```

This layer is important because laptop/phone speakers reproduce it well.

---

## Layer 2 — Audible body

Purpose:

```text
physical WHUMP on ordinary speakers
```

Approximate energy:

```text
80–180 Hz
```

This is crucial.

Do not depend entirely on 35–60 Hz.

Character:

```text
WHUMP
```

---

## Layer 3 — Sub impact

Retain:

```text
35–60 Hz
```

for:

```text
headphones
good speakers
subwoofer-capable systems
```

This provides cinematic weight.

---

## Layer 4 — Mid destruction

Approximate broad region:

```text
250–900 Hz
```

Use controlled distortion/noise/body.

Purpose:

```text
make explosion sound substantial
rather than like one bass oscillator
```

---

## Layer 5 — Electrical failure

Immediately after impact:

```text
ZZT
static
digital destruction
```

This connects the explosion to the fictional cyber-terminal world.

---

## Layer 6 — Rumble tail

Filtered low/mid noise:

```text
~0.8–1.5 seconds
```

Fade naturally.

Do not leave a muddy bass drone for several seconds.

---

# Perceived loudness target

Do not specify absolute SPL.

Use relative mix targets.

BOOM should be perceptually much stronger than:

```text
selection click
relay texture
heartbeat
SAFE
ambient
```

Before BOOM, the soundscape has already been ducked.

That creates the desired contrast:

```text
quiet

→

FULL-SPECTRUM IMPACT
```

---

# Headroom

Maintain intentional master headroom during normal gameplay.

Do not run ambient and heartbeat near maximum digital level.

Reserve headroom for the result impact.

---

# Limiter / compression

Use an appropriate final dynamics stage.

Possible strategy:

```text
master compressor / limiter
```

Requirements:

```text
prevent digital clipping
prevent uncontrolled transient spikes
retain strong perceived impact
```

Do not flatten the BOOM until it becomes weak.

Tune attack/release carefully.

---

# ============================================================

# PART I — POST-BOOM EAR-RINGING EFFECT

# ============================================================

## Product intent

After the explosion, the Product Owner wants a cinematic:

```text
iiiiiiiiiiiiiiiiiiiiiiii...
```

effect.

This represents temporary auditory shock / ear ringing.

It should make the explosion feel as though it had consequences.

---

# Important implementation principle

Do NOT create a painfully loud pure sine wave.

The ear-ringing effect should be:

```text
clearly audible
thin
high
slightly unstable
cinematic
controlled
```

not physically punishing.

---

# Suggested ringing spectrum

Use multiple low-gain components instead of one static test tone.

Conceptual example:

```text
~3.0–3.5 kHz main tone
+
nearby detuned component
+
very subtle higher harmonic
```

For example conceptually:

```text
3200 Hz
3270 Hz
~6400 Hz at much lower gain
```

Exact frequencies should be tuned by ear.

Avoid assuming these values are mandatory.

---

# Ringing modulation

The tone should not sound like:

```text
EEEEEEEEEEEE
```

from an audio calibration tool.

Add subtle:

```text
frequency drift
gain flutter
beating
filtered high noise
```

Conceptual perceived result:

```text
iiiiiiiiIIIIiiiiiiiiii...
```

---

# Ringing duration

Target approximately:

```text
1.2–2.0 seconds
```

Potential tail may extend slightly longer at very low gain.

The most noticeable section should not overstay its welcome.

This game will be replayed repeatedly.

Avoid listener fatigue.

---

# Ringing envelope

Suggested:

```text
quick appearance after BOOM impact
short strong phase
gradual decay
```

Do not start the ringing before the main impact.

Possible sequence:

```text
0 ms:
KRAK / impact begins

~80–250 ms:
ringing enters

~1.2–2.0 s:
ringing fades away
```

Tune against final BOOM.

---

# ============================================================

# PART J — MUFFLED AFTERMATH

# ============================================================

While ringing is active, the rest of the virtual world should feel muffled.

Possible implementation:

```text
low-pass or filtered ambience
reduced high-frequency background
strongly reduced machine texture
```

The impression should be:

```text
explosion
→ ears ringing
→ surroundings temporarily distant
```

Do not actually filter unrelated browser/system audio.

Only control the game's own audio graph.

---

# Aftermath timeline

Desired broad sequence:

```text
LOCK

silence

KRAK
WHUMP
static/destruction

BÙM visual

ringing begins

background muffled

rumble decays

ringing fades

result screen remains
```

The user should have a short moment to react before normal menu interactions feel sonically normal again.

---

# Replay cleanup

If the player presses:

```text
CHƠI LẠI
```

while ringing/tail is still active:

all stale result audio must stop/fade cleanly.

No old:

```text
ringing
rumble
static
```

may bleed into the next match.

This must integrate with the lifecycle contract hardened by NB-2H.

---

# ============================================================

# PART K — VISUAL / AUDIO SYNCHRONIZATION

# ============================================================

The audio transient must align with the strongest visual impact.

At BOOM:

```text
brief white/light flash
single strong screen kick/shake
red danger takeover
large BÙM typography
```

Target flash:

```text
~40–80 ms
```

No repeated strobe.

---

# After-impact visual state

During ringing:

Consider restrained temporary:

```text
blur
chromatic/glitch displacement
red wash
slight contrast reduction
```

Do not make the screen unreadable.

The major shake should be brief.

The aftermath should feel dazed rather than continuously violent.

---

# Reduced motion

If:

```text
prefers-reduced-motion
```

then:

Do not perform strong screen shake.

Preserve:

```text
single brief visual impact
color transition
BÙM result
audio BOOM
post-BOOM ringing
```

if sound is enabled.

The user can mute audio separately.

---

# ============================================================

# PART L — MASTER VOLUME SAFETY / MIX

# ============================================================

The Product Owner wants a startling BOOM.

Implement that through:

```text
dynamic contrast
broad frequency content
transient design
headroom
silence
visual sync
```

not reckless output.

At game audio enabled and ordinary browser/system playback:

```text
BOOM should feel startling
```

on:

```text
ordinary laptop speakers
```

while remaining controlled on:

```text
headphones
```

---

# QA rule

During manual QA, begin headphone checks at a moderate system volume.

Do not require QA personnel to test potentially loud effects at maximum headphone output.

The goal is a strong mix, not hearing discomfort.

---

# ============================================================

# PART M — MUTE

# ============================================================

Preserve:

```text
visible sound toggle
localStorage mute persistence
no autoplay violation
audio unlock on user interaction
```

When muted:

```text
no drone
no heartbeat
no BOOM
no ringing
```

Visual presentation must remain complete.

Unmuting in active gameplay should restore the current appropriate tension soundscape.

Do not replay a past BOOM merely because the user unmutes.

---

# ============================================================

# PART N — AUDIO LIFECYCLE NON-REGRESSION

# ============================================================

NB-2H fixed a real lifecycle problem.

Do not regress it.

Preserve:

```text
versioned audio contract
fresh facade when contract mismatch occurs
single active manager
stable GameScreen lifecycle
cleanup on replay
cleanup on setup
cleanup on unmount
```

Explicitly check:

```text
no duplicate drone
no duplicate heartbeat
no duplicate relay scheduler
no stale ringing
no delayed previous BOOM
no stale SAFE callback
```

---

# ============================================================

# PART O — TESTING

# ============================================================

## Unit tests

Add/refine deterministic tests where practical for:

```text
tension → heartbeat profile
BOOM sequence scheduling
ringing scheduling
post-impact cleanup
mute behavior
```

Do not attempt to test subjective creepiness numerically.

---

# Audio parameter tests

It is acceptable to prove structural properties such as:

```text
BOOM includes transient
BOOM includes audible-body layer
BOOM includes sub layer
BOOM includes distortion/static
BOOM schedules ringing
ringing decays
cleanup cancels ringing
```

Do not make tests dependent on exact oscillator micro-values unless those values are intentionally part of a stable contract.

---

# E2E

Preserve all existing tests.

Add/adjust E2E if necessary to prove:

```text
Start has zero page errors
SAFE works
BOOM works
Replay after BOOM works
Mute works
```

Instrumentation may prove audio events were scheduled.

Do not rely on Playwright “hearing” the result.

---

# Lifecycle stress

Repeat at least:

```text
20 game start/setup/replay cycles
```

Include BOOM/replay cycles.

Verify:

```text
no pageerror
no duplicate audio
no stale ringing
no stale explosion tail
```

---

# ============================================================

# PART P — MANUAL VISUAL QA

# ============================================================

Inspect:

```text
1440×900
1366×768
390×844
```

At minimum:

```text
setup
99 candidates
~23 candidates
10 candidates
5 candidates
3 candidates
1 candidate
SAFE
BOOM
```

Check typography specifically.

Answer:

```text
Can the HUD labels be read comfortably?

Are candidate numbers readable?

Did increased text size reintroduce scroll?

Did system status remain visible?

Did action dock remain unobstructed?

Does the terminal aesthetic remain intact?
```

---

# ============================================================

# PART Q — MANUAL AUDIO QA

# ============================================================

Perform a real listening pass.

Where available, test:

```text
ordinary laptop speakers
headphones at moderate safe volume
```

At minimum listen through:

```text
CALM
UNEASY
DANGER
CRITICAL
TERMINAL
LOCK → SAFE
LOCK → BOOM
post-BOOM ringing
BOOM → replay
```

---

# CALM acceptance

Expected:

```text
quiet
dark
subtle machine presence
not annoying
```

Heartbeat:

```text
off
```

---

# UNEASY acceptance

Expected:

```text
something feels wrong
but not yet overt horror
```

Heartbeat may begin subtly.

---

# DANGER acceptance

Expected:

```text
heartbeat clearly audible
machine activity contributes to pressure
```

---

# CRITICAL acceptance

Expected:

```text
strong tension
clearly different from opening
```

---

# TERMINAL acceptance

Expected:

```text
high-pressure
claustrophobic
heartbeat prominent
candidate choice psychologically heavy
```

But:

```text
still enough dynamic headroom remains for BOOM
```

---

# LOCK acceptance

Expected:

```text
soundscape noticeably disappears
silence is perceptible
```

This must not feel like:

```text
same ambience but slightly quieter
```

The user should notice the absence.

---

# SAFE acceptance

Expected:

```text
CLACK
relief
no celebration
```

Then the new tension soundscape returns.

---

# BOOM acceptance

Expected:

```text
immediate startling transient
strong body on laptop speakers
additional sub weight on better systems
electrical destruction
short rumble
```

Product Owner should no longer describe it as:

```text
small
weak
underwhelming
```

---

# RINGING acceptance

Expected:

```text
clearly audible cinematic "iiiiiiii"
```

It should:

```text
feel like auditory aftermath
be slightly unstable
fade naturally
muffle the game world temporarily
```

It must not feel like:

```text
a piercing calibration test
a permanent tone
a glitch that never stops
```

---

# ============================================================

# PART R — VERIFICATION

# ============================================================

Run:

```text
typecheck
lint
unit tests
Playwright E2E
production build
```

All must pass.

---

# Required final report

Return exactly enough evidence to answer:

```text
NB-2P:

PASS | FAIL


BASELINE:

GIT:
<available/unavailable>

HEAD:
<value if available>

WORKTREE:
<summary>


CORE GAME LOGIC CHANGED:
YES / NO

Expected:
NO


LEGIBILITY:

HUD LABELS:
<before/after approach>

CANDIDATE NUMBERS:
<approach>

HELPER TEXT:
<approach>

1440×900:
PASS / FAIL

1366×768:
PASS / FAIL

390×844:
PASS / FAIL

DESKTOP SCROLL REGRESSION:
NONE / ISSUE


CREEPY SOUNDSCAPE:

CALM:
<implementation/listening result>

UNEASY:
<implementation/listening result>

DANGER:
<implementation/listening result>

CRITICAL:
<implementation/listening result>

TERMINAL:
<implementation/listening result>


HEARTBEAT:

DOUBLE-HIT:
YES / NO

TENSION BPM:
<actual mapping>

TERMINAL CHARACTER:
<summary>


LOCK:

DUCK/STOP:
<implementation>

SILENCE:
<actual timing>

PERCEPTIBLE:
YES / NO


SAFE:

CHARACTER:
<summary>

SOUNDSCAPE RESUME:
PASS / FAIL


BOOM:

TRANSIENT:
<implementation>

LAPTOP-AUDIBLE BODY:
<implementation>

SUB:
<implementation>

MID DESTRUCTION:
<implementation>

STATIC:
<implementation>

TAIL:
<implementation>

DYNAMICS CONTROL:
<limiter/compressor/master strategy>

PERCEIVED IMPACT:
<manual QA result>


POST-BOOM RINGING:

IMPLEMENTED:
YES / NO

FREQUENCY DESIGN:
<summary>

MODULATION:
<summary>

DURATION:
<actual timing>

MUFFLED AFTERMATH:
<implementation>

FADE:
<summary>

REPLAY CLEANUP:
PASS / FAIL


MUTE:
PASS / FAIL

REDUCED MOTION:
PASS / FAIL


AUDIO LIFECYCLE:

DUPLICATE DRONE:
NONE / ISSUE

DUPLICATE HEARTBEAT:
NONE / ISSUE

STALE BOOM:
NONE / ISSUE

STALE RINGING:
NONE / ISSUE

PAGE ERRORS:
0 / ISSUE


MANUAL AUDIO QA:

LAPTOP SPEAKERS:
<result>

HEADPHONES:
<result or NOT AVAILABLE>


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

Stop and report rather than hiding the problem if:

```text
BOOM only becomes impactful by uncontrolled clipping

ringing requires dangerously aggressive high-frequency gain

legibility changes break desktop viewport fit

NB-2H audio lifecycle regresses

new page errors appear

audio nodes or timers leak across replay
```

---

# Product acceptance principle

The result should feel like this:

```text
99 candidates

quiet machine


23 candidates

something is wrong


10 candidates

heartbeat


5 candidates

pressure


3 candidates

don't pick that one


LOCK

...

silence


SAFE

CLACK


or


KRAK — WHUMP!!!

BÙM!

iiiiiiiiiiiiiiiiiiiiiiiiiiii...

[muffled aftermath]
```

The player should be startled because the game built expectation and then violently broke it.

Not because the application irresponsibly outputs an uncontrolled audio peak.

---

# Delivery

Do not:

```text
commit
push
deploy
```

Product Owner will manually QA the result before baseline creation.

---

Successful line:

```text
NB-2P PASS — LEGIBILITY IMPROVED — CREEPY SOUNDSCAPE ESCALATES — BOOM IMPACT IS STARTLING — POST-BOOM RINGING VERIFIED — V1 READY FOR BASELINE
```
