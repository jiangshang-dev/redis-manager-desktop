export type RedisConnectionConfig = {
  id: string
  name: string
  host: string
  port: number
  username?: string
  password?: string
  db: number
  delimiter: string
  tls: boolean
}

export type KeyType =
  | 'string'
  | 'hash'
  | 'list'
  | 'set'
  | 'zset'
  | 'stream'
  | 'json'
  | 'none'
  | string

export type KeyDetail = {
  exists: boolean
  key: string
  type: KeyType
  ttl: number
  encoding: string | null
  size: number
  value: unknown
  truncated: boolean
}

export type HashRow = { field: string; value: string }
export type ZSetRow = { member: string; score: number }
export type StreamRow = { id: string; fields: Record<string, string> }

export type RedisInfo = {
  version: string
  mode: string
  os: string
  connectedClients: string
  usedMemory: string
  totalKeys: number
  dbs: Array<{ db: number; keys: number; expires: number }>
}

export type ScanResult = {
  keys: string[]
  durationMs: number
}
