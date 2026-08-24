import { describe, expect, it } from 'vitest'
import { getFinishCopy, getTimeoutPolicyLabel } from './copy'

describe('online timeout copy', () => {
  it('maps every timeout policy to distinct player-facing copy', () => {
    expect(getTimeoutPolicyLabel('SELF_DESTRUCT')).toBe('TỰ HỦY KHI HẾT GIỜ')
    expect(getTimeoutPolicyLabel('RANDOM_PICK')).toBe('HỆ THỐNG CHỌN NGẪU NHIÊN')
    expect(getTimeoutPolicyLabel('RANDOM_PICK_WITH_2_STRIKES'))
      .toBe('NGẪU NHIÊN · 2 CẢNH CÁO')
  })

  it('never claims a timeout victim manually selected the bomb', () => {
    expect(getFinishCopy('TIMEOUT_SELF_DESTRUCT', 'An'))
      .toBe('An đã để thời gian cạn kiệt.')
    expect(getFinishCopy('TIMEOUT_STRIKES_EXCEEDED', 'An'))
      .toBe('An đã nhận đủ hai cảnh cáo thời gian.')
    expect(getFinishCopy('BOMB_HIT', 'An', 'TIMEOUT_RANDOM'))
      .toBe('Hệ thống đã chọn trúng số bom trong lượt của An.')
  })

  it('retains direct lock BOOM copy for player locks', () => {
    expect(getFinishCopy('BOMB_HIT', 'An', 'PLAYER_LOCK'))
      .toBe('An đã kích nổ quả bom.')
  })
})
