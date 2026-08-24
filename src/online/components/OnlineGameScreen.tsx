import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameAudioControls } from '../../audio/useGameAudio'
import { FinalCandidate } from '../../components/FinalCandidate'
import { LockConfirmation } from '../../components/LockConfirmation'
import { NumberBoard } from '../../components/NumberBoard'
import type { GameHapticsControls } from '../../presentation/useGameHaptics'
import { getTensionProfile } from '../../presentation/tension'
import { SAFE_FEEDBACK_DURATION } from '../../presentation/timings'
import { PresentationLedger, presentationKey } from '../presentationLedger'
import { useOnlineSession } from '../store/useOnlineSession'
import { getCandidateCount } from '../types'
import { OnlineResolutionOverlay } from './OnlineResolutionOverlay'
import { OnlineResult } from './OnlineResult'
import { OnlineTopbar } from './OnlineTopbar'
import { OnlineTurnPanel } from './OnlineTurnPanel'

interface OnlineGameScreenProps {
  audio: GameAudioControls
  haptics: GameHapticsControls
  onBackHome: () => void
}

interface PreviousCanonicalGame {
  id: string
  phase: 'PLAYING_TURN' | 'RESOLVING' | 'FINISHED'
  version: number
}

export function OnlineGameScreen({ audio, haptics, onBackHome }: OnlineGameScreenProps) {
  const session = useOnlineSession()
  const snapshot = session.snapshot!
  const room = snapshot.room!
  const game = snapshot.game!
  const selfPlayerId = snapshot.selfPlayerId!
  const candidateCount = getCandidateCount(game)
  const candidates = useMemo(
    () => Array.from({ length: candidateCount }, (_, index) => game.lowerCandidate + index),
    [candidateCount, game.lowerCandidate],
  )
  const tension = useMemo(() => getTensionProfile(candidateCount), [candidateCount])
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null)
  const [safeNumber, setSafeNumber] = useState<number | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    session.clock.remainingSeconds(game.turnDeadlineAt))
  const [liveImpact, setLiveImpact] = useState(false)
  const ledgerRef = useRef(new PresentationLedger())
  const previousGameRef = useRef<PreviousCanonicalGame | null>(null)
  const timeoutAttemptRef = useRef<string | null>(null)
  const finalizeAttemptRef = useRef<string | null>(null)
  const isCurrentPlayer = game.currentPlayerId === selfPlayerId
  const isHost = room.hostPlayerId === selfPlayerId
  const currentMembership = snapshot.players.find((player) => player.id === selfPlayerId)
  const turnHasStarted = session.clock.now() >= Date.parse(game.turnStartedAt)
  const interactionDisabled = game.phase !== 'PLAYING_TURN'
    || !isCurrentPlayer
    || currentMembership?.membershipStatus !== 'ACTIVE'
    || !turnHasStarted
    || remainingSeconds <= 0
    || session.busy

  const remoteActor = session.remoteSelection
    ? snapshot.players.find((player) => player.id === session.remoteSelection?.event.playerId)
    : null
  const liveSelectionCopy = session.remoteSelection && remoteActor
    ? `${remoteActor.nickname} đang chọn số ${session.remoteSelection.event.candidate}`
    : null

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemainingSeconds(session.clock.remainingSeconds(game.turnDeadlineAt))
    }, 250)
    setRemainingSeconds(session.clock.remainingSeconds(game.turnDeadlineAt))
    return () => window.clearInterval(timer)
  }, [game.turnDeadlineAt, session.clock])

  useEffect(() => {
    setSelectedNumber(null)
  }, [game.currentPlayerId, game.id, game.version])

  useEffect(() => {
    if (selectedNumber === null || !room.settings.showLiveSelection || !isCurrentPlayer) return
    void session.broadcastSelection(selectedNumber)
    const interval = window.setInterval(() => {
      void session.broadcastSelection(selectedNumber)
    }, 2_000)
    return () => window.clearInterval(interval)
  }, [isCurrentPlayer, room.settings.showLiveSelection, selectedNumber, session])

  useEffect(() => {
    if (game.phase !== 'PLAYING_TURN') return
    const key = `${game.id}:${game.version}:${game.currentPlayerId}`
    timeoutAttemptRef.current = null
    const delay = Math.max(0, Date.parse(game.turnDeadlineAt) - session.clock.now() + 35)
    const timer = window.setTimeout(() => {
      if (timeoutAttemptRef.current === key) return
      timeoutAttemptRef.current = key
      void session.resolveTimeout()
    }, delay)
    return () => window.clearTimeout(timer)
  }, [game.currentPlayerId, game.id, game.phase, game.turnDeadlineAt, game.version, session])

  useEffect(() => {
    if (game.phase !== 'RESOLVING' || !game.pending) return
    const key = `${game.id}:${game.version}`
    finalizeAttemptRef.current = null
    const delay = Math.max(0, Date.parse(game.pending.resolutionAt) - session.clock.now() + 35)
    const timer = window.setTimeout(() => {
      if (finalizeAttemptRef.current === key) return
      finalizeAttemptRef.current = key
      void session.finalizeResolution()
    }, delay)
    return () => window.clearTimeout(timer)
  }, [game.id, game.pending, game.phase, game.version, session])

  useEffect(() => {
    const previous = previousGameRef.current
    const isSameGame = previous?.id === game.id
    const isLiveTransition = Boolean(isSameGame && previous && game.version > previous.version)

    if (game.phase === 'RESOLVING') {
      audio.duckSoundscape()
      if (isLiveTransition
        && previous?.phase === 'PLAYING_TURN'
        && ledgerRef.current.consume(presentationKey(game.id, game.version, 'LOCK'))
      ) {
        audio.playLock(tension)
      }
    } else if (game.phase === 'PLAYING_TURN') {
      if (isLiveTransition
        && previous?.phase === 'RESOLVING'
        && game.lastOutcome === 'SAFE'
        && ledgerRef.current.consume(presentationKey(game.id, game.version, 'SAFE'))
      ) {
        setSafeNumber(game.lastLockedNumber)
        audio.playSafe()
        haptics.triggerHaptic('safe')
        const timer = window.setTimeout(() => setSafeNumber(null), SAFE_FEEDBACK_DURATION)
        previousGameRef.current = { id: game.id, phase: game.phase, version: game.version }
        return () => window.clearTimeout(timer)
      }
      setSafeNumber(null)
      setLiveImpact(false)
    } else if (game.phase === 'FINISHED') {
      audio.stopSoundscape()
      if (isLiveTransition
        && previous?.phase === 'RESOLVING'
        && ledgerRef.current.consume(presentationKey(game.id, game.version, 'BOOM'))
      ) {
        const variant = game.loserPlayerId === selfPlayerId ? 'victim' : 'spectator'
        setLiveImpact(true)
        audio.playExplosion(tension, variant)
        haptics.triggerHaptic(variant === 'victim' ? 'boom' : 'boomSpectator')
      }
    }

    previousGameRef.current = { id: game.id, phase: game.phase, version: game.version }
  }, [
    audio,
    game.id,
    game.lastLockedNumber,
    game.lastOutcome,
    game.loserPlayerId,
    game.phase,
    game.version,
    haptics,
    selfPlayerId,
    tension,
  ])

  useEffect(() => {
    if (game.phase === 'PLAYING_TURN' && safeNumber === null && turnHasStarted) {
      audio.startSoundscape(tension)
    }
  }, [audio, game.phase, safeNumber, tension, turnHasStarted])

  useEffect(() => () => {
    audio.cleanupSession()
    haptics.cancelHaptics()
  }, [audio, haptics])

  const selectNumber = (candidate: number) => {
    if (interactionDisabled) return
    void audio.unlock()
    audio.playSelection(tension)
    haptics.triggerHaptic('select')
    setSelectedNumber(candidate)
  }

  const clearSelection = () => {
    setSelectedNumber(null)
    void session.clearBroadcastSelection()
  }

  const lockSelection = () => {
    if (selectedNumber === null || interactionDisabled) return
    haptics.triggerHaptic('lock')
    void session.clearBroadcastSelection()
    void session.lockNumber(selectedNumber)
  }

  const leave = async () => {
    await session.leaveRoom()
    onBackHome()
  }

  const loser = snapshot.players.find((player) => player.id === game.loserPlayerId)
  const resultVariant = game.loserPlayerId === selfPlayerId ? 'victim' : 'spectator'
  const renderLiveImpact = liveImpact || (
    previousGameRef.current?.id === game.id
    && previousGameRef.current.phase === 'RESOLVING'
    && game.phase === 'FINISHED'
    && game.version > previousGameRef.current.version
  )

  return (
    <main
      className={`game-screen online-game-screen tension-${tension.level}${renderLiveImpact && resultVariant === 'victim' ? ' has-exploded' : ''}${renderLiveImpact && resultVariant === 'spectator' ? ' has-spectator-impact' : ''}`}
      data-tension={tension.level}
      data-online-phase={game.phase}
    >
      <OnlineTopbar
        audio={audio}
        haptics={haptics}
        connection={session.connection}
        roomCode={room.code}
        compactBrand
      />
      <button type="button" className="online-leave-game" onClick={() => void leave()}>RỜI</button>

      <div className="game-content">
        <OnlineTurnPanel
          game={game}
          players={snapshot.players}
          gamePlayers={snapshot.gamePlayers}
          candidateCount={candidateCount}
          remainingSeconds={remainingSeconds}
          tension={tension}
          selfPlayerId={selfPlayerId}
          liveSelectionCopy={liveSelectionCopy}
        />

        {candidateCount === 1 ? (
          <FinalCandidate
            playerName={snapshot.players.find((player) => player.id === game.currentPlayerId)?.nickname ?? ''}
            candidate={game.lowerCandidate}
            disabled={interactionDisabled}
            onTrigger={() => {
              haptics.triggerHaptic('lock')
              void session.lockNumber(game.lowerCandidate)
            }}
          />
        ) : (
          <NumberBoard
            candidates={candidates}
            selectedNumber={selectedNumber}
            density={tension.boardDensity}
            interactionDisabled={interactionDisabled}
            onSelect={selectNumber}
          />
        )}

        {candidateCount > 1 && game.phase !== 'FINISHED' && (
          <LockConfirmation
            selectedNumber={selectedNumber}
            onClear={clearSelection}
            onConfirm={lockSelection}
          />
        )}
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {game.phase === 'PLAYING_TURN'
          ? `Lượt của ${snapshot.players.find((player) => player.id === game.currentPlayerId)?.nickname}. Còn ${remainingSeconds} giây.`
          : ''}
      </div>

      <OnlineResolutionOverlay pending={game.phase === 'RESOLVING' ? game.pending : null} safeNumber={safeNumber} />

      {game.phase === 'FINISHED' && loser && game.finishReason && (
        <OnlineResult
          game={game}
          loserName={loser.nickname}
          variant={resultVariant}
          liveImpact={renderLiveImpact}
          isHost={isHost}
          busy={session.busy}
          onReplay={() => void session.restartGame()}
          onLobby={() => void session.returnToLobby()}
          onLeave={() => void leave()}
        />
      )}
    </main>
  )
}
