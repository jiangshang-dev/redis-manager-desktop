<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRedisStore } from '../stores/redis'
import { commandTouchesKey, dangerReason, parseCommandScript } from '../../../shared/redis-command'

type LogEntry = {
  id: number
  prompt: string
  command: string
  output: string
  ok: boolean
}

const HISTORY_KEY = 'redis-manager.command-history'
const REFRESH_KEY = 'redis-manager.command-refresh'

const store = useRedisStore()
const input = ref('')
const running = ref(false)
const entries = ref<LogEntry[]>([])
const history = ref<string[]>(loadHistory())
const historyIndex = ref(-1)
const draft = ref('')
const refreshAfter = ref(loadRefresh())
const inputRef = ref<HTMLTextAreaElement | null>(null)
const screenRef = ref<HTMLElement | null>(null)
let entryId = 0

const prompt = computed(() => {
  const conn = store.activeConnection
  if (!conn || !store.isConnected) return '未连接>'
  return `${conn.host}:${conn.port}[${store.activeDb}]>`
})

const screenTitle = computed(() => {
  const conn = store.activeConnection
  if (!conn || !store.isConnected) return 'redis — 未连接'
  return `redis — ${conn.name} ${conn.host}:${conn.port} db${store.activeDb}`
})

onMounted(() => {
  inputRef.value?.focus()
})

watch(refreshAfter, (value) => {
  sessionStorage.setItem(REFRESH_KEY, value ? '1' : '0')
})

function loadHistory(): string[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string').slice(-100)
  } catch {
    return []
  }
}

function loadRefresh(): boolean {
  return sessionStorage.getItem(REFRESH_KEY) === '1'
}

function pushHistory(text: string) {
  if (history.value[history.value.length - 1] === text) return
  history.value = [...history.value, text].slice(-100)
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.value))
}

function append(entry: Omit<LogEntry, 'id'>) {
  entries.value.push({ ...entry, id: ++entryId })
  void scrollScreen()
}

async function scrollScreen() {
  await nextTick()
  const el = screenRef.value
  if (el) el.scrollTop = el.scrollHeight
}

function autosize() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}

function focus() {
  inputRef.value?.focus()
}

defineExpose({ focus })

async function recall(direction: -1 | 1) {
  if (!history.value.length) return
  if (direction < 0) {
    if (historyIndex.value === -1) {
      draft.value = input.value
      historyIndex.value = history.value.length - 1
    } else if (historyIndex.value > 0) {
      historyIndex.value -= 1
    }
    input.value = history.value[historyIndex.value] ?? ''
  } else if (historyIndex.value !== -1) {
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value += 1
      input.value = history.value[historyIndex.value] ?? ''
    } else {
      historyIndex.value = -1
      input.value = draft.value
    }
  }
  await nextTick()
  const el = inputRef.value
  if (!el) return
  const pos = el.value.length
  el.setSelectionRange(pos, pos)
  autosize()
}

function onFirstLine(el: HTMLTextAreaElement): boolean {
  return !el.value.slice(0, el.selectionStart).includes('\n')
}

function onLastLine(el: HTMLTextAreaElement): boolean {
  return !el.value.slice(el.selectionEnd).includes('\n')
}

function cancelLine() {
  if (!input.value) return
  append({ prompt: prompt.value, command: `${input.value}^C`, output: '', ok: true })
  input.value = ''
  historyIndex.value = -1
  draft.value = ''
  void nextTick(autosize)
}

function clearScreen() {
  entries.value = []
  void scrollScreen()
}

function onInputKeydown(event: KeyboardEvent) {
  const el = event.target
  if (!(el instanceof HTMLTextAreaElement)) return
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault()
    void run()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
    event.preventDefault()
    clearScreen()
    return
  }
  if (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'c') {
    if (el.selectionStart === el.selectionEnd && input.value) {
      event.preventDefault()
      cancelLine()
    }
    return
  }
  if (event.key === 'ArrowUp' && onFirstLine(el)) {
    event.preventDefault()
    void recall(-1)
  }
  if (event.key === 'ArrowDown' && onLastLine(el)) {
    event.preventDefault()
    void recall(1)
  }
}

function onScreenClick() {
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed) return
  focus()
}

async function run() {
  const raw = input.value.replace(/\s+$/g, '')
  if (!raw.trim() || running.value) return

  const linePrompt = prompt.value
  if (raw.trim().toLowerCase() === 'clear' || raw.trim().toLowerCase() === 'cls') {
    input.value = ''
    historyIndex.value = -1
    draft.value = ''
    await nextTick()
    autosize()
    clearScreen()
    return
  }

  if (!store.isConnected) {
    append({ prompt: linePrompt, command: raw, output: '请先连接 Redis', ok: false })
    input.value = ''
    await nextTick()
    autosize()
    return
  }

  let commands: string[][]
  try {
    commands = parseCommandScript(raw)
  } catch (error) {
    append({
      prompt: linePrompt,
      command: raw,
      ok: false,
      output: error instanceof Error ? error.message : String(error)
    })
    return
  }
  if (!commands.length) return

  const reason = dangerReason(commands)
  if (reason) {
    try {
      await ElMessageBox.confirm(`${reason}确认执行？`, '高风险命令', {
        type: 'warning',
        confirmButtonText: '仍然执行',
        cancelButtonText: '取消'
      })
    } catch {
      focus()
      return
    }
  }

  pushHistory(raw.trim())
  input.value = ''
  historyIndex.value = -1
  draft.value = ''
  await nextTick()
  autosize()

  running.value = true
  const pendingId = ++entryId
  entries.value.push({ id: pendingId, prompt: linePrompt, command: raw, output: '', ok: true })
  await scrollScreen()
  try {
    const results = await store.executeCommand(raw)
    const output = results
      .map((item, index) => {
        const head = results.length > 1 ? `${item.command}\n` : ''
        return `${index > 0 ? '\n' : ''}${head}${item.output}`
      })
      .join('\n')
    const pending = entries.value.find((item) => item.id === pendingId)
    if (pending) {
      pending.output = output
      pending.ok = results.every((item) => item.ok)
    }
    await scrollScreen()
    const switched = results.some((item) => item.ok && typeof item.selectedDb === 'number')
    const succeeded = results.some((item) => item.ok)
    try {
      if (switched || (succeeded && refreshAfter.value)) {
        await store.refreshInfo()
        await store.refreshKeys()
      }
      if (!switched && succeeded && store.selectedKey && commandTouchesKey(raw, store.selectedKey)) {
        const opened = store.tabs.some((tab) => tab.kind === 'key' && tab.key === store.selectedKey)
        if (opened) await store.loadKey(store.selectedKey)
      }
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : String(error))
    }
  } catch (error) {
    const pending = entries.value.find((item) => item.id === pendingId)
    if (pending) {
      pending.ok = false
      pending.output = error instanceof Error ? error.message : String(error)
    }
    await scrollScreen()
  } finally {
    running.value = false
    await nextTick()
    focus()
  }
}

async function copyLog() {
  if (!entries.value.length) return
  const text = entries.value
    .map((entry) => `${entry.prompt} ${entry.command}${entry.output ? `\n${entry.output}` : ''}`)
    .join('\n')
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制终端内容')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '复制失败')
  }
}
</script>

<template>
  <section class="term" @click="onScreenClick">
    <div class="term-bar">
      <div class="term-dots" aria-hidden="true">
        <span /><span /><span />
      </div>
      <div class="term-title">{{ screenTitle }}</div>
      <div class="term-tools" @click.stop>
        <el-checkbox v-model="refreshAfter" size="small">执行后刷新 Key</el-checkbox>
        <button type="button" class="term-tool" :disabled="!entries.length" @click="copyLog">复制</button>
        <button type="button" class="term-tool" :disabled="!entries.length" @click="clearScreen">清屏</button>
      </div>
    </div>

    <div ref="screenRef" class="term-screen">
      <div v-if="!entries.length" class="term-hint"># Enter 执行，Shift+Enter 换行，↑↓ 历史，clear / Ctrl+L 清屏</div>
      <div v-for="entry in entries" :key="entry.id" class="term-block">
        <div class="term-cmd">
          <span class="term-prompt">{{ entry.prompt }}</span>
          <span class="term-typed">{{ entry.command }}</span>
        </div>
        <div
          v-if="entry.output"
          class="term-out"
          :class="{ err: !entry.ok, nil: entry.ok && entry.output === '(nil)' }"
        >{{ entry.output }}</div>
      </div>
      <div class="term-cmd term-live">
        <span class="term-prompt">{{ prompt }}</span>
        <textarea
          ref="inputRef"
          v-model="input"
          class="term-input"
          rows="1"
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
          :disabled="running"
          @keydown="onInputKeydown"
          @input="autosize"
          @click.stop
        />
      </div>
    </div>
  </section>
</template>
