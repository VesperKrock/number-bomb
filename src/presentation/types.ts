export type ResolutionPresentation =
  | { kind: 'idle'; number: null }
  | { kind: 'suspense'; number: number }
  | { kind: 'safe'; number: number }
  | { kind: 'boom'; number: number }
