<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { RedisConnectionConfig } from '../../shared/types'
import { useRedisStore } from './stores/redis'
import ConnectionPanel from './components/ConnectionPanel.vue'
import ConnectionDialog from './components/ConnectionDialog.vue'
import KeyExplorer from './components/KeyExplorer.vue'
import KeyDetail from './components/KeyDetail.vue'

const store = useRedisStore()
const dialogVisible = ref(false)
const editing = ref<RedisConnectionConfig | null>(null)
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
  if (store.selectedKey) void store.openKey(store.selectedKey)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'F5') {
    event.preventDefault()
    void store.refresh('keys')
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {
    event.preventDefault()
    void store.refreshKey()
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
        <svg class="brand-mark" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#DC382C" />
          <path d="M8 12h16v2.2H8V12Zm0 4.9h16V19H8v-2.1Zm0 4.9h10V24H8v-2.2Z" fill="white" />
        </svg>
        <div>
          <div class="brand-title">Redis <span>Manager</span></div>
          <div class="brand-sub">多连接 · 树形 Key · 批量删除 · JSON 查看</div>
        </div>
      </div>
      <div class="toolbar">
        <span class="kv-chip">
          <span class="status-dot" :class="store.isConnected ? 'on' : 'off'" />
          {{ store.activeConnection ? `${store.activeConnection.name} / db${store.activeDb}` : '未选择服务' }}
        </span>
        <span class="kv-chip">Redis {{ store.info?.version || '-' }}</span>
        <span class="kv-chip">内存 {{ store.info?.usedMemory || '-' }}</span>
        <el-button size="small" @click="store.refresh('connections')">刷新连接</el-button>
        <el-button type="primary" size="small" @click="openCreate">新建连接</el-button>
      </div>
    </header>

    <main class="workspace">
      <ConnectionPanel @create="openCreate" @edit="openEdit" />
      <KeyExplorer />
      <KeyDetail />
    </main>

    <footer class="footer">
      <span>{{ store.statusText }}</span>
      <span>
        SCAN {{ store.lastScanMs }}ms · 分隔符 「{{ store.delimiter }}」 · F5 刷新 Keys · ⌘/Ctrl+R 刷新当前值
      </span>
    </footer>

    <ConnectionDialog v-model:visible="dialogVisible" :editing="editing" @saved="onSaved" />
  </div>
</template>
