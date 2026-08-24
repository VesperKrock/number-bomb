interface BrandProps {
  compact?: boolean
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className={`brand${compact ? ' brand--compact' : ''}`}>
      <div className="brand__eyebrow">
        <span className="brand__line" />
        TRÒ CHƠI CỤC BỘ // 01–99
        <span className="brand__line" />
      </div>
      <div className="brand__title-row">
        <span className="brand__mark" aria-hidden="true">
          <span />
        </span>
        <h1>BOM SỐ</h1>
      </div>
      {!compact && <p>Đừng chọn sai.</p>}
    </div>
  )
}
