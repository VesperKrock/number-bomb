import { describe, expect, it } from 'vitest'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import {
  shouldDropRealtimeChange,
  type RealtimeEventLossTestControl,
} from './eventLossTestControl'

function payload(table: string, phase?: string) {
  return {
    table,
    eventType: 'UPDATE',
    new: { version: 3, phase },
    old: { version: 2 },
  } as unknown as RealtimePostgresChangesPayload<Record<string, unknown>>
}

describe('Realtime event-loss test control', () => {
  it('is inert outside explicitly enabled E2E mode', () => {
    const control: RealtimeEventLossTestControl = {
      rules: [{ table: 'rooms' }],
      dropped: [],
    }
    expect(shouldDropRealtimeChange(payload('rooms'), control, false)).toBe(false)
    expect(control.dropped).toHaveLength(0)
  })

  it('drops only matching bounded rules and captures a reinjectable copy', () => {
    const control: RealtimeEventLossTestControl = {
      rules: [{ table: 'room_games', phases: ['RESOLVING'], remaining: 1 }],
      dropped: [],
    }
    expect(shouldDropRealtimeChange(payload('room_games', 'PLAYING_TURN'), control, true)).toBe(false)
    expect(shouldDropRealtimeChange(payload('room_games', 'RESOLVING'), control, true)).toBe(true)
    expect(shouldDropRealtimeChange(payload('room_games', 'RESOLVING'), control, true)).toBe(false)
    expect(control.dropped).toHaveLength(1)
  })
})
