import type { GameAudioControls } from '../audio/useGameAudio'
import type { GameHapticsControls } from '../presentation/useGameHaptics'
import { OnlineEntry } from './components/OnlineEntry'
import { OnlineGameScreen } from './components/OnlineGameScreen'
import { OnlineLobby } from './components/OnlineLobby'
import { RoomActivityToasts } from './components/RoomActivityToasts'
import { OnlineTopbar } from './components/OnlineTopbar'
import { OnlineSessionProvider } from './store/OnlineSessionProvider'
import { useOnlineSession } from './store/useOnlineSession'

interface OnlineModeProps {
  audio: GameAudioControls
  haptics: GameHapticsControls
  onBackHome: () => void
}

function OnlineModeContent({ audio, haptics, onBackHome }: OnlineModeProps) {
  const session = useOnlineSession()

  if (!session.available) {
    return (
      <main className="setup-screen online-unavailable-screen">
        <OnlineTopbar
          audio={audio}
          haptics={haptics}
          connection="unavailable"
          onBack={onBackHome}
        />
        <section role="status">
          <span>NETWORK // OFFLINE</span>
          <h1>CHƠI ONLINE CHƯA ĐƯỢC CẤU HÌNH.</h1>
          <p>Thiếu hoặc sai VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Chế độ local không bị ảnh hưởng.</p>
          <button type="button" className="online-primary-button" onClick={onBackHome}>VỀ MENU</button>
        </section>
      </main>
    )
  }

  if ((session.connection === 'authenticating' || session.connection === 'connecting') && !session.snapshot?.room) {
    return (
      <main className="setup-screen online-connecting-screen">
        <OnlineTopbar
          audio={audio}
          haptics={haptics}
          connection={session.connection}
          onBack={onBackHome}
        />
        <div className="online-connecting" role="status">
          <i aria-hidden="true" />
          <span>{session.connection === 'authenticating' ? 'ĐANG XÁC THỰC ẨN DANH…' : 'ĐANG KHÔI PHỤC PHÒNG…'}</span>
        </div>
      </main>
    )
  }

  const room = session.snapshot?.room
  if (!room) return <OnlineEntry audio={audio} haptics={haptics} onBackHome={onBackHome} />
  if (room.status === 'LOBBY') {
    return (
      <>
        <OnlineLobby audio={audio} haptics={haptics} onBackHome={onBackHome} />
        <RoomActivityToasts
          activities={session.roomActivities}
          onDismiss={session.dismissRoomActivity}
        />
      </>
    )
  }
  if ((room.status === 'PLAYING' || room.status === 'FINISHED') && session.snapshot?.game) {
    return (
      <>
        <OnlineGameScreen audio={audio} haptics={haptics} onBackHome={onBackHome} />
        <RoomActivityToasts
          activities={session.roomActivities}
          onDismiss={session.dismissRoomActivity}
        />
      </>
    )
  }

  return <OnlineEntry audio={audio} haptics={haptics} onBackHome={onBackHome} />
}

export default function OnlineMode(props: OnlineModeProps) {
  return (
    <OnlineSessionProvider>
      <OnlineModeContent {...props} />
    </OnlineSessionProvider>
  )
}
