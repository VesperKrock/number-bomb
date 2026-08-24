export type TensionLevel = 'calm' | 'uneasy' | 'danger' | 'critical' | 'terminal'

export type BoardDensity = 'compact' | 'focused' | 'danger' | 'critical' | 'terminal'

export interface AudioTensionParameters {
  droneFrequency: number
  droneGain: number
  droneCutoff: number
  bodyFrequency: number
  bodyBeatHz: number
  bodyGain: number
  textureMinDelayMs: number
  textureMaxDelayMs: number
  textureGain: number
  textureHarshness: number
  heartbeatBpm: number
  heartbeatGain: number
  heartbeatFrequency: number
  selectionMultiplier: number
  lockMultiplier: number
  boomImpactGain: number
}

export interface ResolutionDelayRange {
  minMs: number
  maxMs: number
}

export interface TensionProfile {
  level: TensionLevel
  label: string
  shortLabel: string
  boardDensity: BoardDensity
  resolutionDelay: ResolutionDelayRange
  audio: AudioTensionParameters
}

const PROFILES: Record<TensionLevel, TensionProfile> = {
  calm: {
    level: 'calm',
    label: 'Tín hiệu ổn định',
    shortLabel: 'ỔN ĐỊNH',
    boardDensity: 'compact',
    resolutionDelay: { minMs: 450, maxMs: 550 },
    audio: {
      droneFrequency: 46,
      droneGain: 0.009,
      droneCutoff: 220,
      bodyFrequency: 92,
      bodyBeatHz: 1.1,
      bodyGain: 0.36,
      textureMinDelayMs: 4_000,
      textureMaxDelayMs: 8_000,
      textureGain: 0.009,
      textureHarshness: 0.12,
      heartbeatBpm: 0,
      heartbeatGain: 0,
      heartbeatFrequency: 52,
      selectionMultiplier: 1,
      lockMultiplier: 1,
      boomImpactGain: 1.65,
    },
  },
  uneasy: {
    level: 'uneasy',
    label: 'Nhiễu nền đang gia tăng',
    shortLabel: 'BẤT AN',
    boardDensity: 'focused',
    resolutionDelay: { minMs: 520, maxMs: 640 },
    audio: {
      droneFrequency: 48,
      droneGain: 0.0115,
      droneCutoff: 240,
      bodyFrequency: 94,
      bodyBeatHz: 2.2,
      bodyGain: 0.39,
      textureMinDelayMs: 2_800,
      textureMaxDelayMs: 6_000,
      textureGain: 0.014,
      textureHarshness: 0.3,
      heartbeatBpm: 48,
      heartbeatGain: 0.014,
      heartbeatFrequency: 58,
      selectionMultiplier: 0.9,
      lockMultiplier: 0.9,
      boomImpactGain: 1.7,
    },
  },
  danger: {
    level: 'danger',
    label: 'Nhịp nguy hiểm tăng cao',
    shortLabel: 'NGUY HIỂM',
    boardDensity: 'danger',
    resolutionDelay: { minMs: 600, maxMs: 740 },
    audio: {
      droneFrequency: 50,
      droneGain: 0.015,
      droneCutoff: 270,
      bodyFrequency: 96,
      bodyBeatHz: 3.1,
      bodyGain: 0.43,
      textureMinDelayMs: 1_800,
      textureMaxDelayMs: 4_200,
      textureGain: 0.019,
      textureHarshness: 0.52,
      heartbeatBpm: 62,
      heartbeatGain: 0.026,
      heartbeatFrequency: 61,
      selectionMultiplier: 0.75,
      lockMultiplier: 0.78,
      boomImpactGain: 1.75,
    },
  },
  critical: {
    level: 'critical',
    label: 'Mạch khóa ở mức đỏ',
    shortLabel: 'BÁO ĐỘNG',
    boardDensity: 'critical',
    resolutionDelay: { minMs: 700, maxMs: 860 },
    audio: {
      droneFrequency: 52,
      droneGain: 0.019,
      droneCutoff: 300,
      bodyFrequency: 98,
      bodyBeatHz: 4.1,
      bodyGain: 0.47,
      textureMinDelayMs: 950,
      textureMaxDelayMs: 2_600,
      textureGain: 0.025,
      textureHarshness: 0.74,
      heartbeatBpm: 78,
      heartbeatGain: 0.041,
      heartbeatFrequency: 64,
      selectionMultiplier: 0.55,
      lockMultiplier: 0.62,
      boomImpactGain: 1.8,
    },
  },
  terminal: {
    level: 'terminal',
    label: 'Không còn đường lùi',
    shortLabel: 'TỚI HẠN',
    boardDensity: 'terminal',
    resolutionDelay: { minMs: 820, maxMs: 1_000 },
    audio: {
      droneFrequency: 54,
      droneGain: 0.022,
      droneCutoff: 330,
      bodyFrequency: 101,
      bodyBeatHz: 5.2,
      bodyGain: 0.5,
      textureMinDelayMs: 650,
      textureMaxDelayMs: 1_800,
      textureGain: 0.032,
      textureHarshness: 1,
      heartbeatBpm: 96,
      heartbeatGain: 0.055,
      heartbeatFrequency: 67,
      selectionMultiplier: 0.35,
      lockMultiplier: 0.45,
      boomImpactGain: 1.85,
    },
  },
}

export function getTensionProfile(candidateCount: number): TensionProfile {
  if (candidateCount <= 3) return PROFILES.terminal
  if (candidateCount <= 7) return PROFILES.critical
  if (candidateCount <= 15) return PROFILES.danger
  if (candidateCount <= 30) return PROFILES.uneasy
  return PROFILES.calm
}

export function getBoardDensity(candidateCount: number): BoardDensity {
  return getTensionProfile(candidateCount).boardDensity
}
