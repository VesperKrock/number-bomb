export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const ROOM_CODE_LENGTH = 5
export const ROOM_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/u

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(value))
}

export function createRoomJoinUrl(
  code: string,
  origin: string,
  baseUrl: string,
): URL {
  const normalizedCode = normalizeRoomCode(code)
  return new URL(
    `?room=${encodeURIComponent(normalizedCode)}`,
    new URL(baseUrl, origin),
  )
}

export function getDeepLinkedRoomCode(search: string): string | null {
  const code = normalizeRoomCode(new URLSearchParams(search).get('room') ?? '')
  return ROOM_CODE_PATTERN.test(code) ? code : null
}
