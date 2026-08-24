interface FinalCandidateProps {
  playerName: string
  candidate: number
  disabled: boolean
  onTrigger: () => void
}

export function FinalCandidate({
  playerName,
  candidate,
  disabled,
  onTrigger,
}: FinalCandidateProps) {
  return (
    <section className="final-candidate" aria-labelledby="final-candidate-title">
      <div className="final-candidate__signal" aria-hidden="true">
        <i /><i /><i />
      </div>
      <span className="section-index">[ TRẠNG THÁI CUỐI ]</span>
      <h2 id="final-candidate-title">CHỈ CÒN MỘT CON SỐ.</h2>
      <p><strong>{playerName}</strong>, lựa chọn đã được định đoạt.</p>
      <div className="final-candidate__number" aria-label={`Số cuối cùng ${candidate}`}>
        {String(candidate).padStart(2, '0')}
      </div>
      <button type="button" disabled={disabled} onClick={onTrigger}>
        <span aria-hidden="true">⚡</span>
        KÍCH NỔ
      </button>
      <small>HÀNH ĐỘNG NÀY KHÔNG THỂ HOÀN TÁC</small>
    </section>
  )
}
