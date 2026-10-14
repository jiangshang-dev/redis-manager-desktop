<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { HashRow, StreamRow, ZSetRow } from '../../../shared/types'
import { formatTtl, tryParseJson, typeClass } from '../utils/tree'
import { useRedisStore } from '../stores/redis'
import JsonViewer from './JsonViewer.vue'

const store = useRedisStore()
const viewMode = ref<'json' | 'text' | 'table'>('json')
const stringDraft = ref('')
const ttlDraft = ref(-1)

const detail = computed(() => store.detail)
const stringValue = computed(() => {
  if (
    !detail.value ||
    (detail.value.type !== 'string' && !String(detail.value.type).includes('json'))
  ) {
    return ''
  }
  return String(detail.value.value ?? '')
})
const parsedJson = computed(() => tryParseJson(stringValue.value))
const hashRows = computed(() => (Array.isArray(detail.value?.value) ? (detail.value?.value as HashRow[]) : []))
const listRows = computed(() =>
  Array.isArray(detail.value?.value) && detail.value?.type === 'list'
    ? (detail.value.value as string[]).map((value, index) => ({ index, value }))
    : []
)
const setRows = computed(() =>
  Array.isArray(detail.value?.value) && detail.value?.type === 'set'
    ? (detail.value.value as string[]).map((value, index) => ({ index, value }))
    : []
)
const zsetRows = computed(() => (detail.value?.type === 'zset' ? (detail.value.value as ZSetRow[]) : []))
const streamRows = computed(() => (detail.value?.type === 'stream' ? (detail.value.value as StreamRow[]) : []))

watch(
  () => detail.value,
  (value) => {
    stringDraft.value = stringValue.value
    ttlDraft.value = value?.ttl ?? -1
    if (parsedJson.value.ok) viewMode.value = 'json'
    else if (value && !['string', 'json'].includes(String(value.type))) viewMode.value = 'table'
    else viewMode.value = 'text'
  },
  { immediate: true }
)

async function saveString() {
  await store.saveString(stringDraft.value)
  ElMessage.success('已保存')
}

async function saveTtl() {
  await store.saveTtl(Number(ttlDraft.value))
  ElMessage.success('TTL 已更新')
}

function prettyJson() {
  const parsed = tryParseJson(stringDraft.value)
  if (!parsed.ok) {
    ElMessage.warning('当前内容不是合法 JSON')
    return
  }
  stringDraft.value = JSON.stringify(parsed.value, null, 2)
}

const jsonSource = computed(() => {
  if (parsedJson.value.ok) return parsedJson.value.value
  if (detail.value?.type === 'hash') {
    return Object.fromEntries(hashRows.value.map((row) => [row.field, tryParseMaybe(row.value)]))
  }
  if (detail.value?.type === 'list') return listRows.value.map((row) => tryParseMaybe(row.value))
  if (detail.value?.type === 'set') return setRows.value.map((row) => tryParseMaybe(row.value))
  if (detail.value?.type === 'zset') return zsetRows.value
  if (detail.value?.type === 'stream') return streamRows.value
  return detail.value?.value ?? null
})

function tryParseMaybe(text: string) {
  const parsed = tryParseJson(text)
  return parsed.ok ? parsed.value : text
}

function parsedCell(text: string): unknown | null {
  const parsed = tryParseJson(text)
  return parsed.ok ? parsed.value : null
}
</script>

<template>
  <section class="key-detail">
    <div class="panel-head">
      <div>
        <div class="panel-title">值查看器</div>
        <div class="brand-sub">{{ detail?.key || store.selectedKey || '选择一个 Key 查看内容' }}</div>
      </div>
      <div class="toolbar" v-if="detail?.exists">
        <el-button size="small" @click="store.refreshKey()">刷新当前值</el-button>
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="json">JSON 结构</el-radio-button>
          <el-radio-button value="table">表格</el-radio-button>
          <el-radio-button value="text">原始文本</el-radio-button>
        </el-radio-group>
      </div>
    </div>
    <div class="panel-body" style="padding: 12px" v-loading="store.loadingDetail">
      <div v-if="!detail" class="empty-wrap">
        {{ store.loadingDetail ? '正在读取…' : '该 Key 尚未加载。' }}
      </div>
      <div v-else-if="!detail.exists" class="empty-wrap">该 Key 不存在，可能已被删除。</div>
      <template v-else>
        <div class="detail-grid">
          <div class="detail-card">
            <div class="label">类型</div>
            <div class="value">
              <span class="type-badge" :class="typeClass(detail.type)">{{ detail.type }}</span>
            </div>
          </div>
          <div class="detail-card">
            <div class="label">TTL</div>
            <div class="value">{{ formatTtl(detail.ttl) }}</div>
          </div>
          <div class="detail-card">
            <div class="label">长度 / 元素数</div>
            <div class="value">{{ detail.size }}{{ detail.truncated ? ' (已截断前 200 条)' : '' }}</div>
          </div>
          <div class="detail-card">
            <div class="label">Encoding</div>
            <div class="value">{{ detail.encoding || '-' }}</div>
          </div>
        </div>

        <div class="toolbar" style="margin-bottom: 12px">
          <el-input-number v-model="ttlDraft" size="small" :min="-1" />
          <el-button size="small" @click="saveTtl">设置 TTL（-1 永久）</el-button>
        </div>

        <div v-if="viewMode === 'json'" style="background: #0d131a; border: 1px solid var(--line); border-radius: 8px; padding: 12px">
          <JsonViewer :data="jsonSource" />
        </div>

        <template v-else-if="viewMode === 'table'">
          <el-table
            v-if="detail.type === 'hash'"
            :data="hashRows"
            size="small"
            height="100%"
            stripe
          >
            <el-table-column prop="field" label="Field" min-width="160" />
            <el-table-column label="Value" min-width="280">
              <template #default="{ row }">
                <JsonViewer v-if="parsedCell(row.value) !== null" :data="parsedCell(row.value)" />
                <span v-else class="tree-name">{{ row.value }}</span>
              </template>
            </el-table-column>
          </el-table>
          <el-table v-else-if="detail.type === 'list'" :data="listRows" size="small" stripe>
            <el-table-column prop="index" label="#" width="70" />
            <el-table-column prop="value" label="Value" />
          </el-table>
          <el-table v-else-if="detail.type === 'set'" :data="setRows" size="small" stripe>
            <el-table-column prop="index" label="#" width="70" />
            <el-table-column prop="value" label="Member" />
          </el-table>
          <el-table v-else-if="detail.type === 'zset'" :data="zsetRows" size="small" stripe>
            <el-table-column prop="score" label="Score" width="140" />
            <el-table-column prop="member" label="Member" />
          </el-table>
          <el-table v-else-if="detail.type === 'stream'" :data="streamRows" size="small" stripe>
            <el-table-column prop="id" label="ID" width="180" />
            <el-table-column label="Fields">
              <template #default="{ row }">
                <JsonViewer :data="row.fields" />
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="empty-wrap">该类型更适合用 JSON 或原始文本查看</div>
        </template>

        <template v-else>
          <textarea v-model="stringDraft" class="editor" />
          <div class="toolbar" style="margin-top: 8px">
            <el-button size="small" @click="prettyJson">格式化为 JSON</el-button>
            <el-button
              size="small"
              type="primary"
              :disabled="detail.type !== 'string'"
              @click="saveString"
            >
              保存字符串
            </el-button>
          </div>
        </template>
      </template>
    </div>
  </section>
</template>
