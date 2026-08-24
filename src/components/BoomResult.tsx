interface BoomResultProps {
  playerName: string
  bombNumber: number
  onReplay: () => void
  onSetup: () => void
}

const FRAGMENTS = Array.from({ length: 22 }, (_, index) => index)

export function BoomResult({
  playerName,
  bombNumber,
  onReplay,
  onSetup,
}: BoomResultProps) {
  return (
    <section className="boom-result" role="alert" aria-live="assertive" data-testid="boom-result">
      <div className="impact-flash" aria-hidden="true" />
      <div className="impact-wash" aria-hidden="true" />
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

      <div className="boom-result__content">
        <span className="boom-result__warning">CẢNH BÁO // KÍCH NỔ</span>
        <div className="boom-word" aria-label="Bùm!">
          <span>B</span><span>Ù</span><span>M</span><b>!</b>
        </div>
        <p><strong>{playerName}</strong> đã kích nổ quả bom.</p>
        <div className="bomb-reveal">
          <span>SỐ BOM</span>
          <strong>{String(bombNumber).padStart(2, '0')}</strong>
        </div>
        <div className="boom-result__actions">
          <button type="button" className="replay-button" onClick={onReplay}>
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M20 11a8 8 0 1 0-2 5.3M20 5v6h-6" />
            </svg>
            CHƠI LẠI
          </button>
          <button type="button" className="setup-button" onClick={onSetup}>
            VỀ THIẾT LẬP
          </button>
        </div>
      </div>
    </section>
  )
}
