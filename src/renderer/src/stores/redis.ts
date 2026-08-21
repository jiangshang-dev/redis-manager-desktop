import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import type { KeyDetail, RedisConnectionConfig, RedisInfo, ScanResult } from '../../../shared/types'
import { buildKeyTree, filterTree, findNode, type KeyTreeNode } from '../utils/tree'
import { toConnection, toPlain } from '../utils/plain'

type RefreshMode = 'connections' | 'db' | 'keys' | 'folder' | 'key'

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
      this.statusText = '未连接'
    },
    async connect(config: RedisConnectionConfig) {
      const payload = toConnection(config)
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
        this.detail = null
        this.statusText = '已断开'
      }
    },
    async switchConnection(config: RedisConnectionConfig) {
      this.activeId = config.id
      this.activeDb = config.db
      this.selectedKey = ''
      this.selectedFolderId = ''
      this.checkedKeys = []
      this.detail = null
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
      this.selectedKey = ''
      this.selectedFolderId = ''
      this.checkedKeys = []
      this.detail = null
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
    async openKey(key: string) {
      if (!this.activeId) return
      this.selectedKey = key
      this.loadingDetail = true
      try {
        const detail = await window.redisAPI.getKey(this.activeId, key)
        this.detail = detail
        if (detail.type) this.keyTypes[key] = detail.type
      } finally {
        this.loadingDetail = false
      }
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
    }
  }
})
