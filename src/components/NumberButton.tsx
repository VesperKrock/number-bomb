interface NumberButtonProps {
  value: number
  selected: boolean
  interactionDisabled: boolean
  onSelect: (value: number) => void
}

export function NumberButton({
  value,
  selected,
  interactionDisabled,
  onSelect,
}: NumberButtonProps) {
  return (
    <button
      type="button"
      className={`number-cell is-valid${selected ? ' is-selected' : ''}`}
      disabled={interactionDisabled}
      aria-label={`Chọn số ${value}`}
      aria-pressed={selected}
      onClick={() => onSelect(value)}
    >
      <span>{String(value).padStart(2, '0')}</span>
      {selected && <i aria-hidden="true" />}
    </button>
  )
}
