import type { GameState } from '../game'
import type { TensionProfile } from '../presentation/tension'

interface TurnPanelProps {
  game: GameState
  candidateCount: number
  tension: TensionProfile
}

export function TurnPanel({ game, candidateCount, tension }: TurnPanelProps) {
  const currentPlayer = game.players[game.currentPlayerIndex]
  const rotatedPlayers = game.players.map(
    (_, offset) => game.players[(game.currentPlayerIndex + offset) % game.players.length],
  )

  return (
    <section className="turn-panel" aria-label="Thông tin lượt chơi">
      <div className="turn-panel__player" aria-label={`Lượt hiện tại: ${currentPlayer.name}`}>
        <span className="status-kicker">LƯỢT HIỆN TẠI</span>
        <div className="player-callout">
          <span className="player-callout__index">
            P{String(game.currentPlayerIndex + 1).padStart(2, '0')}
          </span>
          <div>
            <strong data-testid="current-player">{currentPlayer.name}</strong>
            <small>HÃY CHỌN MỘT SỐ</small>
          </div>
        </div>
      </div>

      <div className="turn-panel__metrics">
        <div>
          <span>PHẠM VI HỢP LỆ</span>
          <strong
            data-testid="valid-range"
            aria-label={`Phạm vi hợp lệ từ ${game.lowerCandidate} đến ${game.upperCandidate}`}
          >
            {String(game.lowerCandidate).padStart(2, '0')}
            <i>—</i>
            {String(game.upperCandidate).padStart(2, '0')}
          </strong>
        </div>
        <div>
          <span>CÒN LẠI</span>
          <strong
            data-testid="candidate-count"
            aria-label={`Còn lại ${candidateCount} số`}
          >
            {candidateCount}
          </strong>
          <small>CON SỐ</small>
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

      <div className="turn-order" aria-label="Thứ tự lượt chơi">
        <span>TIẾP THEO</span>
        <ol>
          {rotatedPlayers.map((player, index) => (
            <li key={player.id} className={index === 0 ? 'is-current' : ''}>
              <span>{player.name}</span>
              {index < rotatedPlayers.length - 1 && <b aria-hidden="true">›</b>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
