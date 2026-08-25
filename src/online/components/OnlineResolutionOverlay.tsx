import type { PendingResolution } from '../types'

interface OnlineResolutionOverlayProps {
  pending: PendingResolution | null
  safeNumber: number | null
}

export function OnlineResolutionOverlay({ pending, safeNumber }: OnlineResolutionOverlayProps) {
  if (!pending && safeNumber === null) return null
  const isSafe = safeNumber !== null
  const number = isSafe ? safeNumber : pending?.lockedNumber
  const isTimeoutLoss = pending?.origin === 'TIMEOUT_SELF_DESTRUCT'
    || pending?.origin === 'TIMEOUT_STRIKES_EXCEEDED'

  return (
    <div
      className={`resolution-overlay resolution-overlay--${isSafe ? 'safe' : 'suspense'}`}
      role={isSafe ? 'status' : undefined}
      aria-live={isSafe ? 'polite' : 'off'}
      data-testid="online-resolution-overlay"
    >
      <div className="resolution-card">
        <span className="resolution-card__code">
          {isSafe ? 'KẾT QUẢ // ĐÃ ĐỒNG BỘ' : isTimeoutLoss ? 'HẾT GIỜ // ĐANG XỬ LÝ' : 'ĐÃ KHÓA // CHỜ KẾT QUẢ'}
        </span>
        <strong className="resolution-card__number">
          {number === null || number === undefined ? '--' : String(number).padStart(2, '0')}
        </strong>
        {isSafe ? (
          <><h2>AN TOÀN</h2><p>PHẠM VI ĐÃ ĐỒNG BỘ TRÊN TẤT CẢ THIẾT BỊ</p></>
        ) : (
          <>
            <div className="scan-progress" aria-hidden="true"><i /></div>
            <p>{isTimeoutLoss ? 'HỆ THỐNG ĐANG XÁC NHẬN THẤT BẠI' : 'ĐANG ĐỐI CHIẾU VỚI SỐ BOM'}</p>
          </>
        )}
      </div>
    </div>
  )
}
