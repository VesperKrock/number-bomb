interface AudioToggleProps {
  muted: boolean
  onToggle: () => void
}

export function AudioToggle({ muted, onToggle }: AudioToggleProps) {
  return (
    <button
      className="audio-toggle"
      type="button"
      aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
      aria-pressed={!muted}
      onClick={onToggle}
    >
      <span className="audio-toggle__icon" aria-hidden="true">
        {muted ? (
          <svg viewBox="0 0 24 24">
            <path d="M4 9v6h4l5 4V5L8 9H4Zm12 1 5 5m0-5-5 5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M4 9v6h4l5 4V5L8 9H4Zm12-1c1.2 1 2 2.4 2 4s-.8 3-2 4m2.5-10.5A8.7 8.7 0 0 1 22 12a8.7 8.7 0 0 1-3.5 6.5" />
          </svg>
        )}
      </span>
      <span>{muted ? 'ÂM TẮT' : 'ÂM BẬT'}</span>
    </button>
  )
}
