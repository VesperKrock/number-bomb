export const ONLINE_NICKNAME_MAX_LENGTH = 20

const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u

export function normalizeNickname(value: string): string {
  return value.trim().replace(/\s+/gu, ' ')
}

export function validateNickname(value: string):
  | { ok: true; nickname: string; nicknameKey: string }
  | { ok: false; code: 'INVALID_NICKNAME' } {
  const nickname = normalizeNickname(value)
  const length = Array.from(nickname).length

  if (
    length < 1
    || length > ONLINE_NICKNAME_MAX_LENGTH
    || CONTROL_CHARACTER_PATTERN.test(nickname)
  ) {
    return { ok: false, code: 'INVALID_NICKNAME' }
  }

  return { ok: true, nickname, nicknameKey: nickname.toLowerCase() }
}
