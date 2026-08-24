import { useState } from 'react'
import type { Player } from './game'
import { createBombForEnvironment, randomPlayerIndex } from './game'
import { useGameAudio } from './audio/useGameAudio'
import { useGameHaptics } from './presentation/useGameHaptics'
import { GameScreen } from './components/GameScreen'
import { SetupScreen } from './components/SetupScreen'

interface Session {
  players: Player[]
  startingPlayerIndex: number
  randomizeStarter: boolean
}

export default function App() {
  const audio = useGameAudio()
  const haptics = useGameHaptics()
  const [session, setSession] = useState<Session | null>(null)

  if (!session) {
    return (
      <SetupScreen
        audio={audio}
        haptics={haptics}
        onStart={({ players, randomizeStarter }) => {
          setSession({
            players,
            randomizeStarter,
            startingPlayerIndex: randomizeStarter ? randomPlayerIndex(players.length) : 0,
          })
        }}
      />
    )
  }

  return (
    <GameScreen
      players={session.players}
      startingPlayerIndex={session.startingPlayerIndex}
      randomizeStarter={session.randomizeStarter}
      audio={audio}
      haptics={haptics}
      createBomb={createBombForEnvironment}
      onReturnToSetup={() => setSession(null)}
    />
  )
}
