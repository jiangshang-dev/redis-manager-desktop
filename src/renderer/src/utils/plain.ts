import type { RedisConnectionConfig } from '../../../shared/types'

export function toPlain<T>(value: T): T {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

export function toConnection(config: RedisConnectionConfig): RedisConnectionConfig {
  return {
    id: String(config.id ?? ''),
    name: String(config.name ?? ''),
    host: String(config.host ?? '127.0.0.1'),
    port: Number(config.port) || 6379,
    username: config.username ? String(config.username) : '',
    password: config.password ? String(config.password) : '',
    db: Number(config.db) || 0,
    delimiter: String(config.delimiter || ':'),
    tls: Boolean(config.tls)
  }
}
