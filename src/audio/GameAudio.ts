import type { TensionProfile } from '../presentation/tension'
import type {
  ExplosionAudioProfile,
  GameAudioDiagnostics,
  GameAudioLifecycle,
} from './contract'
import {
  BOOM_MIX,
  INTERACTION_SFX,
  MASTER_DYNAMICS,
  getExplosionPresentationMix,
  getHeartbeatDubDelay,
  getInteractionSfxMix,
} from './design'

type BrowserAudioContext = AudioContext

type TransientSourceScope = 'soundscape' | 'effect' | 'ringing'

export class GameAudio implements GameAudioLifecycle {
  private context: BrowserAudioContext | null = null
  private masterGain: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private limiter: DynamicsCompressorNode | null = null
  private safetyGain: GainNode | null = null
  private muted = false
  private soundscapeGeneration = 0
  private soundscapeGain: GainNode | null = null
  private soundscapeSources: AudioScheduledSourceNode[] = []
  private releasingSoundscapeSources: AudioScheduledSourceNode[] = []
  private soundscapeTransientSources = new Set<AudioScheduledSourceNode>()
  private effectSources = new Set<AudioScheduledSourceNode>()
  private ringingSources = new Set<AudioScheduledSourceNode>()
  private effectTimers = new Set<number>()
  private heartbeatTimer: number | null = null
  private secondaryBeatTimer: number | null = null
  private textureTimer: number | null = null
  private textureRelayTimer: number | null = null
  private releaseTimer: number | null = null
  private lastSelectionMultiplier: number | null = null
  private lastLockMultiplier: number | null = null
  private lastBoomImpactGain: number | null = null

  setMuted(muted: boolean) {
    this.muted = muted
    if (muted) this.cleanupSession()
  }

  async unlock() {
    const context = this.getContext()
    if (context?.state === 'suspended') await context.resume()
  }

  playSelection(profile: TensionProfile) {
    if (this.muted) return
    const { selection } = INTERACTION_SFX
    const mix = getInteractionSfxMix(profile).selection
    this.lastSelectionMultiplier = mix.multiplier

    // Sharp mechanical TCHK.
    this.playRelayClick(
      mix.snapVolume,
      selection.snapFrequency,
    )

    // Lower mechanical body so the click doesn't sound thin.
    this.tone(
      selection.bodyFrequency,
      selection.bodyDuration,
      mix.bodyVolume,
      'triangle',
    )
  }

  playLock(profile: TensionProfile) {
    if (this.muted) return
    const { lock } = INTERACTION_SFX
    const mix = getInteractionSfxMix(profile).lock
    this.lastLockMultiplier = mix.multiplier

    // Hard KLAK transient.
    this.playRelayClick(
      mix.snapVolume,
      lock.snapFrequency,
    )

    // Mechanical mid-body.
    this.tone(
      lock.bodyFrequency,
      lock.bodyDuration,
      mix.bodyVolume,
      'square',
    )

    // Low physical body.
    this.tone(
      lock.lowFrequency,
      lock.lowDuration,
      mix.lowVolume,
      'triangle',
    )

    // Secondary latch.
    this.scheduleEffect(
      () => {
        this.playRelayClick(
          mix.secondaryVolume,
          lock.secondaryFrequency,
        )
      },
      lock.secondaryDelayMs,
    )
  }

  playSafe() {
    if (this.muted) return
    this.clearEffectActivity()
    this.playRelayClick(0.085, 720)
    this.scheduleEffect(() => this.tone(82, 0.12, 0.05, 'triangle'), 34)
    this.scheduleEffect(() => this.playRelayClick(0.038, 1_150), 112)
  }

  playExplosion(
    profile: TensionProfile,
    presentation: ExplosionAudioProfile = 'victim',
  ) {
    this.stopSoundscape()
    this.clearEffectActivity()

    const context = this.getContext()
    const output = context ? this.getOutput(context) : null

    if (!context || !output || this.muted) return

    const now = context.currentTime
    const presentationMix = getExplosionPresentationMix(profile, presentation)
    this.lastBoomImpactGain = presentationMix.impactGain

    const impactBus = context.createGain()
    const aftermathBus = context.createGain()
    const aftermathFilter = context.createBiquadFilter()
    const destructionShaper = context.createWaveShaper()
    const destructionGain = context.createGain()

    impactBus.gain.setValueAtTime(
      profile.audio.boomImpactGain,
      now,
    )

    aftermathBus.gain.setValueAtTime(1, now)

    aftermathFilter.type = 'lowpass'
    aftermathFilter.Q.setValueAtTime(0.78, now)

    aftermathFilter.frequency.setValueAtTime(
      BOOM_MIX.aftermath.initialCutoff,
      now,
    )

    aftermathFilter.frequency.exponentialRampToValueAtTime(
      BOOM_MIX.aftermath.muffledCutoff,
      now + 0.16,
    )

    aftermathFilter.frequency.exponentialRampToValueAtTime(
      BOOM_MIX.aftermath.recoveryCutoff,
      now + BOOM_MIX.aftermath.duration,
    )

    destructionShaper.curve = this.createDistortionCurve(18)
    destructionShaper.oversample = '2x'

    destructionGain.gain.setValueAtTime(
      0.74 * presentationMix.destruction,
      now,
    )

    impactBus.connect(output)

    if (presentationMix.muffledAftermath) {
      aftermathBus
        .connect(aftermathFilter)
        .connect(impactBus)
    } else {
      aftermathBus.connect(impactBus)
    }

    destructionShaper
      .connect(destructionGain)
      .connect(aftermathBus)

    // KRAK:
    // Two fast centered transients carry the surprise
    // on laptop/small speakers.
    this.noiseLayer({
      context,
      output: impactBus,
      startAt: now,
      duration: BOOM_MIX.transient.duration,
      volume: BOOM_MIX.transient.volume * presentationMix.transient,
      filterType: 'highpass',
      startFrequency: BOOM_MIX.transient.startFrequency,
      endFrequency: BOOM_MIX.transient.endFrequency,
      decayPower: 1.65,
    })

    this.noiseLayer({
      context,
      output: impactBus,
      startAt: now + 0.006,
      duration: 0.092,
      volume: 0.28 * presentationMix.transient,
      filterType: 'bandpass',
      startFrequency: 2_850,
      endFrequency: 920,
      decayPower: 1.45,
    })

    // WHUMP:
    // 80–180 Hz body remains physical on ordinary speakers.
    const body = BOOM_MIX.audibleBody

    this.frequencySweep(
      context,
      impactBus,
      now,
      body.startFrequency,
      body.endFrequency,
      body.duration,
      body.volume * presentationMix.audibleBody,
      'triangle',
    )

    this.frequencySweep(
      context,
      impactBus,
      now + 0.012,
      128,
      72,
      0.58,
      0.24 * presentationMix.audibleBody,
      'sine',
    )

    // Separate sub layer.
    const sub = BOOM_MIX.subImpact

    this.frequencySweep(
      context,
      impactBus,
      now,
      sub.startFrequency,
      sub.endFrequency,
      sub.duration,
      sub.volume * presentationMix.subImpact,
      'sine',
    )

    // Broad mid destruction.
    const mid = BOOM_MIX.midDestruction

    this.noiseLayer({
      context,
      output: destructionShaper,
      startAt: now + 0.012,
      duration: mid.duration,
      volume: mid.volume,
      filterType: 'bandpass',
      startFrequency: mid.startFrequency,
      endFrequency: mid.endFrequency,
      decayPower: 1.15,
    })

    // ZZT electrical destruction.
    const electrical = BOOM_MIX.electricalFailure

    this.noiseLayer({
      context,
      output: aftermathBus,
      startAt: now + electrical.delay,
      duration: electrical.duration,
      volume: electrical.volume * presentationMix.electrical,
      filterType: 'bandpass',
      startFrequency: electrical.startFrequency,
      endFrequency: electrical.endFrequency,
      decayPower: 1.05,
    })

    // Filtered rumble tail.
    const tail = BOOM_MIX.tail

    this.noiseLayer({
      context,
      output: aftermathBus,
      startAt: now + tail.delay,
      duration: tail.duration,
      volume: tail.volume * presentationMix.tail,
      filterType: 'lowpass',
      startFrequency: tail.startFrequency,
      endFrequency: tail.endFrequency,
      decayPower: 2.05,
    })

    this.frequencySweep(
      context,
      aftermathBus,
      now + 0.075,
      98,
      48,
      1.12,
      0.18 * presentationMix.tail,
      'triangle',
    )

    if (presentationMix.ringing) {
      this.playRinging(
        context,
        output,
        now + BOOM_MIX.ringing.delay,
      )
    }
  }

  startSoundscape(profile: TensionProfile) {
    this.stopSoundscape()

    const context = this.getContext()
    const output = context ? this.getOutput(context) : null

    if (!context || !output || this.muted) return

    const generation = this.soundscapeGeneration
    const now = context.currentTime

    const atmosphereGain = context.createGain()
    const lowPass = context.createBiquadFilter()

    atmosphereGain.gain.setValueAtTime(
      profile.audio.droneGain,
      now,
    )

    lowPass.type = 'lowpass'

    lowPass.frequency.setValueAtTime(
      profile.audio.droneCutoff,
      now,
    )

    lowPass.Q.setValueAtTime(
      0.92,
      now,
    )

    atmosphereGain
      .connect(lowPass)
      .connect(output)

    this.soundscapeGain = atmosphereGain

    const fundamental = context.createOscillator()
    const harmonic = context.createOscillator()

    const fundamentalGain = context.createGain()
    const harmonicGain = context.createGain()

    fundamental.type = 'sine'
    harmonic.type = 'triangle'

    fundamental.frequency.setValueAtTime(
      profile.audio.droneFrequency,
      now,
    )

    harmonic.frequency.setValueAtTime(
      profile.audio.droneFrequency * 1.49,
      now,
    )

    fundamentalGain.gain.setValueAtTime(
      0.88,
      now,
    )

    harmonicGain.gain.setValueAtTime(
      0.19,
      now,
    )

    fundamental
      .connect(fundamentalGain)
      .connect(atmosphereGain)

    harmonic
      .connect(harmonicGain)
      .connect(atmosphereGain)

    // Close low-mid pair:
    // remains audible on small speakers
    // and creates beating pressure.
    const bodyA = context.createOscillator()
    const bodyB = context.createOscillator()

    const bodyAGain = context.createGain()
    const bodyBGain = context.createGain()

    bodyA.type = 'triangle'
    bodyB.type = 'sine'

    bodyA.frequency.setValueAtTime(
      profile.audio.bodyFrequency,
      now,
    )

    bodyB.frequency.setValueAtTime(
      profile.audio.bodyFrequency + profile.audio.bodyBeatHz,
      now,
    )

    bodyAGain.gain.setValueAtTime(
      profile.audio.bodyGain,
      now,
    )

    bodyBGain.gain.setValueAtTime(
      profile.audio.bodyGain * 0.68,
      now,
    )

    bodyA
      .connect(bodyAGain)
      .connect(atmosphereGain)

    bodyB
      .connect(bodyBGain)
      .connect(atmosphereGain)

    const modulation = context.createOscillator()
    const modulationGain = context.createGain()

    modulation.type = 'sine'

    modulation.frequency.setValueAtTime(
      0.075 + profile.audio.heartbeatBpm / 3_000,
      now,
    )

    modulationGain.gain.setValueAtTime(
      profile.audio.droneGain * 0.2,
      now,
    )

    modulation
      .connect(modulationGain)
      .connect(atmosphereGain.gain)

    const lowNoise = context.createBufferSource()
    const lowNoiseGain = context.createGain()
    const lowNoiseFilter = context.createBiquadFilter()

    lowNoise.buffer = this.createNoiseBuffer(
      context,
      2.4,
      0,
    )

    lowNoise.loop = true

    lowNoiseGain.gain.setValueAtTime(
      0.12 + profile.audio.textureHarshness * 0.04,
      now,
    )

    lowNoiseFilter.type = 'lowpass'

    lowNoiseFilter.frequency.setValueAtTime(
      145 + profile.audio.textureHarshness * 45,
      now,
    )

    lowNoise
      .connect(lowNoiseFilter)
      .connect(lowNoiseGain)
      .connect(atmosphereGain)

    const soundscapeSources = [
      fundamental,
      harmonic,
      bodyA,
      bodyB,
      modulation,
      lowNoise,
    ]

    for (const source of soundscapeSources) {
      source.start(now)
    }

    this.soundscapeSources = soundscapeSources

    this.scheduleElectricalTexture(
      profile,
      generation,
    )

    this.scheduleHeartbeat(
      profile,
      generation,
    )
  }

  duckSoundscape() {
    this.soundscapeGeneration += 1

    this.clearSoundscapeTimers()
    this.stopTrackedSources(this.soundscapeTransientSources)
    this.finishSoundscapeRelease()

    const context = this.context
    const gain = this.soundscapeGain
    const sources = this.soundscapeSources

    this.soundscapeGain = null
    this.soundscapeSources = []

    if (!context || !gain || sources.length === 0) return

    const now = context.currentTime

    gain.gain.cancelScheduledValues(now)

    gain.gain.setValueAtTime(
      Math.max(gain.gain.value, 0.0001),
      now,
    )

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + 0.045,
    )

    this.releasingSoundscapeSources = sources

    this.releaseTimer = window.setTimeout(() => {
      this.finishSoundscapeRelease()
    }, 60)
  }

  stopSoundscape() {
    this.soundscapeGeneration += 1

    this.clearSoundscapeTimers()
    this.finishSoundscapeRelease()

    for (const source of this.soundscapeSources) {
      this.stopSource(source)
    }

    this.soundscapeSources = []

    this.stopTrackedSources(
      this.soundscapeTransientSources,
    )

    this.soundscapeGain = null
  }

  cleanupSession() {
    this.stopSoundscape()
    this.clearEffectActivity()
    this.lastSelectionMultiplier = null
    this.lastLockMultiplier = null
    this.lastBoomImpactGain = null
  }

  private clearEffectActivity() {
    for (const timer of this.effectTimers) {
      window.clearTimeout(timer)
    }

    this.effectTimers.clear()

    this.stopTrackedSources(
      this.effectSources,
    )

    this.stopTrackedSources(
      this.ringingSources,
    )
  }

  destroy() {
    this.cleanupSession()

    void this.context?.close()

    this.context = null
    this.masterGain = null
    this.compressor = null
    this.limiter = null
    this.safetyGain = null
  }

  getDiagnostics(): GameAudioDiagnostics {
    return {
      soundscapeSources:
        this.soundscapeSources.length,

      soundscapeTransientSources:
        this.soundscapeTransientSources.size,

      activeEffectSources:
        this.effectSources.size,

      activeRingingSources:
        this.ringingSources.size,

      pendingEffectTimers:
        this.effectTimers.size,

      activeSoundscapeTimers: [
        this.heartbeatTimer,
        this.secondaryBeatTimer,
        this.textureTimer,
        this.textureRelayTimer,
      ].filter(
        (timer) => timer !== null,
      ).length,

      releasePending:
        this.releaseTimer !== null,

      contextState:
        this.context?.state ?? 'none',

      lastSelectionMultiplier:
        this.lastSelectionMultiplier,

      lastLockMultiplier:
        this.lastLockMultiplier,

      lastBoomImpactGain:
        this.lastBoomImpactGain,
    }
  }

  private getContext(): BrowserAudioContext | null {
    if (this.muted) return null

    if (!this.context) {
      this.context = new window.AudioContext()
    }

    return this.context
  }

  private getOutput(
    context: BrowserAudioContext,
  ): AudioNode {
    if (
      !this.masterGain ||
      !this.compressor ||
      !this.limiter ||
      !this.safetyGain
    ) {
      this.masterGain = context.createGain()
      this.compressor = context.createDynamicsCompressor()
      this.limiter = context.createDynamicsCompressor()
      this.safetyGain = context.createGain()

      const {
        compressor,
        limiter,
      } = MASTER_DYNAMICS

      this.masterGain.gain.setValueAtTime(
        MASTER_DYNAMICS.masterGain,
        context.currentTime,
      )

      this.compressor.threshold.setValueAtTime(
        compressor.threshold,
        context.currentTime,
      )

      this.compressor.knee.setValueAtTime(
        compressor.knee,
        context.currentTime,
      )

      this.compressor.ratio.setValueAtTime(
        compressor.ratio,
        context.currentTime,
      )

      this.compressor.attack.setValueAtTime(
        compressor.attack,
        context.currentTime,
      )

      this.compressor.release.setValueAtTime(
        compressor.release,
        context.currentTime,
      )

      this.limiter.threshold.setValueAtTime(
        limiter.threshold,
        context.currentTime,
      )

      this.limiter.knee.setValueAtTime(
        limiter.knee,
        context.currentTime,
      )

      this.limiter.ratio.setValueAtTime(
        limiter.ratio,
        context.currentTime,
      )

      this.limiter.attack.setValueAtTime(
        limiter.attack,
        context.currentTime,
      )

      this.limiter.release.setValueAtTime(
        limiter.release,
        context.currentTime,
      )

      this.safetyGain.gain.setValueAtTime(
        MASTER_DYNAMICS.safetyGain,
        context.currentTime,
      )

      this.masterGain
        .connect(this.compressor)
        .connect(this.limiter)
        .connect(this.safetyGain)
        .connect(context.destination)
    }

    return this.masterGain
  }

  private scheduleElectricalTexture(
    profile: TensionProfile,
    generation: number,
  ) {
    const {
      textureMinDelayMs,
      textureMaxDelayMs,
    } = profile.audio

    const delay =
      textureMinDelayMs +
      Math.random() *
        (textureMaxDelayMs - textureMinDelayMs)

    this.textureTimer = window.setTimeout(() => {
      if (
        generation !== this.soundscapeGeneration ||
        this.muted
      ) {
        return
      }

      this.playElectricalTexture(profile)

      this.scheduleElectricalTexture(
        profile,
        generation,
      )
    }, delay)
  }

  private playElectricalTexture(
    profile: TensionProfile,
  ) {
    const context = this.getContext()
    const output = context
      ? this.getOutput(context)
      : null

    if (!context || !output) return

    const now = context.currentTime

    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    const panner = context.createStereoPanner()

    const harshness =
      profile.audio.textureHarshness

    const duration =
      0.022 +
      Math.random() *
        (0.038 + harshness * 0.025)

    source.buffer = this.createNoiseBuffer(
      context,
      duration,
      1.4,
    )

    filter.type =
      Math.random() >
      0.58 - harshness * 0.18
        ? 'highpass'
        : 'bandpass'

    filter.frequency.setValueAtTime(
      680 +
        harshness * 620 +
        Math.random() *
          (2_100 + harshness * 1_400),
      now,
    )

    filter.Q.setValueAtTime(
      1.4 +
        harshness * 1.2 +
        Math.random() * 2.4,
      now,
    )

    gain.gain.setValueAtTime(
      profile.audio.textureGain,
      now,
    )

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + duration,
    )

    panner.pan.setValueAtTime(
      (Math.random() - 0.5) * 0.7,
      now,
    )

    source
      .connect(filter)
      .connect(gain)
      .connect(panner)
      .connect(output)

    this.trackTransientSource(
      source,
      'soundscape',
    )

    source.start(now)
    source.stop(now + duration)

    if (
      Math.random() >
      0.72 - harshness * 0.18
    ) {
      this.textureRelayTimer =
        window.setTimeout(() => {
          this.textureRelayTimer = null

          if (this.muted) return

          this.playRelayClick(
            profile.audio.textureGain * 1.4,
            1_300,
            'soundscape',
          )
        }, 55)
    }
  }

  private scheduleHeartbeat(
    profile: TensionProfile,
    generation: number,
  ) {
    if (
      profile.audio.heartbeatBpm <= 0 ||
      profile.audio.heartbeatGain <= 0
    ) {
      return
    }

    const interval =
      60_000 / profile.audio.heartbeatBpm

    const beat = () => {
      if (
        generation !== this.soundscapeGeneration ||
        this.muted
      ) {
        return
      }

      this.playHeartbeat(profile)

      this.heartbeatTimer =
        window.setTimeout(
          beat,
          interval,
        )
    }

    this.heartbeatTimer =
      window.setTimeout(
        beat,
        interval * 0.58,
      )
  }

  private playHeartbeat(
    profile: TensionProfile,
  ) {
    this.playHeartbeatHit(
      profile,
      false,
    )

    const secondaryDelay =
      getHeartbeatDubDelay(
        profile.audio.heartbeatBpm,
      )

    this.secondaryBeatTimer =
      window.setTimeout(() => {
        this.secondaryBeatTimer = null

        this.playHeartbeatHit(
          profile,
          true,
        )
      }, secondaryDelay)
  }

  private playHeartbeatHit(
    profile: TensionProfile,
    dub: boolean,
  ) {
    const context = this.getContext()
    const output = context
      ? this.getOutput(context)
      : null

    if (
      !context ||
      !output ||
      this.muted
    ) {
      return
    }

    const now = context.currentTime

    const pitch =
      profile.audio.heartbeatFrequency *
      (dub ? 0.88 : 1)

    const volume =
      profile.audio.heartbeatGain *
      (dub ? 0.62 : 1)

    const duration =
      dub ? 0.1 : 0.135

    this.frequencySweep(
      context,
      output,
      now,
      pitch * 1.24,
      pitch * 0.86,
      duration,
      volume,
      'sine',
      'soundscape',
    )

    this.frequencySweep(
      context,
      output,
      now,
      pitch * 2.25,
      pitch * 1.55,
      duration * 0.78,
      volume * 0.36,
      'triangle',
      'soundscape',
    )
  }

  private playRelayClick(
    volume: number,
    frequency: number,
    scope: TransientSourceScope = 'effect',
  ) {
    const context = this.getContext()
    const output = context
      ? this.getOutput(context)
      : null

    if (
      !context ||
      !output ||
      this.muted
    ) {
      return
    }

    this.noiseLayer({
      context,
      output,
      startAt: context.currentTime,
      duration: 0.045,
      volume,
      filterType: 'bandpass',
      startFrequency: frequency,
      endFrequency: frequency * 0.58,
      decayPower: 1.8,
      scope,
    })
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    scope: TransientSourceScope = 'effect',
  ) {
    const context = this.getContext()
    const output = context
      ? this.getOutput(context)
      : null

    if (
      !context ||
      !output ||
      this.muted
    ) {
      return
    }

    const now = context.currentTime

    const oscillator =
      context.createOscillator()

    const gain =
      context.createGain()

    oscillator.type = type

    oscillator.frequency.setValueAtTime(
      frequency,
      now,
    )

    gain.gain.setValueAtTime(
      0.0001,
      now,
    )

    gain.gain.exponentialRampToValueAtTime(
      volume,
      now + 0.008,
    )

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + duration,
    )

    oscillator
      .connect(gain)
      .connect(output)

    this.trackTransientSource(
      oscillator,
      scope,
    )

    oscillator.start(now)

    oscillator.stop(
      now + duration + 0.02,
    )
  }

  private frequencySweep(
    context: BrowserAudioContext,
    output: AudioNode,
    startAt: number,
    startFrequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    scope: TransientSourceScope = 'effect',
  ) {
    const oscillator =
      context.createOscillator()

    const gain =
      context.createGain()

    oscillator.type = type

    oscillator.frequency.setValueAtTime(
      startFrequency,
      startAt,
    )

    oscillator.frequency.exponentialRampToValueAtTime(
      endFrequency,
      startAt + duration,
    )

    gain.gain.setValueAtTime(
      0.0001,
      startAt,
    )

    gain.gain.exponentialRampToValueAtTime(
      volume,
      startAt + 0.012,
    )

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      startAt + duration,
    )

    oscillator
      .connect(gain)
      .connect(output)

    this.trackTransientSource(
      oscillator,
      scope,
    )

    oscillator.start(startAt)

    oscillator.stop(
      startAt + duration + 0.02,
    )
  }

  private noiseLayer({
    context,
    output,
    startAt,
    duration,
    volume,
    filterType,
    startFrequency,
    endFrequency,
    decayPower,
    scope = 'effect',
  }: {
    context: BrowserAudioContext
    output: AudioNode
    startAt: number
    duration: number
    volume: number
    filterType: BiquadFilterType
    startFrequency: number
    endFrequency: number
    decayPower: number
    scope?: TransientSourceScope
  }) {
    const source =
      context.createBufferSource()

    const filter =
      context.createBiquadFilter()

    const gain =
      context.createGain()

    source.buffer =
      this.createNoiseBuffer(
        context,
        duration,
        decayPower,
      )

    filter.type =
      filterType

    filter.frequency.setValueAtTime(
      startFrequency,
      startAt,
    )

    filter.frequency.exponentialRampToValueAtTime(
      endFrequency,
      startAt + duration,
    )

    gain.gain.setValueAtTime(
      0.0001,
      startAt,
    )

    gain.gain.exponentialRampToValueAtTime(
      volume,
      startAt +
        Math.min(
          0.012,
          duration / 4,
        ),
    )

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      startAt + duration,
    )

    source
      .connect(filter)
      .connect(gain)
      .connect(output)

    this.trackTransientSource(
      source,
      scope,
    )

    source.start(startAt)

    source.stop(
      startAt + duration + 0.02,
    )
  }

  private playRinging(
    context: BrowserAudioContext,
    output: AudioNode,
    startAt: number,
  ) {
    const { ringing } =
      BOOM_MIX

    const ringBus =
      context.createGain()

    const flutter =
      context.createOscillator()

    const flutterGain =
      context.createGain()

    ringBus.gain.setValueAtTime(
      0.0001,
      context.currentTime,
    )

    ringBus.gain.setValueAtTime(
      0.0001,
      startAt,
    )

    ringBus.gain.exponentialRampToValueAtTime(
      ringing.busGain,
      startAt + 0.035,
    )

    ringBus.gain.setValueAtTime(
      ringing.busGain * 0.88,
      startAt + 0.28,
    )

    ringBus.gain.exponentialRampToValueAtTime(
      0.0001,
      startAt + ringing.duration,
    )

    ringBus.connect(output)

    ringing.frequencies.forEach(
      (frequency, index) => {
        const oscillator =
          context.createOscillator()

        const partialGain =
          context.createGain()

        oscillator.type =
          'sine'

        oscillator.frequency.setValueAtTime(
          frequency,
          startAt,
        )

        oscillator.frequency.linearRampToValueAtTime(
          frequency +
            ringing.driftHz[index],
          startAt + ringing.duration,
        )

        partialGain.gain.setValueAtTime(
          ringing.partialGains[index],
          startAt,
        )

        oscillator
          .connect(partialGain)
          .connect(ringBus)

        this.trackTransientSource(
          oscillator,
          'ringing',
        )

        oscillator.start(startAt)

        oscillator.stop(
          startAt +
            ringing.duration +
            0.025,
        )
      },
    )

    flutter.type = 'sine'

    flutter.frequency.setValueAtTime(
      ringing.flutterFrequency,
      startAt,
    )

    flutterGain.gain.setValueAtTime(
      ringing.flutterDepth,
      startAt,
    )

    flutterGain.gain.exponentialRampToValueAtTime(
      0.0001,
      startAt + ringing.duration,
    )

    flutter
      .connect(flutterGain)
      .connect(ringBus.gain)

    this.trackTransientSource(
      flutter,
      'ringing',
    )

    flutter.start(startAt)

    flutter.stop(
      startAt +
        ringing.duration +
        0.025,
    )

    this.noiseLayer({
      context,
      output: ringBus,
      startAt: startAt + 0.02,
      duration: 1.08,
      volume: 0.048,
      filterType: 'highpass',
      startFrequency: 5_200,
      endFrequency: 2_850,
      decayPower: 1.4,
      scope: 'ringing',
    })
  }

  private createDistortionCurve(
    amount: number,
  ) {
    const samples = 1_024
    const curve =
      new Float32Array(samples)

    for (
      let index = 0;
      index < samples;
      index += 1
    ) {
      const input =
        (index * 2) / samples - 1

      curve[index] =
        (
          (3 + amount) *
          input *
          20 *
          (Math.PI / 180)
        ) /
        (
          Math.PI +
          amount *
            Math.abs(input)
        )
    }

    return curve
  }

  private createNoiseBuffer(
    context: BrowserAudioContext,
    duration: number,
    decayPower: number,
  ) {
    const buffer =
      context.createBuffer(
        1,
        Math.ceil(
          context.sampleRate *
            duration,
        ),
        context.sampleRate,
      )

    const channel =
      buffer.getChannelData(0)

    for (
      let index = 0;
      index < channel.length;
      index += 1
    ) {
      const progress =
        index / channel.length

      const decay =
        decayPower > 0
          ? Math.pow(
              1 - progress,
              decayPower,
            )
          : 1

      channel[index] =
        (
          Math.random() * 2 - 1
        ) * decay
    }

    return buffer
  }

  private clearSoundscapeTimers() {
    if (
      this.heartbeatTimer !== null
    ) {
      window.clearTimeout(
        this.heartbeatTimer,
      )
    }

    if (
      this.secondaryBeatTimer !== null
    ) {
      window.clearTimeout(
        this.secondaryBeatTimer,
      )
    }

    if (
      this.textureTimer !== null
    ) {
      window.clearTimeout(
        this.textureTimer,
      )
    }

    if (
      this.textureRelayTimer !== null
    ) {
      window.clearTimeout(
        this.textureRelayTimer,
      )
    }

    this.heartbeatTimer = null
    this.secondaryBeatTimer = null
    this.textureTimer = null
    this.textureRelayTimer = null
  }

  private scheduleEffect(
    effect: () => void,
    delay: number,
  ) {
    const timer =
      window.setTimeout(() => {
        this.effectTimers.delete(
          timer,
        )

        if (!this.muted) {
          effect()
        }
      }, delay)

    this.effectTimers.add(
      timer,
    )
  }

  private trackTransientSource(
    source: AudioScheduledSourceNode,
    scope: TransientSourceScope,
  ) {
    const sources =
      scope === 'soundscape'
        ? this.soundscapeTransientSources
        : scope === 'ringing'
          ? this.ringingSources
          : this.effectSources

    sources.add(source)

    source.addEventListener(
      'ended',
      () => sources.delete(source),
      {
        once: true,
      },
    )
  }

  private stopTrackedSources(
    sources: Set<AudioScheduledSourceNode>,
  ) {
    for (const source of sources) {
      this.stopSource(source)
    }

    sources.clear()
  }

  private finishSoundscapeRelease() {
    if (
      this.releaseTimer !== null
    ) {
      window.clearTimeout(
        this.releaseTimer,
      )
    }

    this.releaseTimer = null

    for (
      const source of
      this.releasingSoundscapeSources
    ) {
      this.stopSource(source)
    }

    this.releasingSoundscapeSources = []
  }

  private stopSource(
    source: AudioScheduledSourceNode,
  ) {
    try {
      source.stop()
    } catch {
      // A source may already have completed naturally.
    }
  }
}
