import { useEffect, useRef } from 'react'
import type { BoardDensity } from '../presentation/tension'
import { NumberButton } from './NumberButton'

interface NumberBoardProps {
  candidates: number[]
  selectedNumber: number | null
  density: BoardDensity
  interactionDisabled: boolean
  onSelect: (value: number) => void
}

export function NumberBoard({
  candidates,
  selectedNumber,
  density,
  interactionDisabled,
  onSelect,
}: NumberBoardProps) {
  const firstCandidate = candidates[0]
  const lastCandidate = candidates[candidates.length - 1]
  const boardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    boardRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [firstCandidate, lastCandidate])

  return (
    <section
      className={`board-section board-section--${density}`}
      aria-labelledby="board-title"
      data-testid="board-stage"
    >
      <div className="board-heading">
        <div>
          <span className="section-index">[ 01 ]</span>
          <h2 id="board-title">CHỌN TẦN SỐ</h2>
        </div>
        <p>
          <i aria-hidden="true" /> PHẠM VI ĐANG HOẠT ĐỘNG
          <span>{candidates.length} ĐIỂM NGUY HIỂM</span>
        </p>
      </div>

      <div
        ref={boardRef}
        className={`number-board density-${density}`}
        data-density={density}
        data-candidate-min={firstCandidate}
        data-candidate-max={lastCandidate}
        data-candidate-count={candidates.length}
        data-testid="number-board"
        aria-label={`Các số còn lại từ ${firstCandidate} đến ${lastCandidate}`}
      >
        {candidates.map((value) => (
          <NumberButton
            key={value}
            value={value}
            selected={selectedNumber === value}
            interactionDisabled={interactionDisabled}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  )
}
