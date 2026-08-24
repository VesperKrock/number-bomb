import type { GameAudioControls } from '../../audio/useGameAudio'
import type { GameHapticsControls } from '../../presentation/useGameHaptics'
import { AudioToggle } from '../../components/AudioToggle'
import { Brand } from '../../components/Brand'
import { HapticsToggle } from '../../components/HapticsToggle'
import type { OnlineConnectionState } from '../types'

interface OnlineTopbarProps {
  audio: GameAudioControls
  haptics: GameHapticsControls
  connection: OnlineConnectionState
  roomCode?: string
  compactBrand?: boolean
  onBack?: () => void
}

export function OnlineTopbar({
  audio,
  haptics,
  connection,
  roomCode,
  compactBrand = false,
  onBack,
}: OnlineTopbarProps) {
  return (
    <header className={compactBrand ? 'game-header online-game-header' : 'online-topbar'}>
      {compactBrand ? <Brand compact /> : (
        <div className="online-topbar__identity">
          {onBack && (
            <button type="button" className="back-button" onClick={onBack}>← MENU</button>
          )}
          <span className="protocol-label">BS//ONLINE</span>
        </div>
      )}
      <div className="online-topbar__right">
        {roomCode && <span className="online-room-chip">PHÒNG {roomCode}</span>}
        <span className={`connection-chip connection-chip--${connection}`}>
          <i /> {connection === 'connected' ? 'ĐÃ KẾT NỐI' : connection === 'reconnecting' ? 'ĐANG NỐI LẠI' : 'ĐANG KẾT NỐI'}
        </span>
        <div className="settings-controls">
          <AudioToggle muted={audio.muted} onToggle={audio.toggleMuted} />
          {haptics.supported && (
            <HapticsToggle enabled={haptics.enabled} onToggle={haptics.toggleEnabled} />
          )}
        </div>
      </div>
    </header>
  )
}
