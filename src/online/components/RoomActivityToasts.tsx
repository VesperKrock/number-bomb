import { useEffect } from 'react'
import type { RoomActivity } from '../store/roomActivity'

interface RoomActivityToastsProps {
  activities: readonly RoomActivity[]
  onDismiss: (activityId: string) => void
}

export function RoomActivityToasts({ activities, onDismiss }: RoomActivityToastsProps) {
  useEffect(() => {
    const timers = activities.map((activity) => window.setTimeout(
      () => onDismiss(activity.id),
      Math.max(0, activity.expiresAtMs - Date.now()),
    ))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [activities, onDismiss])

  if (activities.length === 0) return null

  return (
    <div
      className="room-activity-stack"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="online-room-activity-stack"
    >
      {activities.map((activity) => (
        <div
          className={`room-activity room-activity--${activity.kind.toLowerCase()}`}
          data-testid="online-room-activity"
          key={activity.id}
        >
          <span aria-hidden="true">ROOM // ACTIVITY</span>
          <strong>{activity.message}</strong>
          <button
            type="button"
            aria-label="Đóng thông báo hoạt động phòng"
            onClick={() => onDismiss(activity.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
