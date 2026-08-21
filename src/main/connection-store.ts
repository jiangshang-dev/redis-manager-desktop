import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { RedisConnectionConfig } from '../shared/types'

type StoredConnection = Omit<RedisConnectionConfig, 'password'> & {
  passwordEnc?: string
}

function filePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'connections.json')
}

function encrypt(text: string): string {
  if (!text) return ''
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(text).toString('base64')
  }
  return Buffer.from(text, 'utf8').toString('base64')
}

function decrypt(text: string | undefined): string {
  if (!text) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(text, 'base64'))
    }
    return Buffer.from(text, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

export function loadConnections(): RedisConnectionConfig[] {
  const path = filePath()
  if (!existsSync(path)) return []
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as StoredConnection[]
    return raw.map((item) => ({
      ...item,
      port: Number(item.port) || 6379,
      db: Number(item.db) || 0,
      delimiter: item.delimiter || ':',
      tls: Boolean(item.tls),
      password: decrypt(item.passwordEnc)
    }))
  } catch {
    return []
  }
}

export function saveConnections(list: RedisConnectionConfig[]): void {
  const stored: StoredConnection[] = list.map(({ password, ...rest }) => ({
    ...rest,
    passwordEnc: encrypt(password || '')
  }))
  writeFileSync(filePath(), JSON.stringify(stored, null, 2), 'utf8')
}

export function upsertConnection(
  list: RedisConnectionConfig[],
  incoming: RedisConnectionConfig
): RedisConnectionConfig[] {
  const index = list.findIndex((item) => item.id === incoming.id)
  if (index >= 0) {
    const next = [...list]
    next[index] = incoming
    return next
  }
  return [...list, incoming]
}
