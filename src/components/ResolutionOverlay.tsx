import type { ResolutionPresentation } from '../presentation/types'

interface ResolutionOverlayProps {
  presentation: ResolutionPresentation
}

export function ResolutionOverlay({ presentation }: ResolutionOverlayProps) {
  if (presentation.kind === 'idle' || presentation.kind === 'boom') return null

  const isSafe = presentation.kind === 'safe'

  return (
    <div
      className={`resolution-overlay resolution-overlay--${presentation.kind}`}
      role={isSafe ? 'status' : undefined}
      aria-live={isSafe ? 'polite' : 'off'}
      data-testid="resolution-overlay"
    >
      <div className="resolution-card">
        <span className="resolution-card__code">
          {isSafe ? 'KẾT QUẢ // XÁC NHẬN' : 'ĐANG QUÉT // KHÓA TẦN SỐ'}
        </span>
        <strong className="resolution-card__number">
          {String(presentation.number).padStart(2, '0')}
        </strong>
        {isSafe ? (
          <>
            <h2>AN TOÀN</h2>
            <p>PHẠM VI ĐÃ ĐƯỢC CẬP NHẬT</p>
          </>
        ) : (
          <>
            <div className="scan-progress" aria-hidden="true"><i /></div>
            <p>ĐANG ĐỐI CHIẾU VỚI SỐ BOM</p>
          </>
        )}
      </div>
    </div>
  )
}
