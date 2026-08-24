import { useState, type FormEvent } from 'react'
import type { Player } from '../game'
import type { GameAudioControls } from '../audio/useGameAudio'
import { MAX_NUMBER, MIN_NUMBER } from '../game'
import { getTensionProfile } from '../presentation/tension'
import type { GameHapticsControls } from '../presentation/useGameHaptics'
import { AudioToggle } from './AudioToggle'
import { Brand } from './Brand'
import { HapticsToggle } from './HapticsToggle'

interface SetupResult {
  players: Player[]
  randomizeStarter: boolean
}

interface SetupScreenProps {
  audio: GameAudioControls
  haptics: GameHapticsControls
  onStart: (result: SetupResult) => void
}

const PLAYER_OPTIONS = [2, 3, 4] as const
const SETUP_TENSION = getTensionProfile(MAX_NUMBER - MIN_NUMBER + 1)

export function SetupScreen({ audio, haptics, onStart }: SetupScreenProps) {
  const [playerCount, setPlayerCount] = useState(2)
  const [names, setNames] = useState(['', '', '', ''])
  const [randomizeStarter, setRandomizeStarter] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void audio.unlock()
    audio.playLock(SETUP_TENSION)

    const players = Array.from({ length: playerCount }, (_, index) => ({
      id: `player-${index + 1}`,
      name: names[index].trim() || `Player ${index + 1}`,
    }))

    onStart({ players, randomizeStarter })
  }

  return (
    <main className="setup-screen">
      <div className="setup-topbar">
        <span className="protocol-label">BS//LOCAL</span>
        <div className="settings-controls">
          <AudioToggle muted={audio.muted} onToggle={audio.toggleMuted} />
          {haptics.supported && (
            <HapticsToggle enabled={haptics.enabled} onToggle={haptics.toggleEnabled} />
          )}
        </div>
      </div>

      <section className="setup-hero" aria-labelledby="game-title">
        <Brand />

        <div className="setup-panel">
          <div className="panel-corner panel-corner--top" aria-hidden="true" />
          <div className="panel-corner panel-corner--bottom" aria-hidden="true" />
          <div className="setup-panel__heading">
            <span>THIẾT LẬP PHIÊN</span>
            <span className="setup-panel__status">
              <i /> SẴN SÀNG
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            <fieldset className="setup-fieldset">
              <legend>SỐ NGƯỜI CHƠI</legend>
              <div className="player-count" role="group" aria-label="Chọn số người chơi">
                {PLAYER_OPTIONS.map((count) => (
                  <button
                    type="button"
                    key={count}
                    className={playerCount === count ? 'is-selected' : ''}
                    aria-pressed={playerCount === count}
                    onClick={() => setPlayerCount(count)}
                  >
                    <strong>{count}</strong>
                    <span>{count} NGƯỜI</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="setup-fieldset">
              <legend>TÊN NGƯỜI CHƠI <span>— KHÔNG BẮT BUỘC</span></legend>
              <div className="player-names">
                {Array.from({ length: playerCount }, (_, index) => (
                  <label key={index}>
                    <span>P{String(index + 1).padStart(2, '0')}</span>
                    <input
                      type="text"
                      value={names[index]}
                      maxLength={22}
                      autoComplete="off"
                      placeholder={`Player ${index + 1}`}
                      aria-label={`Tên người chơi ${index + 1}`}
                      onChange={(event) => {
                        const nextNames = [...names]
                        nextNames[index] = event.target.value
                        setNames(nextNames)
                      }}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="random-starter">
              <input
                type="checkbox"
                checked={randomizeStarter}
                onChange={(event) => setRandomizeStarter(event.target.checked)}
              />
              <span className="random-starter__box" aria-hidden="true" />
              <span>
                <strong>CHỌN NGẪU NHIÊN NGƯỜI ĐI TRƯỚC</strong>
                <small>Nếu tắt, Player 1 sẽ bắt đầu.</small>
              </span>
            </label>

            <button className="start-button" type="submit">
              <span>BẮT ĐẦU</span>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m8 5 7 7-7 7" />
              </svg>
            </button>
          </form>
        </div>

        <div className="quick-rules" aria-label="Luật chơi nhanh">
          <div><span>01</span><p>CHỌN MỘT SỐ</p></div>
          <i aria-hidden="true" />
          <div><span>02</span><p>THU HẸP PHẠM VI</p></div>
          <i aria-hidden="true" />
          <div><span>03</span><p>TRÁNH SỐ BOM</p></div>
        </div>
      </section>

      <p className="setup-footnote">2–4 NGƯỜI // CHUYỀN MÁY SAU MỖI LƯỢT</p>
    </main>
  )
}
