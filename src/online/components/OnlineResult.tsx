import { getFinishCopy } from '../copy'
import type { ExplosionPresentationVariant, OnlineGameState } from '../types'

interface OnlineResultProps {
  game: OnlineGameState
  loserName: string
  variant: ExplosionPresentationVariant
  liveImpact: boolean
  isHost: boolean
  busy: boolean
  onReplay: () => void
  onLobby: () => void
  onLeave: () => void
}

const FRAGMENTS = Array.from({ length: 22 }, (_, index) => index)

export function OnlineResult({
  game,
  loserName,
  variant,
  liveImpact,
  isHost,
  busy,
  onReplay,
  onLobby,
  onLeave,
}: OnlineResultProps) {
  const reason = game.finishReason!
  return (
    <section
      className={`boom-result online-boom-result online-boom-result--${variant}${liveImpact ? ' is-live-impact' : ' is-settled'}`}
      role="alert"
      aria-live="assertive"
      data-testid="online-boom-result"
      data-impact-profile={variant}
    >
      {liveImpact && <div className="impact-flash" aria-hidden="true" />}
      <div className="impact-wash" aria-hidden="true" />
      {liveImpact && (
        <div className="fragments" aria-hidden="true">
          {FRAGMENTS.map((fragment) => (
            <i
              key={fragment}
              style={{
                '--fragment': fragment,
                '--angle': `${(360 / FRAGMENTS.length) * fragment}deg`,
                '--distance': `${90 + (fragment % 5) * 34}px`,
                '--fragment-width': `${4 + (fragment % 4) * 2}px`,
                '--fragment-height': `${10 + (fragment % 3) * 5}px`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      <div className="boom-result__content">
        <span className="boom-result__warning">
          {reason === 'BOMB_HIT' ? 'CẢNH BÁO // KÍCH NỔ' : 'CẢNH BÁO // HẾT THỜI GIAN'}
        </span>
        <div className="boom-word" aria-label={reason === 'BOMB_HIT' ? 'Bùm!' : 'Thất bại!'}>
          {reason === 'BOMB_HIT'
            ? <><span>B</span><span>Ù</span><span>M</span><b>!</b></>
            : <><span>H</span><span>Ế</span><span>T</span><b>!</b></>}
        </div>
        <p>{getFinishCopy(reason, loserName, game.lastActionOrigin)}</p>
        <div className="bomb-reveal">
          <span>SỐ BOM</span>
          <strong>{String(game.revealedBombNumber).padStart(2, '0')}</strong>
        </div>
        <p className="online-impact-note">
          {variant === 'victim' ? 'THIẾT BỊ NẠN NHÂN // TOÀN CƯỜNG ĐỘ' : 'THIẾT BỊ NGƯỜI XEM // CƯỜNG ĐỘ GIẢM'}
        </p>
        <div className="boom-result__actions online-result-actions">
          {isHost && (
            <>
              <button type="button" className="replay-button" disabled={busy} onClick={onReplay}>
                CHƠI LẠI
              </button>
              <button type="button" className="setup-button" disabled={busy} onClick={onLobby}>
                VỀ PHÒNG CHỜ
              </button>
            </>
          )}
          <button type="button" className="setup-button" disabled={busy} onClick={onLeave}>
            RỜI PHÒNG
          </button>
        </div>
        {!isHost && <small>ĐANG CHỜ CHỦ PHÒNG CHỌN LƯỢT TIẾP THEO</small>}
      </div>
    </section>
  )
}
