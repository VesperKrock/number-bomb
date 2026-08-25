import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export interface RealtimeDropRule {
  table: string
  eventType?: string
  phases?: string[]
  remaining?: number
}

export interface DroppedRealtimeChange {
  table: string
  eventType: string
  new: Record<string, unknown>
  old: Record<string, unknown>
}

export interface RealtimeEventLossTestControl {
  rules: RealtimeDropRule[]
  suppressPresenceWake?: boolean
  dropped: DroppedRealtimeChange[]
  inject?: (change: DroppedRealtimeChange) => void
}

declare global {
  interface Window {
    __BOM_SO_ONLINE_REALTIME_EVENT_LOSS__?: RealtimeEventLossTestControl
  }
}

export function shouldDropRealtimeChange(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  control: RealtimeEventLossTestControl | undefined,
  testMode: boolean,
): boolean {
  if (!testMode || !control) return false
  const nextRow = payload.new as Record<string, unknown>
  const phase = typeof nextRow.phase === 'string' ? nextRow.phase : null
  const rule = control.rules.find((candidate) => (
    candidate.table === payload.table
    && (!candidate.eventType || candidate.eventType === payload.eventType)
    && (!candidate.phases || (phase !== null && candidate.phases.includes(phase)))
    && candidate.remaining !== 0
  ))
  if (!rule) return false
  if (typeof rule.remaining === 'number') rule.remaining -= 1
  control.dropped.push({
    table: payload.table,
    eventType: payload.eventType,
    new: { ...nextRow },
    old: { ...(payload.old as Record<string, unknown>) },
  })
  return true
}
