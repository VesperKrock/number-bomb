import type { GameAudioControls } from '../audio/useGameAudio'
import type { GameHapticsControls } from '../presentation/useGameHaptics'
import { AudioToggle } from './AudioToggle'
import { Brand } from './Brand'
import { HapticsToggle } from './HapticsToggle'

interface HomeScreenProps {
  audio: GameAudioControls
  haptics: GameHapticsControls
  onlineAvailable: boolean
  onLocal: () => void
  onOnline: () => void
}

export function HomeScreen({
  audio,
  haptics,
  onlineAvailable,
  onLocal,
  onOnline,
}: HomeScreenProps) {
  return (
    <main className="setup-screen home-screen">
      <div className="setup-topbar">
        <span className="protocol-label">BS//MODE SELECT</span>
        <div className="settings-controls">
          <AudioToggle muted={audio.muted} onToggle={audio.toggleMuted} />
          {haptics.supported && (
            <HapticsToggle enabled={haptics.enabled} onToggle={haptics.toggleEnabled} />
          )}
        </div>
      </div>

      <section className="home-hero" aria-labelledby="game-title">
        <Brand />
        <div className="mode-panel">
          <div className="panel-corner panel-corner--top" aria-hidden="true" />
          <div className="panel-corner panel-corner--bottom" aria-hidden="true" />
          <div className="mode-panel__heading">
            <span>CHỌN GIAO THỨC</span>
            <span><i /> HỆ THỐNG SẴN SÀNG</span>
          </div>
          <div className="mode-grid">
            <button type="button" className="mode-card mode-card--local" onClick={onLocal}>
              <span className="mode-card__code">LOCAL // 01</span>
              <strong>CHƠI CÙNG NHAU</strong>
              <p>2–4 người. Một màn hình. Chuyền lượt trực tiếp.</p>
              <b>KHỞI TẠO PHIÊN →</b>
            </button>
            <button
              type="button"
              className="mode-card mode-card--online"
              onClick={onOnline}
              disabled={!onlineAvailable}
            >
              <span className="mode-card__code">NETWORK // 02</span>
              <strong>CHƠI ONLINE</strong>
              <p>2–4 thiết bị. Phòng riêng. Đồng bộ thời gian thực.</p>
              <b>{onlineAvailable ? 'KẾT NỐI PHÒNG →' : 'CHƯA CẤU HÌNH'}</b>
            </button>
          </div>
          {!onlineAvailable && (
            <p className="mode-panel__notice" role="status">
              Online đang tắt trên bản build này. Chế độ local vẫn hoạt động hoàn toàn độc lập.
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
