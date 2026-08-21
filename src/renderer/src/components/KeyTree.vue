<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, Folder, Coin } from '@element-plus/icons-vue'
import type { KeyTreeNode } from '../utils/tree'
import { typeClass } from '../utils/tree'
import { useRedisStore } from '../stores/redis'

defineOptions({ name: 'KeyTree' })

const props = defineProps<{
  nodes: KeyTreeNode[]
  depth?: number
}>()

const store = useRedisStore()
const depth = computed(() => props.depth || 0)

function isExpanded(id: string) {
  return store.expandedIds.includes(id)
}

function toggleExpand(node: KeyTreeNode, event: Event) {
  event.stopPropagation()
  if (node.isLeaf) return
  if (isExpanded(node.id)) {
    store.expandedIds = store.expandedIds.filter((id) => id !== node.id)
  } else {
    store.expandedIds = [...store.expandedIds, node.id]
  }
}

function rowClass(node: KeyTreeNode) {
  if (node.isLeaf) return store.selectedKey === node.redisKey ? 'active' : ''
  return store.selectedFolderId === node.id ? 'active' : ''
}

function select(node: KeyTreeNode) {
  if (node.isLeaf && node.redisKey) {
    store.selectedFolderId = ''
    void store.openKey(node.redisKey)
    return
  }
  store.selectedFolderId = node.id
  if (node.redisKey) void store.openKey(node.redisKey)
  if (!isExpanded(node.id)) store.expandedIds = [...store.expandedIds, node.id]
}

function folderChecked(node: KeyTreeNode) {
  return node.descendantKeys.length > 0 && node.descendantKeys.every((key) => store.checkedKeys.includes(key))
}

function folderIndeterminate(node: KeyTreeNode) {
  const count = node.descendantKeys.filter((key) => store.checkedKeys.includes(key)).length
  return count > 0 && count < node.descendantKeys.length
}

function onCheckLeaf(node: KeyTreeNode, checked: boolean) {
  if (node.redisKey) store.toggleChecked([node.redisKey], checked)
}

function onCheckFolder(node: KeyTreeNode, checked: boolean) {
  store.toggleChecked(node.descendantKeys, checked)
}
</script>

<template>
  <div>
    <div
      v-for="node in nodes"
      :key="node.id"
    >
      <div
        class="tree-row"
        :class="rowClass(node)"
        :style="{ paddingLeft: `${10 + depth * 14}px` }"
        @click="select(node)"
      >
        <span
          class="json-toggle"
          :style="{ visibility: node.isLeaf ? 'hidden' : 'visible', transform: isExpanded(node.id) ? 'rotate(90deg)' : 'none', display: 'inline-flex' }"
          @click="toggleExpand(node, $event)"
        >
          <el-icon :size="12"><ArrowRight /></el-icon>
        </span>
        <el-checkbox
          :model-value="node.isLeaf ? store.checkedKeys.includes(node.redisKey || '') : folderChecked(node)"
          :indeterminate="!node.isLeaf && folderIndeterminate(node)"
          @click.stop
          @change="(val: string | number | boolean) => (node.isLeaf ? onCheckLeaf(node, Boolean(val)) : onCheckFolder(node, Boolean(val)))"
        />
        <el-icon v-if="node.isLeaf" class="key-icon" color="#dc382c"><Coin /></el-icon>
        <el-icon v-else class="folder-icon" color="#f5c542"><Folder /></el-icon>
        <span class="tree-name" :title="node.redisKey || node.path">{{ node.name }}</span>
        <span v-if="!node.isLeaf" class="json-null">{{ node.leafCount }}</span>
        <span
          v-if="node.redisKey"
          class="type-badge"
          :class="typeClass(store.keyTypes[node.redisKey])"
        >
          {{ store.keyTypes[node.redisKey] || 'key' }}
        </span>
      </div>
      <KeyTree
        v-if="!node.isLeaf && isExpanded(node.id)"
        :nodes="node.children"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>
