import type { Session, SupabaseClient, User } from '@supabase/supabase-js'

export interface OnlineIdentity {
  session: Session
  user: User
}

const pendingIdentities = new WeakMap<SupabaseClient, Promise<OnlineIdentity>>()

async function restoreOrCreateIdentity(client: SupabaseClient): Promise<OnlineIdentity> {
  const sessionResult = await client.auth.getSession()
  if (sessionResult.error) throw sessionResult.error
  if (sessionResult.data.session?.user) {
    return {
      session: sessionResult.data.session,
      user: sessionResult.data.session.user,
    }
  }

  const signInResult = await client.auth.signInAnonymously()
  if (signInResult.error) throw signInResult.error
  if (!signInResult.data.session || !signInResult.data.user) {
    throw new Error('Anonymous Auth did not return a session.')
  }

  return {
    session: signInResult.data.session,
    user: signInResult.data.user,
  }
}

export function ensureAnonymousIdentity(client: SupabaseClient): Promise<OnlineIdentity> {
  const pending = pendingIdentities.get(client)
  if (pending) return pending

  const request = restoreOrCreateIdentity(client).finally(() => {
    pendingIdentities.delete(client)
  })
  pendingIdentities.set(client, request)
  return request
}
