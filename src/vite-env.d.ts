/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_E2E_BOMB_NUMBER?: string
  readonly VITE_E2E_FAST?: string
  readonly VITE_E2E_AUDIO_DIAGNOSTICS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
