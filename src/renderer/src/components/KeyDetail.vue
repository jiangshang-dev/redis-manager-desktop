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
const saving = ref(false)
const jsonDraft = ref<unknown>(null)
const jsonTouch = ref(0)
const hashDraft = ref<Record<string, string>>({})
const listDraft = ref<Record<number, string>>({})
const setDraft = ref<Record<number, string>>({})
const zsetScoreDraft = ref<Record<number, number>>({})
const zsetMemberDraft = ref<Record<number, string>>({})

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

const canEditDocument = computed(() => {
  const type = String(detail.value?.type || '')
  return Boolean(detail.value?.exists) && !detail.value?.truncated && (type === 'string' || type.includes('json'))
})

const jsonDirty = computed(() => {
  jsonTouch.value
  if (!canEditDocument.value || !detail.value) return false
  if (detail.value.type === 'string' && !parsedJson.value.ok) return jsonDraft.value !== stringValue.value
  const baseline = parsedJson.value.ok ? parsedJson.value.value : jsonSource.value
  return JSON.stringify(jsonDraft.value) !== JSON.stringify(baseline)
})

watch(
  () => detail.value,
  (value) => {
    stringDraft.value = stringValue.value
    ttlDraft.value = value?.ttl ?? -1
    jsonDraft.value = cloneJson(jsonSource.value)
    jsonTouch.value = 0
    hashDraft.value = Object.fromEntries(hashRows.value.map((row) => [row.field, row.value]))
    listDraft.value = Object.fromEntries(listRows.value.map((row) => [row.index, row.value]))
    setDraft.value = Object.fromEntries(setRows.value.map((row) => [row.index, row.value]))
    zsetScoreDraft.value = Object.fromEntries(zsetRows.value.map((row, index) => [index, row.score]))
    zsetMemberDraft.value = Object.fromEntries(zsetRows.value.map((row, index) => [index, row.member]))
    if (parsedJson.value.ok) viewMode.value = 'json'
    else if (value && !['string', 'json'].includes(String(value.type)) && !String(value.type).includes('json')) {
      viewMode.value = 'table'
    } else viewMode.value = 'text'
  },
  { immediate: true }
)

function cloneJson(value: unknown): unknown {
  if (value === undefined) return null
  return JSON.parse(JSON.stringify(value)) as unknown
}

function onJsonUpdate(path: string[], value: unknown) {
  if (!path.length || jsonDraft.value === null || typeof jsonDraft.value !== 'object') {
    jsonDraft.value = value
    jsonTouch.value += 1
    return
  }
  let cursor: unknown = jsonDraft.value
  for (let index = 0; index < path.length - 1; index += 1) {
    if (cursor === null || typeof cursor !== 'object') return
    cursor = (cursor as Record<string, unknown>)[path[index]]
  }
  if (cursor === null || typeof cursor !== 'object') return
  const last = path[path.length - 1]
  if (Array.isArray(cursor)) cursor[Number(last)] = value
  else (cursor as Record<string, unknown>)[last] = value
  jsonTouch.value += 1
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function saveString() {
  saving.value = true
  try {
    await store.saveString(stringDraft.value)
    ElMessage.success('已保存')
  } catch (error) {
    ElMessage.error(errorText(error))
  } finally {
    saving.value = false
  }
}

async function saveDocument() {
  if (!detail.value) return
  saving.value = true
  try {
    const type = String(detail.value.type)
    if (type.includes('json')) {
      await store.saveJson(JSON.stringify(jsonDraft.value))
    } else if (detail.value.type === 'string' && !parsedJson.value.ok) {
      await store.saveString(String(jsonDraft.value ?? ''))
    } else {
      await store.saveString(JSON.stringify(jsonDraft.value))
    }
    ElMessage.success('已保存')
  } catch (error) {
    ElMessage.error(errorText(error))
  } finally {
    saving.value = false
  }
}

async function saveHash(row: HashRow) {
  const value = hashDraft.value[row.field]
  if (value === undefined || value === row.value) return
  saving.value = true
  try {
    await store.saveHashField(row.field, value)
    ElMessage.success('已保存')
  } catch (error) {
    ElMessage.error(errorText(error))
  } finally {
    saving.value = false
  }
}

async function saveList(index: number, original: string) {
  const value = listDraft.value[index]
  if (value === undefined || value === original) return
  saving.value = true
  try {
    await store.saveListItem(index, value)
    ElMessage.success('已保存')
  } catch (error) {
    ElMessage.error(errorText(error))
  } finally {
    saving.value = false
  }
}

async function saveSet(index: number, original: string) {
  const value = setDraft.value[index]
  if (value === undefined || value === original) return
  saving.value = true
  try {
    await store.saveSetMember(original, value)
    ElMessage.success('已保存')
  } catch (error) {
    ElMessage.error(errorText(error))
  } finally {
    saving.value = false
  }
}

async function saveZSet(index: number, row: ZSetRow) {
  const member = zsetMemberDraft.value[index]
  const score = Number(zsetScoreDraft.value[index])
  if (member === undefined || member === '' || Number.isNaN(score)) {
    ElMessage.warning('成员不能为空，分数需要是数字')
    return
  }
  if (member === row.member && score === row.score) return
  saving.value = true
  try {
    await store.saveZSetMember(member, score, row.member)
    ElMessage.success('已保存')
  } catch (error) {
    ElMessage.error(errorText(error))
  } finally {
    saving.value = false
  }
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

        <div v-if="viewMode === 'json'" class="json-panel">
          <div v-if="canEditDocument" class="toolbar json-edit-bar">
            <span class="brand-sub">点击值进行修改，Enter 确认，Esc 取消</span>
            <el-button type="primary" size="small" :disabled="!jsonDirty || saving" @click="saveDocument">
              保存修改
            </el-button>
          </div>
          <JsonViewer :data="jsonDraft" :editable="canEditDocument" @update="onJsonUpdate" />
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
                <div class="edit-row">
                  <el-input v-model="hashDraft[row.field]" type="textarea" :autosize="{ minRows: 1, maxRows: 6 }" />
                  <el-button
                    size="small"
                    type="primary"
                    :disabled="saving || hashDraft[row.field] === row.value"
                    @click="saveHash(row)"
                  >
                    保存
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <el-table v-else-if="detail.type === 'list'" :data="listRows" size="small" stripe>
            <el-table-column prop="index" label="#" width="70" />
            <el-table-column label="Value" min-width="280">
              <template #default="{ row }">
                <div class="edit-row">
                  <el-input v-model="listDraft[row.index]" type="textarea" :autosize="{ minRows: 1, maxRows: 6 }" />
                  <el-button
                    size="small"
                    type="primary"
                    :disabled="saving || listDraft[row.index] === row.value"
                    @click="saveList(row.index, row.value)"
                  >
                    保存
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <el-table v-else-if="detail.type === 'set'" :data="setRows" size="small" stripe>
            <el-table-column prop="index" label="#" width="70" />
            <el-table-column label="Member" min-width="280">
              <template #default="{ row }">
                <div class="edit-row">
                  <el-input v-model="setDraft[row.index]" type="textarea" :autosize="{ minRows: 1, maxRows: 6 }" />
                  <el-button
                    size="small"
                    type="primary"
                    :disabled="saving || setDraft[row.index] === row.value"
                    @click="saveSet(row.index, row.value)"
                  >
                    保存
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <el-table v-else-if="detail.type === 'zset'" :data="zsetRows" size="small" stripe>
            <el-table-column label="Score" width="160">
              <template #default="{ $index }">
                <el-input-number v-model="zsetScoreDraft[$index]" size="small" :controls="false" />
              </template>
            </el-table-column>
            <el-table-column label="Member" min-width="240">
              <template #default="{ row, $index }">
                <div class="edit-row">
                  <el-input v-model="zsetMemberDraft[$index]" />
                  <el-button
                    size="small"
                    type="primary"
                    :disabled="saving || (zsetMemberDraft[$index] === row.member && Number(zsetScoreDraft[$index]) === row.score)"
                    @click="saveZSet($index, row)"
                  >
                    保存
                  </el-button>
                </div>
              </template>
            </el-table-column>
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
