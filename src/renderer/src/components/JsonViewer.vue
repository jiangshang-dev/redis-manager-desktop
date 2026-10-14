<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

defineOptions({ name: 'JsonViewer' })

const props = withDefaults(
  defineProps<{
    data: unknown
    name?: string
    depth?: number
    path?: string[]
    editable?: boolean
  }>(),
  {
    depth: 0,
    path: () => [],
    editable: false
  }
)

const emit = defineEmits<{
  update: [path: string[], value: unknown]
}>()

const collapsed = ref(false)
const editing = ref(false)
const editText = ref('')
const editError = ref('')
const inputRef = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

const isObject = computed(() => props.data !== null && typeof props.data === 'object')
const entries = computed(() => {
  if (!isObject.value) return []
  if (Array.isArray(props.data)) {
    return (props.data as unknown[]).map((value, index) => [String(index), value] as const)
  }
  return Object.entries(props.data as Record<string, unknown>)
})
const multiline = computed(() => editText.value.includes('\n') || editText.value.length > 80)

function valueClass(value: unknown): string {
  if (value === null) return 'json-null'
  const type = typeof value
  if (type === 'string') return 'json-string'
  if (type === 'number') return 'json-number'
  if (type === 'boolean') return 'json-bool'
  return ''
}

function preview(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `Array(${value.length})`
  return `Object(${Object.keys(value as object).length})`
}

function toEditText(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  return String(value)
}

function coerce(original: unknown, text: string): unknown {
  if (typeof original === 'number') {
    if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text.trim())) throw new Error('请输入数字')
    return Number(text)
  }
  if (typeof original === 'boolean') {
    if (text === 'true') return true
    if (text === 'false') return false
    throw new Error('请输入 true 或 false')
  }
  if (original === null) {
    const trimmed = text.trim()
    if (trimmed === 'null') return null
    if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true'
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
    return text
  }
  return text
}

async function startEdit() {
  if (!props.editable || isObject.value) return
  editText.value = toEditText(props.data)
  editError.value = ''
  editing.value = true
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
}

function cancel() {
  editing.value = false
  editError.value = ''
}

function commit() {
  if (!editing.value) return
  try {
    const value = coerce(props.data, editText.value)
    editing.value = false
    editError.value = ''
    if (!Object.is(value, props.data)) emit('update', props.path, value)
  } catch (error) {
    editError.value = error instanceof Error ? error.message : String(error)
    void nextTick(() => inputRef.value?.focus())
  }
}

function childPath(key: string) {
  return [...props.path, key]
}

function relay(path: string[], value: unknown) {
  emit('update', path, value)
}
</script>

<template>
  <div class="json-node" :style="{ paddingLeft: `${depth * 14}px` }">
    <template v-if="isObject">
      <div>
        <span class="json-toggle" @click="collapsed = !collapsed">{{ collapsed ? '▶' : '▼' }}</span>
        <span v-if="name" class="json-key">{{ name }}: </span>
        <span class="json-null">{{ Array.isArray(data) ? '[' : '{' }}</span>
        <template v-if="collapsed">
          <span class="json-null"> {{ preview(data) }} {{ Array.isArray(data) ? ']' : '}' }}</span>
        </template>
        <span v-else class="json-null"> {{ entries.length }} </span>
      </div>
      <template v-if="!collapsed">
        <JsonViewer
          v-for="[key, value] in entries"
          :key="key"
          :name="key"
          :data="value"
          :depth="depth + 1"
          :path="childPath(key)"
          :editable="editable"
          @update="relay"
        />
        <div :style="{ paddingLeft: `${depth * 14}px` }">
          <span class="json-null">{{ Array.isArray(data) ? ']' : '}' }}</span>
        </div>
      </template>
    </template>
    <template v-else>
      <span v-if="name" class="json-key">{{ name }}: </span>
      <template v-if="editing">
        <textarea
          v-if="multiline"
          ref="inputRef"
          v-model="editText"
          class="json-edit"
          :class="valueClass(data)"
          rows="3"
          spellcheck="false"
          @keydown.enter.exact.prevent="commit"
          @keydown.esc.prevent="cancel"
          @blur="commit"
        />
        <input
          v-else
          ref="inputRef"
          v-model="editText"
          class="json-edit"
          :class="valueClass(data)"
          spellcheck="false"
          @keydown.enter.prevent="commit"
          @keydown.esc.prevent="cancel"
          @blur="commit"
        />
        <span v-if="editError" class="json-error">{{ editError }}</span>
      </template>
      <span
        v-else
        :class="[valueClass(data), { 'json-editable': editable }]"
        :title="editable ? '点击修改' : undefined"
        @click="startEdit"
      >{{ preview(data) }}</span>
    </template>
  </div>
</template>
