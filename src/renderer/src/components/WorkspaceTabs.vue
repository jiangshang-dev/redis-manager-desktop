<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRedisStore, type WorkTab } from '../stores/redis'
import CommandConsole from './CommandConsole.vue'
import KeyDetail from './KeyDetail.vue'

const store = useRedisStore()
const consoleRef = ref<{ focus: () => void } | null>(null)
const terminalOpen = computed(() => store.tabs.some((tab) => tab.kind === 'terminal'))
const active = computed(() => store.tabs.find((tab) => tab.id === store.activeTabId))

watch(
  () => store.activeTabId,
  async (id) => {
    if (id !== 'terminal') return
    await nextTick()
    consoleRef.value?.focus()
  }
)

function focusTerminal() {
  consoleRef.value?.focus()
}

defineExpose({ focusTerminal })

function tabTitle(key: string) {
  const name = key.split(store.delimiter).filter(Boolean).pop()
  return name || key
}

function label(tab: WorkTab) {
  return tab.kind === 'terminal' ? '命令行' : tabTitle(tab.key)
}

function tip(tab: WorkTab) {
  return tab.kind === 'key' ? tab.key : '命令行'
}
</script>

<template>
  <div v-if="store.tabs.length" class="tab-bar" role="tablist">
    <div
      v-for="tab in store.tabs"
      :key="tab.id"
      class="work-tab"
      :class="{ active: tab.id === store.activeTabId }"
      role="tab"
      :title="tip(tab)"
      @click="store.activateTab(tab.id)"
    >
      <button type="button" class="tab-x" aria-label="关闭标签" @click.stop="store.closeTab(tab.id)">×</button>
      <span class="tab-label">{{ label(tab) }}</span>
    </div>
  </div>

  <div class="tab-body">
    <CommandConsole v-if="terminalOpen" v-show="active?.kind === 'terminal'" ref="consoleRef" />
    <KeyDetail v-if="active?.kind === 'key'" />
    <div v-if="!store.tabs.length" class="empty-wrap">
      还没有打开的标签。<br />
      点击左侧 Key 查看内容，或点击「命令行」打开终端。
    </div>
  </div>
</template>
