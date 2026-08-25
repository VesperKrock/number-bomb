export interface OnlineConfig {
  url: string
  publishableKey: string
}

export interface OnlineConfigResult {
  available: boolean
  config: OnlineConfig | null
  reason: 'READY' | 'MISSING_ENV' | 'INVALID_URL' | 'INVALID_KEY'
}

export function parseOnlineConfig(
  urlValue: string | undefined,
  keyValue: string | undefined,
): OnlineConfigResult {
  const url = urlValue?.trim() ?? ''
  const publishableKey = keyValue?.trim() ?? ''

  if (!url || !publishableKey) {
    return { available: false, config: null, reason: 'MISSING_ENV' }
  }

  try {
    const parsed = new URL(url)
    const isHttps = parsed.protocol === 'https:'
    const isLocalHttp = parsed.protocol === 'http:'
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    if (!isHttps && !isLocalHttp) {
      return { available: false, config: null, reason: 'INVALID_URL' }
    }
    if (
      parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || parsed.pathname !== '/'
    ) {
      return { available: false, config: null, reason: 'INVALID_URL' }
    }
  } catch {
    return { available: false, config: null, reason: 'INVALID_URL' }
  }

  const isPublishableKey = publishableKey.startsWith('sb_publishable_')
  const isLegacyAnonKey = publishableKey.split('.').length === 3
  if (!isPublishableKey && !isLegacyAnonKey) {
    return { available: false, config: null, reason: 'INVALID_KEY' }
  }

  return {
    available: true,
    config: { url: url.replace(/\/+$/u, ''), publishableKey },
    reason: 'READY',
  }
}

export function getOnlineConfig(): OnlineConfigResult {
  return parseOnlineConfig(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  )
}
