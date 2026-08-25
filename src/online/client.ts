import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getOnlineConfig } from './config'

let retainedClient: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  const result = getOnlineConfig()
  if (!result.config) return null

  if (!retainedClient) {
    retainedClient = createClient(
      result.config.url,
      result.config.publishableKey,
      {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: false,
          persistSession: true,
        },
        realtime: {
          params: { eventsPerSecond: 10 },
        },
      },
    )
  }

  return retainedClient
}

export function resetSupabaseClientForTests(): void {
  retainedClient = null
}
