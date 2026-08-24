import { lazy, Suspense, useState } from 'react'
import type { Player } from './game'
import { createBombForEnvironment, randomPlayerIndex } from './game'
import { useGameAudio } from './audio/useGameAudio'
import { useGameHaptics } from './presentation/useGameHaptics'
import { GameScreen } from './components/GameScreen'
import { HomeScreen } from './components/HomeScreen'
import { SetupScreen } from './components/SetupScreen'
import { getOnlineConfig } from './online/config'
import { getDeepLinkedRoomCode } from './online/roomCode'

const OnlineMode = lazy(() => import('./online/OnlineMode'))

type RootMode = 'home' | 'local' | 'online'

const MODE_STORAGE_KEY = 'bom-so:mode'

function getInitialMode(): RootMode {
  if (getDeepLinkedRoomCode(window.location.search)) return 'online'
  try {
    const retainedMode = window.sessionStorage.getItem(MODE_STORAGE_KEY)
    if (retainedMode === 'local' || retainedMode === 'online') return retainedMode
  } catch {
    // A fresh mode selector is a safe fallback when session storage is blocked.
  }
  return 'home'
}

interface Session {
  players: Player[]
  startingPlayerIndex: number
  randomizeStarter: boolean
}

export default function App() {
  const audio = useGameAudio()
  const haptics = useGameHaptics()
  const [mode, setMode] = useState<RootMode>(getInitialMode)
  const [session, setSession] = useState<Session | null>(null)
  const onlineAvailable = getOnlineConfig().available

  const chooseMode = (nextMode: RootMode) => {
    setSession(null)
    setMode(nextMode)
    try {
      if (nextMode === 'home') {
        window.sessionStorage.removeItem(MODE_STORAGE_KEY)
        const url = new URL(window.location.href)
        if (url.searchParams.has('room')) {
          url.searchParams.delete('room')
          window.history.replaceState(null, '', url)
        }
      } else {
        window.sessionStorage.setItem(MODE_STORAGE_KEY, nextMode)
      }
    } catch {
      // Mode selection still works for the current render without storage.
    }
  }

  if (mode === 'home') {
    return (
      <HomeScreen
        audio={audio}
        haptics={haptics}
        onlineAvailable={onlineAvailable}
        onLocal={() => chooseMode('local')}
        onOnline={() => chooseMode('online')}
      />
    )
  }

  if (mode === 'online') {
    return (
      <Suspense fallback={(
        <main className="setup-screen online-loading" aria-live="polite">
          <span>ĐANG NẠP GIAO THỨC ONLINE…</span>
        </main>
      )}>
        <OnlineMode
          audio={audio}
          haptics={haptics}
          onBackHome={() => chooseMode('home')}
        />
      </Suspense>
    )
  }

  if (!session) {
    return (
      <SetupScreen
        audio={audio}
        haptics={haptics}
        onBack={() => chooseMode('home')}
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
