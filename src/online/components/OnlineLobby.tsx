import { useEffect, useMemo, useState } from 'react'
import type { GameAudioControls } from '../../audio/useGameAudio'
import type { GameHapticsControls } from '../../presentation/useGameHaptics'
import { getOnlineErrorCopy, getTimeoutPolicyLabel } from '../copy'
import { createRoomJoinUrl } from '../roomCode'
import { useOnlineSession } from '../store/useOnlineSession'
import { getActiveOnlinePlayers, type OnlineRoomSettings } from '../types'
import { OnlineTopbar } from './OnlineTopbar'
import { RoomQrCode } from './RoomQrCode'

interface OnlineLobbyProps {
  audio: GameAudioControls
  haptics: GameHapticsControls
  onBackHome: () => void
}

export function OnlineLobby({ audio, haptics, onBackHome }: OnlineLobbyProps) {
  const session = useOnlineSession()
  const snapshot = session.snapshot!
  const room = snapshot.room!
  const activePlayers = useMemo(() => getActiveOnlinePlayers(snapshot.players), [snapshot.players])
  const isHost = snapshot.selfPlayerId === room.hostPlayerId
  const [settings, setSettings] = useState(room.settings)
  const [copied, setCopied] = useState(false)
  const [, setLeaseTick] = useState(0)

  useEffect(() => setSettings(room.settings), [room.settings, room.version])
  useEffect(() => {
    const timer = window.setInterval(() => setLeaseTick((value) => value + 1), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  const onlineActiveCount = activePlayers.filter((player) =>
    session.presencePlayerIds.has(player.id)).length
  const host = activePlayers.find((player) => player.id === room.hostPlayerId)
  const hostLeaseExpired = host
    ? Date.now() - Date.parse(host.lastSeenAt) >= 45_000
    : false
  const settingsChanged = JSON.stringify(settings) !== JSON.stringify(room.settings)
  const canStart = isHost
    && activePlayers.length >= 2
    && onlineActiveCount >= 2
    && !session.busy

  const copyJoinLink = async () => {
    const url = createRoomJoinUrl(room.code, window.location.origin, import.meta.env.BASE_URL)
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      setCopied(false)
    }
  }

  const leave = async () => {
    await session.leaveRoom()
    onBackHome()
  }

  return (
    <main className="setup-screen online-lobby-screen">
      <OnlineTopbar
        audio={audio}
        haptics={haptics}
        connection={session.connection}
        roomCode={room.code}
      />

      <section className="lobby-shell" aria-labelledby="lobby-title">
        <header className="lobby-heading">
          <div>
            <span className="section-index">[ PHÒNG CHỜ ]</span>
            <h1 id="lobby-title">CHỜ NGƯỜI CHƠI</h1>
            <p>Không có nút sẵn sàng. Chủ phòng có thể bắt đầu khi đủ người đang kết nối.</p>
          </div>
          <div className="room-share-card">
            <RoomQrCode code={room.code} />
            <div>
              <span>MÃ PHÒNG</span>
              <strong>{room.code}</strong>
              <button type="button" onClick={copyJoinLink}>{copied ? 'ĐÃ SAO CHÉP' : 'SAO CHÉP LINK'}</button>
            </div>
          </div>
        </header>

        <div className="lobby-grid">
          <section className="lobby-roster" aria-labelledby="roster-title">
            <div className="lobby-section-heading">
              <h2 id="roster-title">THÀNH VIÊN</h2>
              <span>{activePlayers.length}/{room.settings.maxPlayers}</span>
            </div>
            <ol>
              {Array.from({ length: room.settings.maxPlayers }, (_, index) => {
                const player = activePlayers.find((candidate) => candidate.seat === index + 1)
                if (!player) return (
                  <li key={index} className="is-empty">
                    <b>P{String(index + 1).padStart(2, '0')}</b>
                    <span>ĐANG CHỜ…</span>
                  </li>
                )
                const online = session.presencePlayerIds.has(player.id)
                return (
                  <li key={player.id} data-testid="online-roster-player">
                    <b>P{String(player.seat).padStart(2, '0')}</b>
                    <div>
                      <strong>{player.nickname}</strong>
                      <span className={online ? 'is-online' : 'is-offline'}>
                        <i /> {online ? 'ĐANG KẾT NỐI' : 'MẤT KẾT NỐI'}
                      </span>
                    </div>
                    {player.id === room.hostPlayerId && <em>CHỦ PHÒNG</em>}
                    {isHost && player.id !== snapshot.selfPlayerId && (
                      <button
                        type="button"
                        disabled={session.busy}
                        onClick={() => void session.kickPlayer(player.id)}
                      >
                        MỜI RA
                      </button>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>

          <section className="lobby-settings" aria-labelledby="settings-title">
            <div className="lobby-section-heading">
              <h2 id="settings-title">THIẾT LẬP PHÒNG</h2>
              <span>{isHost ? 'CÓ THỂ CHỈNH' : 'CHỈ XEM'}</span>
            </div>
            <div className="lobby-settings-grid">
              <label>
                <span>SỐ NGƯỜI TỐI ĐA</span>
                <select
                  disabled={!isHost || session.busy}
                  value={settings.maxPlayers}
                  onChange={(event) => setSettings({
                    ...settings,
                    maxPlayers: Number(event.target.value) as 2 | 3 | 4,
                  })}
                >
                  <option value="2">2</option><option value="3">3</option><option value="4">4</option>
                </select>
              </label>
              <label>
                <span>THỜI GIAN</span>
                <select
                  disabled={!isHost || session.busy}
                  value={settings.turnTimeoutSeconds}
                  onChange={(event) => setSettings({ ...settings, turnTimeoutSeconds: Number(event.target.value) })}
                >
                  <option value="15">15 GIÂY</option><option value="20">20 GIÂY</option><option value="30">30 GIÂY</option>
                </select>
              </label>
              <label className="lobby-settings-grid__wide">
                <span>HẾT GIỜ</span>
                <select
                  disabled={!isHost || session.busy}
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
                <small>{getTimeoutPolicyLabel(settings.timeoutPolicy)}</small>
              </label>
              <label>
                <span>NGƯỜI BẮT ĐẦU</span>
                <select
                  disabled={!isHost || session.busy}
                  value={settings.starterMode}
                  onChange={(event) => setSettings({
                    ...settings,
                    starterMode: event.target.value as OnlineRoomSettings['starterMode'],
                  })}
                >
                  <option value="FIRST_SEAT">GHẾ ĐẦU</option><option value="RANDOM">NGẪU NHIÊN</option>
                </select>
              </label>
              <label className="live-selection-toggle">
                <input
                  type="checkbox"
                  checked={settings.showLiveSelection}
                  disabled={!isHost || session.busy}
                  onChange={(event) => setSettings({ ...settings, showLiveSelection: event.target.checked })}
                />
                <span>HIỆN SỐ ĐANG CHỌN</span>
              </label>
            </div>
            {isHost && settingsChanged && (
              <button
                type="button"
                className="save-settings-button"
                disabled={session.busy}
                onClick={() => void session.updateSettings(settings)}
              >
                LƯU THIẾT LẬP
              </button>
            )}
          </section>
        </div>

        {getOnlineErrorCopy(session.lastCode) && (
          <p className="online-error" role="alert">{getOnlineErrorCopy(session.lastCode)}</p>
        )}

        <footer className="lobby-actions">
          <button type="button" className="leave-room-button" onClick={() => void leave()}>
            RỜI PHÒNG
          </button>
          {!isHost && hostLeaseExpired && (
            <button type="button" className="claim-host-button" onClick={() => void session.claimHost()}>
              NHẬN QUYỀN CHỦ PHÒNG
            </button>
          )}
          {isHost && (
            <div>
              <span>{onlineActiveCount < 2 ? 'CẦN 2 NGƯỜI ĐANG KẾT NỐI' : `${onlineActiveCount} NGƯỜI ĐÃ KẾT NỐI`}</span>
              <button
                type="button"
                className="online-primary-button"
                disabled={!canStart}
                onClick={() => {
                  void audio.unlock()
                  void session.startGame()
                }}
              >
                BẮT ĐẦU ONLINE
              </button>
            </div>
          )}
        </footer>
      </section>
    </main>
  )
}
