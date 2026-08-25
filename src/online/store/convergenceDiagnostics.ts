export type OnlineConvergenceDiagnosticKind =
  | 'CHANNEL_STATUS'
  | 'POSTGRES_WAKE'
  | 'SNAPSHOT_COALESCED'
  | 'SNAPSHOT_REQUEST'
  | 'SNAPSHOT_RESPONSE'
  | 'SNAPSHOT_APPLIED'
  | 'SNAPSHOT_IGNORED'
  | 'PRESENTATION_OBSERVED'
  | 'PRESENTATION_CONSUMED'
  | 'PRESENTATION_SKIPPED'

export interface OnlineConvergenceDiagnostic {
  sequence: number
  clientInstanceId: string
  kind: OnlineConvergenceDiagnosticKind
  atMs: number
  source?: string
  table?: string
  eventType?: string
  requestGeneration?: number
  roomVersion?: number | null
  gameVersion?: number | null
  playerCount?: number
  phase?: string | null
  reason?: string
  presentationKey?: string
}

declare global {
  interface Window {
    __BOM_SO_ONLINE_CONVERGENCE_DIAGNOSTICS__?: OnlineConvergenceDiagnostic[]
  }
}

let diagnosticSequence = 0

export function traceOnlineConvergence(
  event: Omit<OnlineConvergenceDiagnostic, 'sequence' | 'atMs'>,
): void {
  if (typeof window === 'undefined') return
  const sink = window.__BOM_SO_ONLINE_CONVERGENCE_DIAGNOSTICS__
  if (!sink) return
  diagnosticSequence += 1
  sink.push({
    ...event,
    sequence: diagnosticSequence,
    atMs: performance.now(),
  })
}
