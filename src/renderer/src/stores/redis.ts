import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import type {
  KeyDetail,
  RedisCommandResult,
  RedisConnectionConfig,
  RedisInfo,
  ScanResult
} from '../../../shared/types'
import { buildKeyTree, filterTree, findNode, type KeyTreeNode } from '../utils/tree'
import { toConnection, toPlain } from '../utils/plain'

type RefreshMode = 'connections' | 'db' | 'keys' | 'folder' | 'key'

export type WorkTab = { id: 'terminal'; kind: 'terminal' } | { id: string; kind: 'key'; key: string }

export const useRedisStore = defineStore('redis', {
  state: () => ({
    connections: [] as RedisConnectionConfig[],
    connectedIds: [] as string[],
    activeId: '',
    activeDb: 0,
    info: null as RedisInfo | null,
    keys: [] as string[],
    keyTypes: {} as Record<string, string>,
    scanPattern: '*',
    filterText: '',
    loadingKeys: false,
    loadingDetail: false,
    connecting: false,
    selectedKey: '',
    selectedFolderId: '',
    checkedKeys: [] as string[],
    expandedIds: [] as string[],
    detail: null as KeyDetail | null,
    tabs: [] as WorkTab[],
    activeTabId: '',
    lastScanMs: 0,
    autoRefresh: false,
    autoRefreshMs: 10000,
    statusText: '未连接'
  }),
  getters: {
    activeConnection(): RedisConnectionConfig | undefined {
      return this.connections.find((item) => item.id === this.activeId)
    },
    delimiter(): string {
      return this.activeConnection?.delimiter || ':'
    },
    tree(): KeyTreeNode[] {
      return buildKeyTree(this.keys, this.delimiter)
    },
    visibleTree(): KeyTreeNode[] {
      return filterTree(this.tree, this.filterText)
    },
    isConnected(): boolean {
      return this.connectedIds.includes(this.activeId)
    }
  },
  actions: {
    async bootstrap() {
      this.connections = await window.redisAPI.listConnections()
    },
    async saveConnection(config: RedisConnectionConfig) {
      this.connections = await window.redisAPI.saveConnection(toConnection(config))
    },
    async removeConnection(id: string) {
      this.connections = await window.redisAPI.deleteConnection(id)
      this.connectedIds = this.connectedIds.filter((item) => item !== id)
      if (this.activeId === id) {
        this.resetWorkspace()
      }
    },
    resetWorkspace() {
      this.activeId = ''
      this.activeDb = 0
      this.info = null
      this.keys = []
      this.keyTypes = {}
      this.selectedKey = ''
      this.selectedFolderId = ''
      this.checkedKeys = []
      this.expandedIds = []
      this.detail = null
      this.tabs = []
      this.activeTabId = ''
      this.statusText = '未连接'
    },
    openTerminal() {
      if (!this.tabs.some((tab) => tab.kind === 'terminal')) {
        this.tabs.push({ id: 'terminal', kind: 'terminal' })
      }
      this.activeTabId = 'terminal'
    },
    openKeyTab(key: string) {
      const id = `key:${key}`
      if (!this.tabs.some((tab) => tab.id === id)) {
        this.tabs.push({ id, kind: 'key', key })
      }
      this.activeTabId = id
    },
    activateTab(id: string) {
      const tab = this.tabs.find((item) => item.id === id)
      if (!tab) return
      this.activeTabId = id
      if (tab.kind === 'key') void this.loadKey(tab.key)
    },
    closeTab(id: string) {
      const index = this.tabs.findIndex((tab) => tab.id === id)
      if (index < 0) return
      const closing = this.tabs[index]
      this.tabs.splice(index, 1)
      if (this.activeTabId !== id) return
      const next = this.tabs[index] || this.tabs[index - 1]
      this.activeTabId = next?.id ?? ''
      if (next?.kind === 'key') {
        void this.loadKey(next.key)
        return
      }
      if (closing?.kind === 'key') {
        this.selectedKey = ''
        this.detail = null
      }
    },
    closeKeyTabs() {
      this.tabs = this.tabs.filter((tab) => tab.kind === 'terminal')
      if (!this.tabs.some((tab) => tab.id === this.activeTabId)) {
        this.activeTabId = this.tabs[0]?.id ?? ''
      }
      this.selectedKey = ''
      this.detail = null
    },
    async connect(config: RedisConnectionConfig) {
      const payload = toConnection(config)
      if (this.activeId && this.activeId !== payload.id) this.closeKeyTabs()
      this.connecting = true
      try {
        await window.redisAPI.connect(payload)
        if (!this.connectedIds.includes(payload.id)) this.connectedIds.push(payload.id)
        this.activeId = payload.id
        this.activeDb = payload.db
        this.statusText = `已连接 ${payload.host}:${payload.port}`
        await this.refreshInfo()
        await this.refreshKeys()
      } finally {
        this.connecting = false
      }
    },
    async disconnect(id: string) {
      await window.redisAPI.disconnect(id)
      this.connectedIds = this.connectedIds.filter((item) => item !== id)
      if (this.activeId === id) {
        this.keys = []
        this.closeKeyTabs()
        this.statusText = '已断开'
      }
    },
    async switchConnection(config: RedisConnectionConfig) {
      this.closeKeyTabs()
      this.activeId = config.id
      this.activeDb = config.db
      this.selectedFolderId = ''
      this.checkedKeys = []
      if (!this.connectedIds.includes(config.id)) {
        await this.connect(config)
        return
      }
      await this.refreshInfo()
      await this.refreshKeys()
    },
    async switchDb(db: number) {
      if (!this.activeId) return
      await window.redisAPI.selectDb(this.activeId, db)
      this.activeDb = db
      this.closeKeyTabs()
      this.selectedFolderId = ''
      this.checkedKeys = []
      await this.refreshInfo()
      await this.refreshKeys()
    },
    async refreshInfo() {
      if (!this.activeId) return
      this.info = await window.redisAPI.info(this.activeId)
    },
    async refreshConnections() {
      this.connections = await window.redisAPI.listConnections()
      const alive: string[] = []
      for (const id of this.connectedIds) {
        try {
          await window.redisAPI.ping(id)
          alive.push(id)
        } catch {
          // ignore dead connections
        }
      }
      this.connectedIds = alive
      if (this.activeId && alive.includes(this.activeId)) {
        await this.refreshInfo()
      }
      ElMessage.success('连接状态已刷新')
    },
    async refreshKeys(pattern?: string) {
      if (!this.activeId) return
      const match = pattern || this.scanPattern || '*'
      this.loadingKeys = true
      try {
        const result: ScanResult = await window.redisAPI.scan(this.activeId, match)
        this.keys = result.keys
        this.lastScanMs = result.durationMs
        this.scanPattern = match
        this.checkedKeys = this.checkedKeys.filter((key) => this.keys.includes(key))
        const sample = this.keys.slice(0, 800)
        if (sample.length) {
          this.keyTypes = {
            ...this.keyTypes,
            ...(await window.redisAPI.types(this.activeId, toPlain(sample)))
          }
        }
        this.statusText = `已加载 ${this.keys.length} 个 Key`
      } finally {
        this.loadingKeys = false
      }
    },
    async refreshFolder() {
      if (!this.activeId) return
      const node = this.selectedFolderId ? findNode(this.tree, this.selectedFolderId) : null
      if (!node || node.isLeaf) {
        await this.refreshKeys()
        return
      }
      this.loadingKeys = true
      try {
        const pattern = `${node.path}${this.delimiter}*`
        const result = await window.redisAPI.scan(this.activeId, pattern)
        const keep = this.keys.filter(
          (key) => key !== node.redisKey && !key.startsWith(`${node.path}${this.delimiter}`)
        )
        const extra = node.redisKey ? [node.redisKey] : []
        this.keys = [...new Set([...keep, ...extra, ...result.keys])].sort()
        this.lastScanMs = result.durationMs
        ElMessage.success(`文件夹已刷新，${result.keys.length} 个 Key`)
      } finally {
        this.loadingKeys = false
      }
    },
    async loadKey(key: string) {
      if (!this.activeId || !key) return
      this.selectedKey = key
      this.loadingDetail = true
      try {
        const detail = await window.redisAPI.getKey(this.activeId, key)
        if (this.selectedKey !== key) return
        this.detail = detail
        if (detail.type) this.keyTypes[key] = detail.type
      } finally {
        if (this.selectedKey === key) this.loadingDetail = false
      }
    },
    async openKey(key: string) {
      this.openKeyTab(key)
      await this.loadKey(key)
    },
    async refreshKey() {
      if (!this.selectedKey) {
        ElMessage.warning('请先选择一个 Key')
        return
      }
      await this.openKey(this.selectedKey)
      ElMessage.success('当前 Key 已刷新')
    },
    async refresh(mode: RefreshMode) {
      if (mode === 'connections') return this.refreshConnections()
      if (mode === 'db') {
        await this.refreshInfo()
        ElMessage.success('数据库信息已刷新')
        return
      }
      if (mode === 'keys') {
        await this.refreshKeys()
        ElMessage.success('全部 Key 已刷新')
        return
      }
      if (mode === 'folder') return this.refreshFolder()
      return this.refreshKey()
    },
    toggleChecked(keys: string[], checked: boolean) {
      const set = new Set(this.checkedKeys)
      keys.forEach((key) => {
        if (checked) set.add(key)
        else set.delete(key)
      })
      this.checkedKeys = [...set]
    },
    async deleteChecked() {
      if (!this.activeId || !this.checkedKeys.length) return 0
      const count = await window.redisAPI.deleteKeys(this.activeId, toPlain([...this.checkedKeys]))
      const removed = new Set(this.checkedKeys)
      this.keys = this.keys.filter((key) => !removed.has(key))
      this.tabs = this.tabs.filter((tab) => tab.kind !== 'key' || !removed.has(tab.key))
      if (!this.tabs.some((tab) => tab.id === this.activeTabId)) {
        const next = this.tabs[this.tabs.length - 1]
        this.activeTabId = next?.id ?? ''
        if (next?.kind === 'key') void this.loadKey(next.key)
      }
      if (this.selectedKey && removed.has(this.selectedKey)) {
        this.selectedKey = ''
        this.detail = null
      }
      this.checkedKeys = []
      await this.refreshInfo()
      return count
    },
    async saveString(value: string) {
      if (!this.activeId || !this.selectedKey) return
      await window.redisAPI.setString(this.activeId, this.selectedKey, value)
      await this.openKey(this.selectedKey)
    },
    async saveTtl(ttl: number) {
      if (!this.activeId || !this.selectedKey) return
      await window.redisAPI.expire(this.activeId, this.selectedKey, ttl)
      await this.openKey(this.selectedKey)
    },
    async executeCommand(raw: string): Promise<RedisCommandResult[]> {
      if (!this.activeId || !this.isConnected) throw new Error('请先连接 Redis')
      const results = await window.redisAPI.execute(this.activeId, raw)
      const selected = [...results].reverse().find((item) => item.ok && typeof item.selectedDb === 'number')
      if (typeof selected?.selectedDb === 'number') {
        this.activeDb = selected.selectedDb
        this.closeKeyTabs()
        this.selectedFolderId = ''
        this.checkedKeys = []
      }
      return results
    }
  }
})
