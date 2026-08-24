const MAX_LEDGER_ENTRIES = 64

export type OnlinePresentationKind = 'LOCK' | 'SAFE' | 'BOOM'

export function presentationKey(
  gameId: string,
  version: number,
  kind: OnlinePresentationKind,
): string {
  return `${gameId}:${version}:${kind}`
}

export class PresentationLedger {
  private entries = new Set<string>()

  consume(key: string): boolean {
    if (this.entries.has(key)) return false
    this.entries.add(key)
    if (this.entries.size > MAX_LEDGER_ENTRIES) {
      const oldest = this.entries.values().next().value
      if (oldest) this.entries.delete(oldest)
    }
    return true
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  clear(): void {
    this.entries.clear()
  }
}
