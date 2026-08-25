import { describe, expect, it } from 'vitest'
import { clearRoomPointer, readRoomPointer, writeRoomPointer } from './storage'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('safe online room pointer', () => {
  it('round-trips only the room UUID and normalized code', () => {
    const storage = new MemoryStorage()
    writeRoomPointer({
      roomId: '10000000-0000-4000-8000-000000000001',
      roomCode: 'abc23',
    }, storage)

    expect(readRoomPointer(storage)).toEqual({
      roomId: '10000000-0000-4000-8000-000000000001',
      roomCode: 'ABC23',
    })
    expect(JSON.stringify(readRoomPointer(storage))).not.toContain('auth')
  })

  it('removes malformed or unsafe pointers', () => {
    const storage = new MemoryStorage()
    storage.setItem('bom-so:online-room:v1', JSON.stringify({
      roomId: 'not-a-uuid',
      roomCode: 'ABCDE',
      secret: 81,
    }))

    expect(readRoomPointer(storage)).toBeNull()
    expect(storage.length).toBe(0)
  })

  it('clears the pointer without affecting unrelated storage', () => {
    const storage = new MemoryStorage()
    storage.setItem('unrelated', 'keep')
    writeRoomPointer({
      roomId: '10000000-0000-4000-8000-000000000001',
      roomCode: '23456',
    }, storage)

    clearRoomPointer(storage)
    expect(readRoomPointer(storage)).toBeNull()
    expect(storage.getItem('unrelated')).toBe('keep')
  })
})
