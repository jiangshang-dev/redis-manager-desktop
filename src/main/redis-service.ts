import Redis from 'ioredis'
import type {
  HashRow,
  KeyDetail,
  RedisConnectionConfig,
  RedisInfo,
  ScanResult,
  StreamRow,
  ZSetRow
} from '../shared/types'

const PAGE_SIZE = 200

type ClientEntry = {
  client: Redis
  config: RedisConnectionConfig
}

function createClient(config: RedisConnectionConfig): Redis {
  return new Redis({
    host: config.host,
    port: config.port,
    username: config.username || undefined,
    password: config.password || undefined,
    db: config.db,
    tls: config.tls ? {} : undefined,
    connectTimeout: 8000,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 3) return null
      return Math.min(times * 200, 1000)
    }
  })
}

function parseInfo(text: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return map
}

function toRowsFromWithScores(raw: string[]): ZSetRow[] {
  const rows: ZSetRow[] = []
  for (let i = 0; i < raw.length; i += 2) {
    rows.push({ member: raw[i], score: Number(raw[i + 1]) })
  }
  return rows
}

export class RedisService {
  private clients = new Map<string, ClientEntry>()

  get(id: string): Redis {
    const entry = this.clients.get(id)
    if (!entry) throw new Error('当前连接未建立，请先连接 Redis')
    return entry.client
  }

  isConnected(id: string): boolean {
    const entry = this.clients.get(id)
    return Boolean(entry && entry.client.status === 'ready')
  }

  async test(config: RedisConnectionConfig): Promise<{ ok: boolean; message: string }> {
    const client = createClient(config)
    try {
      await client.connect()
      const pong = await client.ping()
      return { ok: pong === 'PONG', message: pong }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    } finally {
      client.disconnect()
    }
  }

  async connect(config: RedisConnectionConfig): Promise<void> {
    await this.disconnect(config.id)
    const client = createClient(config)
    await client.connect()
    this.clients.set(config.id, { client, config })
    return
  }

  async disconnect(id: string): Promise<void> {
    const entry = this.clients.get(id)
    if (!entry) return
    entry.client.disconnect()
    this.clients.delete(id)
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.clients.keys()].map((id) => this.disconnect(id)))
  }

  async selectDb(id: string, db: number): Promise<void> {
    const entry = this.clients.get(id)
    if (!entry) throw new Error('当前连接未建立，请先连接 Redis')
    await entry.client.select(db)
    entry.config.db = db
  }

  async ping(id: string): Promise<string> {
    return this.get(id).ping()
  }

  async info(id: string): Promise<RedisInfo> {
    const client = this.get(id)
    const text = await client.info()
    const map = parseInfo(text)
    const dbs: RedisInfo['dbs'] = []
    let totalKeys = 0
    for (const [key, value] of Object.entries(map)) {
      const match = key.match(/^db(\d+)$/)
      if (!match) continue
      const db = Number(match[1])
      const keys = Number(/keys=(\d+)/.exec(value)?.[1] || 0)
      const expires = Number(/expires=(\d+)/.exec(value)?.[1] || 0)
      totalKeys += keys
      dbs.push({ db, keys, expires })
    }
    dbs.sort((a, b) => a.db - b.db)
    return {
      version: map.redis_version || '-',
      mode: map.redis_mode || 'standalone',
      os: map.os || '-',
      connectedClients: map.connected_clients || '0',
      usedMemory: map.used_memory_human || '-',
      totalKeys,
      dbs
    }
  }

  async scanKeys(id: string, pattern = '*'): Promise<ScanResult> {
    const client = this.get(id)
    const started = Date.now()
    const keys: string[] = []
    let cursor = '0'
    do {
      const [next, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000)
      cursor = next
      keys.push(...batch)
    } while (cursor !== '0')
    keys.sort()
    return { keys, durationMs: Date.now() - started }
  }

  async keyTypes(id: string, keys: string[]): Promise<Record<string, string>> {
    const client = this.get(id)
    const result: Record<string, string> = {}
    for (let i = 0; i < keys.length; i += 200) {
      const chunk = keys.slice(i, i + 200)
      const pipeline = client.pipeline()
      chunk.forEach((key) => pipeline.type(key))
      const reply = await pipeline.exec()
      chunk.forEach((key, index) => {
        const item = reply?.[index]
        result[key] = item && !item[0] ? String(item[1]) : 'none'
      })
    }
    return result
  }

  async getKey(id: string, key: string): Promise<KeyDetail> {
    const client = this.get(id)
    const type = await client.type(key)
    if (type === 'none') {
      return {
        exists: false,
        key,
        type,
        ttl: -2,
        encoding: null,
        size: 0,
        value: null,
        truncated: false
      }
    }

    const [ttl, encoding] = await Promise.all([
      client.ttl(key),
      client.object('ENCODING', key).catch(() => null)
    ])

    let value: unknown = null
    let size = 0
    let truncated = false

    switch (type) {
      case 'string': {
        value = await client.get(key)
        size = await client.strlen(key)
        break
      }
      case 'hash': {
        size = await client.hlen(key)
        const data = await client.hscan(key, '0', 'COUNT', PAGE_SIZE)
        const rows: HashRow[] = []
        const arr = data[1]
        for (let i = 0; i < arr.length; i += 2) {
          rows.push({ field: arr[i], value: arr[i + 1] })
        }
        value = rows
        truncated = size > rows.length
        break
      }
      case 'list': {
        size = await client.llen(key)
        const end = Math.min(PAGE_SIZE, size) - 1
        value = size === 0 ? [] : await client.lrange(key, 0, end)
        truncated = size > PAGE_SIZE
        break
      }
      case 'set': {
        size = await client.scard(key)
        const scanned = await client.sscan(key, '0', 'COUNT', PAGE_SIZE)
        value = scanned[1]
        truncated = size > scanned[1].length
        break
      }
      case 'zset': {
        size = await client.zcard(key)
        const end = Math.min(PAGE_SIZE, size) - 1
        const raw = size === 0 ? [] : await client.zrange(key, 0, end, 'WITHSCORES')
        value = toRowsFromWithScores(raw)
        truncated = size > PAGE_SIZE
        break
      }
      case 'stream': {
        size = await client.xlen(key)
        const entries = await client.xrange(key, '-', '+', 'COUNT', 100)
        const rows: StreamRow[] = entries.map(([entryId, fields]) => {
          const record: Record<string, string> = {}
          for (let i = 0; i < fields.length; i += 2) record[fields[i]] = fields[i + 1]
          return { id: entryId, fields: record }
        })
        value = rows
        truncated = size > rows.length
        break
      }
      default: {
        if (type.toLowerCase().includes('json')) {
          const json = await client.call('JSON.GET', key, '.')
          value = typeof json === 'string' ? json : JSON.stringify(json)
          size = String(value ?? '').length
        } else {
          value = `[暂不支持的类型: ${type}]`
        }
      }
    }

    return {
      exists: true,
      key,
      type,
      ttl,
      encoding: encoding ? String(encoding) : null,
      size,
      value,
      truncated
    }
  }

  async deleteKeys(id: string, keys: string[]): Promise<number> {
    if (!keys.length) return 0
    const client = this.get(id)
    let deleted = 0
    for (let i = 0; i < keys.length; i += 200) {
      const chunk = keys.slice(i, i + 200)
      deleted += await client.del(...chunk)
    }
    return deleted
  }

  async setString(id: string, key: string, value: string): Promise<void> {
    await this.get(id).set(key, value)
  }

  async expire(id: string, key: string, ttl: number): Promise<void> {
    const client = this.get(id)
    if (ttl < 0) {
      await client.persist(key)
      return
    }
    await client.expire(key, ttl)
  }

  async rename(id: string, key: string, nextKey: string): Promise<void> {
    await this.get(id).rename(key, nextKey)
  }
}

export const redisService = new RedisService()
