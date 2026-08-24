import { isValidRoomCode, normalizeRoomCode } from './roomCode'
import type { OnlineRoomPointer } from './types'

const ONLINE_ROOM_POINTER_KEY = 'bom-so:online-room:v1'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export function readRoomPointer(storage: Storage = window.localStorage): OnlineRoomPointer | null {
  try {
    const raw = storage.getItem(ONLINE_ROOM_POINTER_KEY)
    if (!raw) return null
    const candidate = JSON.parse(raw) as Partial<OnlineRoomPointer>
    if (
      typeof candidate.roomId !== 'string'
      || !UUID_PATTERN.test(candidate.roomId)
      || typeof candidate.roomCode !== 'string'
      || !isValidRoomCode(candidate.roomCode)
    ) {
      storage.removeItem(ONLINE_ROOM_POINTER_KEY)
      return null
    }
    return { roomId: candidate.roomId, roomCode: normalizeRoomCode(candidate.roomCode) }
  } catch {
    return null
  }
}

export function writeRoomPointer(
  pointer: OnlineRoomPointer,
  storage: Storage = window.localStorage,
): void {
  try {
    storage.setItem(ONLINE_ROOM_POINTER_KEY, JSON.stringify(pointer))
  } catch {
    // Reconnect remains available through the room code when storage is blocked.
  }
}

export function clearRoomPointer(storage: Storage = window.localStorage): void {
  try {
    storage.removeItem(ONLINE_ROOM_POINTER_KEY)
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}
