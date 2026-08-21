<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Search, Delete } from '@element-plus/icons-vue'
import { useRedisStore } from '../stores/redis'
import KeyTree from './KeyTree.vue'

const store = useRedisStore()

const refreshOptions = [
  { label: '刷新连接状态', value: 'connections' },
  { label: '刷新数据库信息', value: 'db' },
  { label: '刷新全部 Key', value: 'keys' },
  { label: '刷新当前文件夹', value: 'folder' },
  { label: '刷新当前 Key', value: 'key' }
]

const autoOptions = [
  { label: '关闭自动刷新', value: 0 },
  { label: '每 5 秒', value: 5000 },
  { label: '每 10 秒', value: 10000 },
  { label: '每 30 秒', value: 30000 }
]

const allChecked = computed(
  () => store.keys.length > 0 && store.checkedKeys.length === store.keys.length
)
const someChecked = computed(
  () => store.checkedKeys.length > 0 && store.checkedKeys.length < store.keys.length
)

function toggleAll(checked: boolean) {
  store.toggleChecked(store.keys, checked)
}

async function onRefresh(command: string) {
  try {
    await store.refresh(command as 'connections' | 'db' | 'keys' | 'folder' | 'key')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

async function scanNow() {
  try {
    await store.refreshKeys(store.scanPattern)
    ElMessage.success(`SCAN 完成，共 ${store.keys.length} 个 Key`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

function onAuto(ms: number) {
  store.autoRefresh = ms > 0
  store.autoRefreshMs = ms || 10000
}

async function batchDelete() {
  if (!store.checkedKeys.length) {
    ElMessage.warning('请先勾选要删除的 Key')
    return
  }
  await ElMessageBox.confirm(
    `即将删除 ${store.checkedKeys.length} 个 Key，此操作不可恢复。`,
    '批量删除',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  )
  const count = await store.deleteChecked()
  ElMessage.success(`已删除 ${count} 个 Key`)
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <div class="panel-title">Keys</div>
        <div class="brand-sub">
          {{ store.keys.length }} 个 · {{ store.checkedKeys.length }} 已选
        </div>
      </div>
      <div class="toolbar">
        <el-dropdown trigger="click" @command="onRefresh">
          <el-button size="small" :icon="Refresh" :loading="store.loadingKeys">刷新</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="item in refreshOptions" :key="item.value" :command="item.value">
                {{ item.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown trigger="click" @command="onAuto">
          <el-button size="small">
            {{ store.autoRefresh ? `自动 ${store.autoRefreshMs / 1000}s` : '自动刷新' }}
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="item in autoOptions" :key="item.value" :command="item.value">
                {{ item.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
    <div style="padding: 8px 12px; display: grid; gap: 8px; border-bottom: 1px solid var(--line)">
      <el-input
        v-model="store.filterText"
        size="small"
        clearable
        placeholder="过滤树节点，如 demo2"
        :prefix-icon="Search"
      />
      <div style="display: flex; gap: 6px">
        <el-input
          v-model="store.scanPattern"
          size="small"
          placeholder="SCAN 匹配，如 demo1:*"
          @keyup.enter="scanNow"
        />
        <el-button size="small" @click="scanNow">SCAN</el-button>
      </div>
      <div class="toolbar">
        <el-checkbox :model-value="allChecked" :indeterminate="someChecked" @change="toggleAll">
          全选
        </el-checkbox>
        <el-button
          size="small"
          type="danger"
          :icon="Delete"
          :disabled="!store.checkedKeys.length"
          @click="batchDelete"
        >
          批量删除
        </el-button>
      </div>
    </div>
    <div class="panel-body" v-loading="store.loadingKeys">
      <div v-if="!store.isConnected" class="empty-wrap">请先连接一个 Redis 服务</div>
      <div v-else-if="!store.visibleTree.length" class="empty-wrap">当前库没有匹配的 Key</div>
      <KeyTree v-else :nodes="store.visibleTree" />
    </div>
  </section>
</template>
