<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { RedisConnectionConfig } from '../../shared/types'
import { useRedisStore } from './stores/redis'
import ConnectionPanel from './components/ConnectionPanel.vue'
import ConnectionDialog from './components/ConnectionDialog.vue'
import KeyExplorer from './components/KeyExplorer.vue'
import WorkspaceTabs from './components/WorkspaceTabs.vue'
import logoUrl from './assets/logo.png'

const store = useRedisStore()
const dialogVisible = ref(false)
const editing = ref<RedisConnectionConfig | null>(null)
const tabsRef = ref<{ focusTerminal: () => void } | null>(null)
let timer = 0
let lastAuto = 0

onMounted(async () => {
  await store.bootstrap()
  window.addEventListener('keydown', onKeydown)
  timer = window.setInterval(onAutoTick, 1000)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.clearInterval(timer)
})

function onAutoTick() {
  if (!store.autoRefresh || !store.isConnected) return
  const now = Date.now()
  if (now - lastAuto < store.autoRefreshMs) return
  lastAuto = now
  void store.refreshKeys()
  const tab = store.tabs.find((item) => item.id === store.activeTabId)
  if (tab?.kind === 'key') void store.loadKey(tab.key)
}

async function openTerminal() {
  store.openTerminal()
  await nextTick()
  tabsRef.value?.focusTerminal()
}

function isTypingTarget(event: KeyboardEvent): boolean {
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.code === 'Backquote') {
    event.preventDefault()
    void openTerminal()
    return
  }
  if (event.key === 'F5') {
    event.preventDefault()
    if (!isTypingTarget(event)) void store.refresh('keys')
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {
    event.preventDefault()
    if (!isTypingTarget(event)) void store.refreshKey()
  }
}

function openCreate() {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(conn: RedisConnectionConfig) {
  editing.value = conn
  dialogVisible.value = true
}

async function onSaved(config: RedisConnectionConfig) {
  await store.saveConnection(config)
  ElMessage.success('连接已保存')
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <img class="brand-mark" :src="logoUrl" alt="Redis Manager" />
        <div>
          <div class="brand-title">Redis <span>Manager</span></div>
          <div class="brand-sub">多连接 · 树形 Key · 批量删除 · 命令行</div>
        </div>
      </div>
      <div class="toolbar">
        <span class="kv-chip">
          <span class="status-dot" :class="store.isConnected ? 'on' : 'off'" />
          {{ store.activeConnection ? `${store.activeConnection.name} / db${store.activeDb}` : '未选择服务' }}
        </span>
        <span class="kv-chip">Redis {{ store.info?.version || '-' }}</span>
        <span class="kv-chip">内存 {{ store.info?.usedMemory || '-' }}</span>
        <el-button size="small" @click="openTerminal">命令行</el-button>
        <el-button size="small" @click="store.refresh('connections')">刷新连接</el-button>
        <el-button type="primary" size="small" @click="openCreate">新建连接</el-button>
      </div>
    </header>

    <main class="workspace">
      <ConnectionPanel @create="openCreate" @edit="openEdit" />
      <KeyExplorer />
      <section class="panel right-stack">
        <WorkspaceTabs ref="tabsRef" />
      </section>
    </main>

    <footer class="footer">
      <span>{{ store.statusText }}</span>
      <span>
        SCAN {{ store.lastScanMs }}ms · 分隔符 「{{ store.delimiter }}」 · F5 刷新 Keys · ⌘/Ctrl+R 刷新当前值 · ⌘/Ctrl+` 聚焦命令行
      </span>
    </footer>

    <ConnectionDialog v-model:visible="dialogVisible" :editing="editing" @saved="onSaved" />
  </div>
</template>
