<script setup lang="ts">
import { computed, ref } from 'vue'

defineOptions({ name: 'JsonViewer' })

const props = defineProps<{
  data: unknown
  name?: string
  depth?: number
}>()

const collapsed = ref(false)

const isObject = computed(() => props.data !== null && typeof props.data === 'object')
const entries = computed(() => {
  if (!isObject.value) return []
  if (Array.isArray(props.data)) {
    return (props.data as unknown[]).map((value, index) => [String(index), value] as const)
  }
  return Object.entries(props.data as Record<string, unknown>)
})

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
</script>

<template>
  <div class="json-node" :style="{ paddingLeft: `${(depth || 0) * 14}px` }">
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
          :depth="(depth || 0) + 1"
        />
        <div :style="{ paddingLeft: `${(depth || 0) * 14}px` }">
          <span class="json-null">{{ Array.isArray(data) ? ']' : '}' }}</span>
        </div>
      </template>
    </template>
    <template v-else>
      <span v-if="name" class="json-key">{{ name }}: </span>
      <span :class="valueClass(data)">{{ preview(data) }}</span>
    </template>
  </div>
</template>
