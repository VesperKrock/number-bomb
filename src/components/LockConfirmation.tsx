interface LockConfirmationProps {
  selectedNumber: number | null
  onClear: () => void
  onConfirm: () => void
}

export function LockConfirmation({
  selectedNumber,
  onClear,
  onConfirm,
}: LockConfirmationProps) {
  return (
    <div className={`lock-dock${selectedNumber !== null ? ' is-visible' : ''}`}>
      {selectedNumber === null ? (
        <>
          <p><span>◇</span> Chạm hoặc dùng bàn phím để chọn một số</p>
          <div className="mobile-lock-placeholder">
            <div className="lock-dock__choice">
              <span>CHƯA CHỌN</span>
              <strong>--</strong>
            </div>
            <button type="button" className="lock-button" disabled>
              <span className="lock-button__icon" aria-hidden="true" />
              KHÓA SỐ
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="lock-dock__choice">
            <span>SỐ ĐÃ CHỌN</span>
            <strong>{String(selectedNumber).padStart(2, '0')}</strong>
          </div>
          <div className="lock-dock__actions">
            <button type="button" className="change-button" onClick={onClear}>
              ĐỔI SỐ
            </button>
            <button type="button" className="lock-button" onClick={onConfirm}>
              <span className="lock-button__icon" aria-hidden="true" />
              KHÓA SỐ
            </button>
          </div>
        </>
      )}
    </div>
  )
}
