import type { TensionProfile } from '../../presentation/tension'
import type {
  OnlineGamePlayer,
  OnlineGameState,
  OnlinePlayer,
} from '../types'

interface OnlineTurnPanelProps {
  game: OnlineGameState
  players: OnlinePlayer[]
  gamePlayers: OnlineGamePlayer[]
  candidateCount: number
  remainingSeconds: number
  tension: TensionProfile
  selfPlayerId: string
  liveSelectionCopy: string | null
}

export function OnlineTurnPanel({
  game,
  players,
  gamePlayers,
  candidateCount,
  remainingSeconds,
  tension,
  selfPlayerId,
  liveSelectionCopy,
}: OnlineTurnPanelProps) {
  const currentPlayer = players.find((player) => player.id === game.currentPlayerId)
  const ordered = gamePlayers
    .slice()
    .sort((left, right) => left.seat - right.seat)
    .map((participant) => players.find((player) => player.id === participant.playerId))
    .filter((player): player is OnlinePlayer => Boolean(player))
  const currentIndex = ordered.findIndex((player) => player.id === game.currentPlayerId)
  const rotated = currentIndex < 0
    ? ordered
    : ordered.map((_, offset) => ordered[(currentIndex + offset) % ordered.length])
  const currentParticipant = gamePlayers.find((player) => player.playerId === game.currentPlayerId)

  return (
    <section className="turn-panel online-turn-panel" aria-label="Thông tin lượt chơi online">
      <div className="turn-panel__player">
        <span className="status-kicker">LƯỢT HIỆN TẠI</span>
        <div className="player-callout">
          <span className="player-callout__index">P{String(currentParticipant?.seat ?? 0).padStart(2, '0')}</span>
          <div>
            <strong data-testid="online-current-player">{currentPlayer?.nickname ?? 'ĐANG ĐỒNG BỘ'}</strong>
            <small>{game.currentPlayerId === selfPlayerId ? 'ĐẾN LƯỢT BẠN' : liveSelectionCopy ?? 'ĐANG SUY NGHĨ…'}</small>
          </div>
        </div>
      </div>

      <div className="turn-panel__metrics online-turn-panel__metrics">
        <div>
          <span>PHẠM VI HỢP LỆ</span>
          <strong data-testid="online-valid-range">
            {String(game.lowerCandidate).padStart(2, '0')}<i>—</i>{String(game.upperCandidate).padStart(2, '0')}
          </strong>
        </div>
        <div>
          <span>CÒN LẠI</span>
          <strong data-testid="online-candidate-count">{candidateCount}</strong>
          <small>CON SỐ</small>
        </div>
        <div className={`turn-timer${remainingSeconds <= 5 ? ' is-warning' : ''}`}>
          <span>THỜI GIAN</span>
          <strong data-testid="online-turn-timer">{String(remainingSeconds).padStart(2, '0')}</strong>
          <small>GIÂY</small>
        </div>
      </div>

      <div className="turn-panel__tension">
        <span className="status-kicker">TRẠNG THÁI HỆ THỐNG</span>
        <div className="tension-meter" aria-label={tension.label}>
          <div className="tension-meter__bar">
            {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
          </div>
          <strong><i />{tension.shortLabel}</strong>
        </div>
      </div>

      <div className="turn-order">
        <span>THỨ TỰ</span>
        <ol>
          {rotated.map((player, index) => (
            <li key={player.id} className={index === 0 ? 'is-current' : ''}>
              <span>{player.nickname}</span>
              {index < rotated.length - 1 && <b aria-hidden="true">›</b>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
