import { useEffect, useMemo, useReducer, useState } from 'react'
import {
  createGame,
  gameReducer,
  getCandidateCount,
  getCandidateNumbers,
  getCurrentPlayer,
  getLosingPlayer,
  MIN_NUMBER,
  randomPlayerIndex,
  type Player,
} from '../game'
import type { GameAudioControls } from '../audio/useGameAudio'
import type { GameHapticsControls } from '../presentation/useGameHaptics'
import { getTensionProfile } from '../presentation/tension'
import { getSuspenseDuration, SAFE_FEEDBACK_DURATION } from '../presentation/timings'
import type { ResolutionPresentation } from '../presentation/types'
import { AudioToggle } from './AudioToggle'
import { BoomResult } from './BoomResult'
import { Brand } from './Brand'
import { FinalCandidate } from './FinalCandidate'
import { HapticsToggle } from './HapticsToggle'
import { LockConfirmation } from './LockConfirmation'
import { NumberBoard } from './NumberBoard'
import { ResolutionOverlay } from './ResolutionOverlay'
import { TurnPanel } from './TurnPanel'

interface GameScreenProps {
  players: Player[]
  startingPlayerIndex: number
  randomizeStarter: boolean
  audio: GameAudioControls
  haptics: GameHapticsControls
  createBomb: () => number
  onReturnToSetup: () => void
}

interface InitialGameConfig {
  players: Player[]
  startingPlayerIndex: number
  secretBomb: number
}

function initializeGame(config: InitialGameConfig) {
  return createGame(config)
}

export function GameScreen({
  players,
  startingPlayerIndex,
  randomizeStarter,
  audio,
  haptics,
  createBomb,
  onReturnToSetup,
}: GameScreenProps) {
  const [game, dispatch] = useReducer(
    gameReducer,
    { players, startingPlayerIndex, secretBomb: createBomb() },
    initializeGame,
  )
  const [presentation, setPresentation] = useState<ResolutionPresentation>({
    kind: 'idle',
    number: null,
  })
  const [resolutionDelayMs, setResolutionDelayMs] = useState<number | null>(null)
  const candidateCount = getCandidateCount(game)
  const candidateNumbers = getCandidateNumbers(game)
  const tension = useMemo(() => getTensionProfile(candidateCount), [candidateCount])
  const currentPlayer = getCurrentPlayer(game)
  const losingPlayer = getLosingPlayer(game)
  const interactionDisabled = game.phase !== 'playing' || presentation.kind !== 'idle'
  const { supported: hapticsSupported, enabled: hapticsEnabled } = haptics
  const {
    muted,
    toggleMuted,
    unlock,
    playSelection,
    playLock,
    playSafe,
    playExplosion,
    startSoundscape,
    duckSoundscape,
    cleanupSession,
  } = audio

  useEffect(() => {
    if (game.phase === 'playing' && presentation.kind === 'idle') {
      startSoundscape(tension)
    }
  }, [game.phase, muted, presentation.kind, startSoundscape, tension])

  useEffect(() => () => cleanupSession(), [cleanupSession])

  useEffect(() => {
    if (game.phase !== 'resolving' || game.pendingSelection === null) return

    const lockedNumber = game.pendingSelection
    setPresentation({ kind: 'suspense', number: lockedNumber })
    playLock(tension)
    duckSoundscape()
    const suspenseDuration = getSuspenseDuration(candidateCount)
    setResolutionDelayMs(suspenseDuration)

    const resolutionTimer = window.setTimeout(() => {
      const isBomb = lockedNumber === game.secretBomb
      dispatch({ type: 'resolveSelection' })

      if (isBomb) {
        setPresentation({ kind: 'boom', number: lockedNumber })
        haptics.triggerHaptic('boom')
        playExplosion(tension)
      } else {
        setPresentation({ kind: 'safe', number: lockedNumber })
        haptics.triggerHaptic('safe')
        playSafe()
      }
    }, suspenseDuration)

    return () => window.clearTimeout(resolutionTimer)
  }, [
    candidateCount,
    duckSoundscape,
    game.pendingSelection,
    game.phase,
    game.secretBomb,
    haptics,
    playExplosion,
    playLock,
    playSafe,
    tension,
  ])

  useEffect(() => {
    if (presentation.kind !== 'safe') return
    const feedbackTimer = window.setTimeout(() => {
      setPresentation({ kind: 'idle', number: null })
      setResolutionDelayMs(null)
    }, SAFE_FEEDBACK_DURATION)
    return () => window.clearTimeout(feedbackTimer)
  }, [presentation.kind])

  const handleSelect = (value: number) => {
    if (interactionDisabled) return
    void unlock()
    playSelection(tension)
    haptics.triggerHaptic('select')
    dispatch({ type: 'select', value })
  }

  const handleLock = () => {
    if (game.pendingSelection === null || interactionDisabled) return
    haptics.triggerHaptic('lock')
    dispatch({ type: 'lockSelection' })
  }

  const handleFinalTrigger = () => {
    if (interactionDisabled) return
    void unlock()
    playSelection(tension)
    haptics.triggerHaptic('lock')
    dispatch({ type: 'lockNumber', value: game.lowerCandidate })
  }

  const handleReplay = () => {
    const nextStarter = randomizeStarter ? randomPlayerIndex(players.length) : 0
    cleanupSession()
    haptics.cancelHaptics()
    setPresentation({ kind: 'idle', number: null })
    setResolutionDelayMs(null)
    dispatch({
      type: 'restart',
      secretBomb: createBomb(),
      startingPlayerIndex: nextStarter,
    })
  }

  const handleReturnToSetup = () => {
    cleanupSession()
    haptics.cancelHaptics()
    onReturnToSetup()
  }

  return (
    <main
      className={`game-screen tension-${tension.level}${game.phase === 'finished' ? ' has-exploded' : ''}`}
      data-tension={tension.level}
      data-resolution-delay-ms={
        import.meta.env.VITE_E2E_AUDIO_DIAGNOSTICS === '1'
          ? resolutionDelayMs ?? undefined
          : undefined
      }
    >
      <header className="game-header">
        <Brand compact />
        <div className="game-header__right">
          <span className="turn-counter">LƯỢT {String(game.turnCount + 1).padStart(2, '0')}</span>
          <div className="settings-controls">
            <AudioToggle muted={muted} onToggle={toggleMuted} />
            {hapticsSupported && (
              <HapticsToggle enabled={hapticsEnabled} onToggle={haptics.toggleEnabled} />
            )}
          </div>
        </div>
      </header>

      <div className="game-content">
        <TurnPanel game={game} candidateCount={candidateCount} tension={tension} />

        {candidateCount === 1 ? (
          <FinalCandidate
            playerName={currentPlayer.name}
            candidate={game.lowerCandidate}
            disabled={interactionDisabled}
            onTrigger={handleFinalTrigger}
          />
        ) : (
          <NumberBoard
            candidates={candidateNumbers}
            selectedNumber={game.pendingSelection}
            density={tension.boardDensity}
            interactionDisabled={interactionDisabled}
            onSelect={handleSelect}
          />
        )}

        {candidateCount > 1 && game.phase !== 'finished' && (
          <LockConfirmation
            selectedNumber={game.pendingSelection}
            onClear={() => dispatch({ type: 'clearSelection' })}
            onConfirm={handleLock}
          />
        )}
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {presentation.kind === 'idle' && game.phase === 'playing'
          ? `Lượt của ${currentPlayer.name}. Phạm vi từ ${game.lowerCandidate} đến ${game.upperCandidate}.`
          : ''}
      </div>

      <ResolutionOverlay presentation={presentation} />

      {game.phase === 'finished' && losingPlayer && (
        <BoomResult
          playerName={losingPlayer.name}
          bombNumber={game.lastPick ?? MIN_NUMBER}
          onReplay={handleReplay}
          onSetup={handleReturnToSetup}
        />
      )}
    </main>
  )
}
