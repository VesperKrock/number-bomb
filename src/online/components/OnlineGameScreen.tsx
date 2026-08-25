import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameAudioControls } from '../../audio/useGameAudio'
import { FinalCandidate } from '../../components/FinalCandidate'
import { LockConfirmation } from '../../components/LockConfirmation'
import { NumberBoard } from '../../components/NumberBoard'
import type { GameHapticsControls } from '../../presentation/useGameHaptics'
import { getTensionProfile } from '../../presentation/tension'
import { SAFE_FEEDBACK_DURATION } from '../../presentation/timings'
import { PresentationLedger, presentationKey } from '../presentationLedger'
import { useOnlineSession } from '../store/useOnlineSession'
import { traceOnlineConvergence } from '../store/convergenceDiagnostics'
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
  const safeFeedbackTimerRef = useRef<number | null>(null)
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

  const presentSafe = useCallback((
    gameId: string,
    version: number,
    lockedNumber: number | null,
  ) => {
    const key = presentationKey(gameId, version, 'SAFE')
    if (!ledgerRef.current.consume(key)) return
    traceOnlineConvergence({
      clientInstanceId: selfPlayerId,
      kind: 'PRESENTATION_CONSUMED',
      source: 'CANONICAL_LIVE_TRANSITION',
      gameVersion: version,
      phase: 'PLAYING_TURN',
      presentationKey: key,
    })
    setSafeNumber(lockedNumber)
    audio.playSafe()
    haptics.triggerHaptic('safe')
    if (safeFeedbackTimerRef.current !== null) {
      window.clearTimeout(safeFeedbackTimerRef.current)
    }
    safeFeedbackTimerRef.current = window.setTimeout(() => {
      safeFeedbackTimerRef.current = null
      setSafeNumber(null)
    }, SAFE_FEEDBACK_DURATION)
  }, [audio, haptics, selfPlayerId])

  const presentBoom = useCallback((
    gameId: string,
    version: number,
    loserPlayerId: string | null,
  ) => {
    const key = presentationKey(gameId, version, 'BOOM')
    if (!ledgerRef.current.consume(key)) return
    const variant = loserPlayerId === selfPlayerId ? 'victim' : 'spectator'
    traceOnlineConvergence({
      clientInstanceId: selfPlayerId,
      kind: 'PRESENTATION_CONSUMED',
      source: 'CANONICAL_LIVE_TRANSITION',
      gameVersion: version,
      phase: 'FINISHED',
      presentationKey: key,
    })
    audio.stopSoundscape()
    setLiveImpact(true)
    audio.playExplosion(tension, variant)
    haptics.triggerHaptic(variant === 'victim' ? 'boom' : 'boomSpectator')
  }, [audio, haptics, selfPlayerId, tension])

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
    const clientInstanceId = selfPlayerId
    traceOnlineConvergence({
      clientInstanceId,
      kind: 'PRESENTATION_OBSERVED',
      source: previous ? `${previous.phase}:${previous.version}` : 'HYDRATED',
      roomVersion: room.version,
      gameVersion: game.version,
      playerCount: snapshot.players.length,
      phase: game.phase,
    })

    if (game.phase === 'RESOLVING') {
      audio.duckSoundscape()
      if (isLiveTransition
        && previous?.phase === 'PLAYING_TURN'
        && ledgerRef.current.consume(presentationKey(game.id, game.version, 'LOCK'))
      ) {
        traceOnlineConvergence({
          clientInstanceId,
          kind: 'PRESENTATION_CONSUMED',
          gameVersion: game.version,
          phase: game.phase,
          presentationKey: presentationKey(game.id, game.version, 'LOCK'),
        })
        audio.playLock(tension)
      }
    } else if (game.phase === 'PLAYING_TURN') {
      if (isLiveTransition
        && previous?.phase === 'RESOLVING'
        && game.lastOutcome === 'SAFE'
      ) {
        presentSafe(
          game.id,
          game.version,
          game.lastLockedNumber,
        )
      }
      if (game.lastOutcome === 'SAFE' && !isLiveTransition) {
        traceOnlineConvergence({
          clientInstanceId,
          kind: 'PRESENTATION_SKIPPED',
          gameVersion: game.version,
          phase: game.phase,
          reason: previous ? 'NOT_A_NEWER_LIVE_TRANSITION' : 'HYDRATED_SETTLED_STATE',
          presentationKey: presentationKey(game.id, game.version, 'SAFE'),
        })
      }
      if (!isSameGame || previous?.phase === 'FINISHED') {
        setSafeNumber(null)
        setLiveImpact(false)
      }
    } else if (game.phase === 'FINISHED') {
      audio.stopSoundscape()
      if (isLiveTransition
        && previous?.phase === 'RESOLVING'
      ) {
        presentBoom(
          game.id,
          game.version,
          game.loserPlayerId,
        )
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
    game.updatedAt,
    game.version,
    haptics,
    room.version,
    presentBoom,
    presentSafe,
    selfPlayerId,
    snapshot.players.length,
    tension,
  ])

  useEffect(() => {
    const eligibleTransitions = session.liveGameTransitions.filter((transition) => (
      transition.gameId === game.id
    ))

    for (const transition of eligibleTransitions) {
      const key = presentationKey(game.id, transition.version, transition.kind)
      if (transition.kind === 'LOCK') {
        if (!ledgerRef.current.consume(key)) continue
        traceOnlineConvergence({
          clientInstanceId: selfPlayerId,
          kind: 'PRESENTATION_CONSUMED',
          source: 'LIVE_POSTGRES_TRANSITION',
          roomVersion: room.version,
          gameVersion: transition.version,
          playerCount: snapshot.players.length,
          phase: transition.phase,
          presentationKey: key,
        })
        audio.duckSoundscape()
        audio.playLock(tension)
      } else if (transition.kind === 'SAFE') {
        presentSafe(
          transition.gameId,
          transition.version,
          transition.lockedNumber,
        )
      } else {
        presentBoom(
          transition.gameId,
          transition.version,
          transition.loserPlayerId,
        )
      }
    }
  }, [
    audio,
    game.id,
    room.version,
    presentBoom,
    presentSafe,
    selfPlayerId,
    session.liveGameTransitions,
    snapshot.players.length,
    tension,
  ])

  useEffect(() => {
    if (game.phase === 'PLAYING_TURN' && safeNumber === null && turnHasStarted) {
      audio.startSoundscape(tension)
    }
  }, [audio, game.phase, safeNumber, tension, turnHasStarted])

  useEffect(() => () => {
    if (safeFeedbackTimerRef.current !== null) {
      window.clearTimeout(safeFeedbackTimerRef.current)
      safeFeedbackTimerRef.current = null
    }
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
  const resultPresentationKey = presentationKey(game.id, game.version, 'BOOM')
  const isNewLiveBoom = (
    previousGameRef.current?.id === game.id
    && previousGameRef.current.phase !== 'FINISHED'
    && game.phase === 'FINISHED'
    && game.version > previousGameRef.current.version
  )
  const hasBufferedLiveBoom = session.liveGameTransitions.some((transition) => (
    transition.gameId === game.id
    && transition.version === game.version
    && transition.kind === 'BOOM'
  ))
  const isAwaitingLiveBoom = game.phase === 'FINISHED'
    && !ledgerRef.current.has(resultPresentationKey)
    && (
      isNewLiveBoom
      || hasBufferedLiveBoom
    )
  const renderLiveImpact = liveImpact

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

      {game.phase === 'FINISHED' && !isAwaitingLiveBoom && loser && game.finishReason && (
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
