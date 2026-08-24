import { useContext } from 'react'
import { OnlineSessionContext, type OnlineSessionValue } from './OnlineSessionContext'

export function useOnlineSession(): OnlineSessionValue {
  const value = useContext(OnlineSessionContext)
  if (!value) throw new Error('useOnlineSession must be used inside OnlineSessionProvider.')
  return value
}
