import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { callOnlineRpc } from './rpc'
import type { OnlineRpcResult } from './types'

const canonicalResult: OnlineRpcResult = {
  ok: true,
  code: 'OK',
  serverNow: '2026-08-25T00:00:00.000Z',
  selfPlayerId: 'player',
  room: null,
  players: [],
  game: null,
  gamePlayers: [],
  action: null,
}

describe('online RPC transport', () => {
  it('retries one transport failure with the exact same idempotency arguments', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: new Error('response lost') })
      .mockResolvedValueOnce({ data: canonicalResult, error: null })
    const client = { rpc } as unknown as SupabaseClient
    const args = { p_request_id: '70000000-0000-4000-8000-000000000001' }

    await expect(callOnlineRpc(client, 'create_room', args)).resolves.toBe(canonicalResult)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenNthCalledWith(1, 'create_room', args)
    expect(rpc).toHaveBeenNthCalledWith(2, 'create_room', args)
  })

  it('returns a stable envelope after bounded retries are exhausted', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('offline') })
    const client = { rpc } as unknown as SupabaseClient

    await expect(callOnlineRpc(client, 'lock_number', {})).resolves.toMatchObject({
      ok: false,
      code: 'ONLINE_UNAVAILABLE',
      room: null,
    })
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})
