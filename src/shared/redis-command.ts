const MAX_COMMANDS = 100

function readEscape(input: string, index: number): { char: string; next: number } {
  const current = input[index]
  if (current === undefined) return { char: '\\', next: index }
  if (current === 'n') return { char: '\n', next: index + 1 }
  if (current === 'r') return { char: '\r', next: index + 1 }
  if (current === 't') return { char: '\t', next: index + 1 }
  if (current === 'b') return { char: '\b', next: index + 1 }
  if (current === 'a') return { char: '\u0007', next: index + 1 }
  if (current === 'x') {
    const hex = input.slice(index + 1, index + 3)
    if (/^[0-9a-fA-F]{2}$/.test(hex)) {
      return { char: String.fromCharCode(Number.parseInt(hex, 16)), next: index + 3 }
    }
  }
  return { char: current, next: index + 1 }
}

function readArgument(input: string, start: number): { arg: string; next: number } {
  let index = start
  let quote: '"' | "'" | null = null
  let arg = ''
  let started = false

  while (index < input.length) {
    const current = input[index]
    if (quote) {
      if (current === '\\') {
        const escaped = readEscape(input, index + 1)
        arg += escaped.char
        index = escaped.next
        continue
      }
      if (current === quote) {
        quote = null
        index += 1
        continue
      }
      arg += current
      index += 1
      continue
    }

    if (current === ' ' || current === '\t' || current === '\n' || current === '\f' || current === '\v') {
      break
    }
    if (current === '"' || current === "'") {
      quote = current
      started = true
      index += 1
      continue
    }
    started = true
    arg += current
    index += 1
  }

  if (quote) throw new Error('引号未闭合')
  if (!started) throw new Error('命令解析失败')
  return { arg, next: index }
}

export function parseCommandScript(raw: string): string[][] {
  const input = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const commands: string[][] = []
  let current: string[] = []
  let index = 0

  const flush = (): void => {
    if (current.length) commands.push(current)
    current = []
  }

  while (index < input.length) {
    while (input[index] === ' ' || input[index] === '\t' || input[index] === '\f' || input[index] === '\v') {
      index += 1
    }
    if (index >= input.length) break
    if (input[index] === '\n') {
      flush()
      index += 1
      continue
    }
    const argument = readArgument(input, index)
    current.push(argument.arg)
    index = argument.next
  }
  flush()

  if (commands.length > MAX_COMMANDS) {
    throw new Error(`一次最多执行 ${MAX_COMMANDS} 条命令`)
  }
  return commands
}

export function formatCommand(args: string[]): string {
  return args.map(quoteArg).join(' ')
}

function quoteArg(arg: string): string {
  if (arg === '' || /[\s"\\]/.test(arg)) {
    return `"${arg
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')}"`
  }
  return arg
}

export function commandTouchesKey(script: string, key: string): boolean {
  if (!key) return false
  return parseCommandScript(script).some((args) => args.slice(1).includes(key))
}

const CLUSTER_WRITES = new Set([
  'failover',
  'reset',
  'forget',
  'replicate',
  'meet',
  'setslot',
  'bumpepoch',
  'flushslots',
  'delslots',
  'addslots',
  'set-config-epoch'
])

export function dangerReason(commands: string[][]): string | null {
  for (const args of commands) {
    const name = args[0]?.toLowerCase() ?? ''
    const sub = args[1]?.toLowerCase() ?? ''
    const shown = formatCommand(args)
    if (name === 'flushall' || name === 'flushdb') {
      return `「${shown}」会删除数据，且无法恢复。`
    }
    if (name === 'shutdown' || name === 'debug') {
      return `「${shown}」可能让 Redis 进程停止或阻塞。`
    }
    if (name === 'swapdb' || name === 'replicaof' || name === 'slaveof' || name === 'failover') {
      return `「${shown}」会改变库或实例角色。`
    }
    if (name === 'config' && sub && sub !== 'get' && sub !== 'help') {
      return `「${shown}」会修改服务器配置。`
    }
    if (name === 'script' && (sub === 'flush' || sub === 'kill')) {
      return `「${shown}」会影响正在运行的脚本。`
    }
    if ((name === 'client' && sub === 'kill') || (name === 'memory' && sub === 'purge')) {
      return `「${shown}」会影响其他客户端或进程内存。`
    }
    if (name === 'migrate' || name === 'restore') {
      return `「${shown}」会写入或覆盖数据。`
    }
    if (name === 'module' && (sub === 'load' || sub === 'unload')) {
      return `「${shown}」会加载或卸载服务器模块。`
    }
    if (name === 'acl' && (sub === 'setuser' || sub === 'deluser' || sub === 'save')) {
      return `「${shown}」会修改访问控制规则。`
    }
    if (name === 'cluster' && CLUSTER_WRITES.has(sub)) {
      return `「${shown}」会改变集群状态。`
    }
  }
  return null
}
