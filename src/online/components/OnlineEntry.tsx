import { useState, type FormEvent } from 'react'
import type { GameAudioControls } from '../../audio/useGameAudio'
import type { GameHapticsControls } from '../../presentation/useGameHaptics'
import { Brand } from '../../components/Brand'
import { getOnlineErrorCopy } from '../copy'
import { getDeepLinkedRoomCode, normalizeRoomCode } from '../roomCode'
import { validateNickname } from '../nickname'
import { useOnlineSession } from '../store/useOnlineSession'
import type { OnlineRoomSettings } from '../types'
import { OnlineTopbar } from './OnlineTopbar'

interface OnlineEntryProps {
  audio: GameAudioControls
  haptics: GameHapticsControls
  onBackHome: () => void
}

const DEFAULT_SETTINGS: OnlineRoomSettings = {
  maxPlayers: 4,
  turnTimeoutSeconds: 20,
  timeoutPolicy: 'RANDOM_PICK_WITH_2_STRIKES',
  starterMode: 'FIRST_SEAT',
  showLiveSelection: true,
}

export function OnlineEntry({ audio, haptics, onBackHome }: OnlineEntryProps) {
  const session = useOnlineSession()
  const deepLinkCode = getDeepLinkedRoomCode(window.location.search)
  const [entryMode, setEntryMode] = useState<'create' | 'join'>(deepLinkCode ? 'join' : 'create')
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState(deepLinkCode ?? '')
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [localError, setLocalError] = useState<string | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    session.clearLastCode()
    const nicknameResult = validateNickname(nickname)
    if (!nicknameResult.ok) {
      setLocalError('Tên phải có từ 1 đến 20 ký tự.')
      return
    }
    setLocalError(null)
    void audio.unlock()
    if (entryMode === 'create') {
      await session.createRoom(nicknameResult.nickname, settings)
    } else {
      await session.joinRoom(normalizeRoomCode(roomCode), nicknameResult.nickname)
    }
  }

  return (
    <main className="setup-screen online-entry-screen">
      <OnlineTopbar
        audio={audio}
        haptics={haptics}
        connection={session.connection}
        onBack={onBackHome}
      />
      <section className="online-entry-hero">
        <Brand />
        <div className="online-entry-panel">
          <div className="online-entry-tabs" role="tablist" aria-label="Chọn cách vào phòng">
            <button
              type="button"
              role="tab"
              aria-selected={entryMode === 'create'}
              className={entryMode === 'create' ? 'is-selected' : ''}
              onClick={() => setEntryMode('create')}
            >
              TẠO PHÒNG
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={entryMode === 'join'}
              className={entryMode === 'join' ? 'is-selected' : ''}
              onClick={() => setEntryMode('join')}
            >
              THAM GIA
            </button>
          </div>

          <form onSubmit={submit}>
            <label className="online-field">
              <span>BIỆT DANH</span>
              <input
                type="text"
                value={nickname}
                maxLength={24}
                autoComplete="nickname"
                placeholder="Tên hiển thị"
                onChange={(event) => setNickname(event.target.value)}
              />
            </label>

            {entryMode === 'join' ? (
              <label className="online-field">
                <span>MÃ PHÒNG</span>
                <input
                  className="room-code-input"
                  type="text"
                  value={roomCode}
                  maxLength={5}
                  autoCapitalize="characters"
                  autoComplete="off"
                  placeholder="K7X4P"
                  onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
                />
              </label>
            ) : (
              <div className="create-settings">
                <label>
                  <span>SỐ NGƯỜI TỐI ĐA</span>
                  <select
                    value={settings.maxPlayers}
                    onChange={(event) => setSettings({
                      ...settings,
                      maxPlayers: Number(event.target.value) as 2 | 3 | 4,
                    })}
                  >
                    <option value="2">2 NGƯỜI</option>
                    <option value="3">3 NGƯỜI</option>
                    <option value="4">4 NGƯỜI</option>
                  </select>
                </label>
                <label>
                  <span>THỜI GIAN MỖI LƯỢT</span>
                  <select
                    value={settings.turnTimeoutSeconds}
                    onChange={(event) => setSettings({
                      ...settings,
                      turnTimeoutSeconds: Number(event.target.value),
                    })}
                  >
                    <option value="15">15 GIÂY</option>
                    <option value="20">20 GIÂY</option>
                    <option value="30">30 GIÂY</option>
                  </select>
                </label>
                <label className="create-settings__wide">
                  <span>KHI HẾT GIỜ</span>
                  <select
                    value={settings.timeoutPolicy}
                    onChange={(event) => setSettings({
                      ...settings,
                      timeoutPolicy: event.target.value as OnlineRoomSettings['timeoutPolicy'],
                    })}
                  >
                    <option value="SELF_DESTRUCT">TỰ HỦY</option>
                    <option value="RANDOM_PICK">CHỌN NGẪU NHIÊN</option>
                    <option value="RANDOM_PICK_WITH_2_STRIKES">NGẪU NHIÊN · 2 CẢNH CÁO</option>
                  </select>
                </label>
              </div>
            )}

            {(localError || getOnlineErrorCopy(session.lastCode)) && (
              <p className="online-error" role="alert">
                {localError ?? getOnlineErrorCopy(session.lastCode)}
              </p>
            )}

            <button type="submit" className="online-primary-button" disabled={session.busy}>
              {session.busy ? 'ĐANG KẾT NỐI…' : entryMode === 'create' ? 'TẠO PHÒNG' : 'THAM GIA PHÒNG'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
