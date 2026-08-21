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

export type KeyTreeNode = {
  id: string
  name: string
  path: string
  isLeaf: boolean
  redisKey?: string
  children: KeyTreeNode[]
  descendantKeys: string[]
  leafCount: number
}

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function buildKeyTree(keys: string[], delimiter = ':'): KeyTreeNode[] {
  type Mutable = {
    name: string
    path: string
    redisKey?: string
    children: Map<string, Mutable>
  }

  const root = new Map<string, Mutable>()

  const ensure = (map: Map<string, Mutable>, name: string, path: string): Mutable => {
    let node = map.get(name)
    if (!node) {
      node = { name, path, children: new Map() }
      map.set(name, node)
    }
    return node
  }

  for (const key of keys) {
    const parts = key.split(delimiter).filter((part) => part.length > 0)
    if (!parts.length) continue
    let map = root
    let path = ''
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      path = path ? `${path}${delimiter}${name}` : name
      const node = ensure(map, name, path)
      if (i === parts.length - 1) node.redisKey = key
      map = node.children
    }
  }

  const convert = (map: Map<string, Mutable>): KeyTreeNode[] => {
    const nodes: KeyTreeNode[] = []
    for (const item of map.values()) {
      const children = convert(item.children)
      const descendantKeys = [
        ...(item.redisKey ? [item.redisKey] : []),
        ...children.flatMap((child) => child.descendantKeys)
      ]
      const uniqueKeys = [...new Set(descendantKeys)]
      nodes.push({
        id: item.redisKey && children.length === 0 ? `key:${item.redisKey}` : `folder:${item.path}`,
        name: item.name,
        path: item.path,
        isLeaf: children.length === 0 && Boolean(item.redisKey),
        redisKey: item.redisKey,
        children,
        descendantKeys: uniqueKeys,
        leafCount: uniqueKeys.length
      })
    }
    return nodes.sort((a, b) => {
      if (a.isLeaf !== b.isLeaf) return a.isLeaf ? 1 : -1
      return a.name.localeCompare(b.name)
    })
  }

  return convert(root)
}

export function filterTree(nodes: KeyTreeNode[], keyword: string): KeyTreeNode[] {
  const query = keyword.trim().toLowerCase()
  if (!query) return nodes

  const walk = (list: KeyTreeNode[]): KeyTreeNode[] => {
    const result: KeyTreeNode[] = []
    for (const node of list) {
      const selfMatch =
        node.name.toLowerCase().includes(query) ||
        Boolean(node.redisKey?.toLowerCase().includes(query))
      const children = walk(node.children)
      if (selfMatch || children.length) {
        result.push({
          ...node,
          children: selfMatch ? node.children : children
        })
      }
    }
    return result
  }

  return walk(nodes)
}

export function findNode(nodes: KeyTreeNode[], id: string): KeyTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

export function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false }
  if (!(trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"'))) {
    return { ok: false }
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch {
    return { ok: false }
  }
}

export function formatTtl(ttl: number): string {
  if (ttl === -1) return '永久'
  if (ttl < 0) return '不存在'
  if (ttl < 60) return `${ttl}s`
  if (ttl < 3600) return `${Math.floor(ttl / 60)}m ${ttl % 60}s`
  if (ttl < 86400) {
    const h = Math.floor(ttl / 3600)
    const m = Math.floor((ttl % 3600) / 60)
    return `${h}h ${m}m`
  }
  const d = Math.floor(ttl / 86400)
  const h = Math.floor((ttl % 86400) / 3600)
  return `${d}d ${h}h`
}

export function typeClass(type?: string): string {
  const name = (type || 'none').toLowerCase()
  if (name.includes('json')) return 'type-json'
  if (['string', 'hash', 'list', 'set', 'zset', 'stream', 'none'].includes(name)) {
    return `type-${name}`
  }
  return 'type-none'
}
