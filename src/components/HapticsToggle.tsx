interface HapticsToggleProps {
  enabled: boolean
  onToggle: () => void
}

export function HapticsToggle({ enabled, onToggle }: HapticsToggleProps) {
  return (
    <button
      className="haptics-toggle"
      type="button"
      aria-label={enabled ? 'Tắt rung' : 'Bật rung'}
      aria-pressed={enabled}
      onClick={onToggle}
    >
      <span className="haptics-toggle__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <rect x="7" y="3" width="10" height="18" rx="2" />
          <path d={enabled ? 'M4 8c-1 1-1 7 0 8m16-8c1 1 1 7 0 8M10 17h4' : 'M10 17h4'} />
        </svg>
      </span>
      <span>{enabled ? 'RUNG BẬT' : 'RUNG TẮT'}</span>
    </button>
  )
}
