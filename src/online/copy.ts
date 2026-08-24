import type {
  FinishReason,
  OnlineResultCode,
  PendingOrigin,
  TimeoutPolicy,
} from './types'

const ERROR_COPY: Partial<Record<OnlineResultCode, string>> = {
  UNAUTHENTICATED: 'Không thể xác thực phiên ẩn danh.',
  INVALID_NICKNAME: 'Tên phải có từ 1 đến 20 ký tự.',
  INVALID_ROOM_CODE: 'Mã phòng phải gồm đúng 5 ký tự hợp lệ.',
  ROOM_NOT_FOUND: 'Phòng không còn tồn tại.',
  ROOM_EXPIRED: 'Phòng đã hết hạn.',
  ROOM_FULL: 'Phòng đã đủ người.',
  ROOM_ALREADY_PLAYING: 'Ván chơi đã bắt đầu.',
  NICKNAME_TAKEN: 'Tên này đã được dùng trong phòng.',
  ROOM_CODE_EXHAUSTED: 'Không thể cấp mã phòng. Hãy thử lại.',
  KICKED: 'Bạn đã bị mời khỏi phòng.',
  NOT_ROOM_MEMBER: 'Phiên này không còn là thành viên phòng.',
  NOT_HOST: 'Chỉ chủ phòng mới có quyền thực hiện thao tác này.',
  INVALID_SETTINGS: 'Thiết lập phòng không hợp lệ.',
  NOT_ENOUGH_PLAYERS: 'Cần ít nhất 2 người đang kết nối.',
  STALE_ROOM_VERSION: 'Phòng vừa thay đổi. Trạng thái mới đã được tải lại.',
  GAME_NOT_FOUND: 'Không tìm thấy ván hiện tại.',
  STALE_GAME_VERSION: 'Ván vừa thay đổi. Trạng thái mới đã được tải lại.',
  NOT_YOUR_TURN: 'Chưa đến lượt của bạn.',
  INVALID_CANDIDATE: 'Con số này không còn hợp lệ.',
  DEADLINE_PASSED: 'Thời gian lượt đã hết.',
  TOO_EARLY: 'Hệ thống chưa đến thời điểm xử lý.',
  INVALID_PHASE: 'Thao tác không hợp lệ ở trạng thái hiện tại.',
  REQUEST_ID_REUSED: 'Yêu cầu bị trùng định danh.',
  HOST_STILL_ACTIVE: 'Chủ phòng vẫn còn hoạt động.',
  NO_HOST_CANDIDATE: 'Chưa có người đủ điều kiện nhận quyền chủ phòng.',
  ONLINE_UNAVAILABLE: 'Kết nối online đang gián đoạn. Hãy thử lại.',
}

export function getOnlineErrorCopy(code: OnlineResultCode | null): string | null {
  if (!code || code === 'OK' || code === 'ALREADY_JOINED' || code === 'ALREADY_APPLIED') {
    return null
  }
  if (code === 'ALREADY_RESOLVED') return 'Kết quả đã được thiết bị khác xác nhận.'
  return ERROR_COPY[code] ?? 'Không thể hoàn tất thao tác.'
}

export function getTimeoutPolicyLabel(policy: TimeoutPolicy): string {
  if (policy === 'SELF_DESTRUCT') return 'TỰ HỦY KHI HẾT GIỜ'
  if (policy === 'RANDOM_PICK') return 'HỆ THỐNG CHỌN NGẪU NHIÊN'
  return 'NGẪU NHIÊN · 2 CẢNH CÁO'
}

export function getFinishCopy(
  reason: FinishReason,
  nickname: string,
  origin: PendingOrigin | null = null,
): string {
  if (reason === 'TIMEOUT_SELF_DESTRUCT') {
    return `${nickname} đã để thời gian cạn kiệt.`
  }
  if (reason === 'TIMEOUT_STRIKES_EXCEEDED') {
    return `${nickname} đã nhận đủ hai cảnh cáo thời gian.`
  }
  if (origin === 'TIMEOUT_RANDOM') {
    return `Hệ thống đã chọn trúng số bom trong lượt của ${nickname}.`
  }
  return `${nickname} đã kích nổ quả bom.`
}
