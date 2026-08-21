<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { RedisConnectionConfig } from '../../../shared/types'
import { useRedisStore } from '../stores/redis'

const emit = defineEmits<{
  create: []
  edit: [conn: RedisConnectionConfig]
}>()

const store = useRedisStore()

async function useConnection(conn: RedisConnectionConfig) {
  try {
    await store.switchConnection(conn)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

async function toggleConnect(conn: RedisConnectionConfig, event: MouseEvent) {
  event.stopPropagation()
  try {
    if (store.connectedIds.includes(conn.id)) {
      await store.disconnect(conn.id)
      ElMessage.success(`已断开 ${conn.name}`)
    } else {
      await store.connect(conn)
      ElMessage.success(`已连接 ${conn.name}`)
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

function editConn(conn: RedisConnectionConfig, event: MouseEvent) {
  event.stopPropagation()
  emit('edit', conn)
}

async function remove(conn: RedisConnectionConfig, event: MouseEvent) {
  event.stopPropagation()
  await ElMessageBox.confirm(`确定删除连接「${conn.name}」吗？`, '删除连接', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  await store.removeConnection(conn.id)
}

function dbList() {
  const known = new Set((store.info?.dbs || []).map((item) => item.db))
  known.add(store.activeDb)
  for (let i = 0; i < 16; i++) known.add(i)
  return [...known].sort((a, b) => a - b)
}

function dbCount(db: number) {
  return store.info?.dbs.find((item) => item.db === db)?.keys ?? 0
}
</script>

<template>
  <aside class="panel">
    <div class="panel-head">
      <div class="panel-title">Redis 服务</div>
      <el-button type="primary" size="small" @click="emit('create')">新建连接</el-button>
    </div>
    <div class="panel-body">
      <div v-if="!store.connections.length" class="empty-wrap">
        <div>还没有 Redis 连接</div>
        <el-button type="primary" link @click="emit('create')">添加第一个服务</el-button>
      </div>
      <div
        v-for="conn in store.connections"
        :key="conn.id"
        class="conn-item"
        :class="{ active: store.activeId === conn.id }"
        @click="useConnection(conn)"
      >
        <div class="conn-name">
          <span
            class="status-dot"
            :class="store.connectedIds.includes(conn.id) ? 'on' : 'off'"
          />
          {{ conn.name }}
        </div>
        <div class="conn-meta">
          <span>{{ conn.host }}:{{ conn.port }}</span>
          <span>
            <el-button size="small" link @click="toggleConnect(conn, $event)">
              {{ store.connectedIds.includes(conn.id) ? '断开' : '连接' }}
            </el-button>
            <el-button size="small" link @click="editConn(conn, $event)">编辑</el-button>
            <el-button size="small" link type="danger" @click="remove(conn, $event)">删除</el-button>
          </span>
        </div>
        <div v-if="store.activeId === conn.id && store.isConnected" class="db-list">
          <button
            v-for="db in dbList()"
            :key="db"
            class="db-pill"
            :class="{ active: store.activeDb === db }"
            @click.stop="store.switchDb(db)"
          >
            db{{ db }} · {{ dbCount(db) }}
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
