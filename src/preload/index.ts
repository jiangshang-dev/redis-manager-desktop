import { contextBridge, ipcRenderer } from 'electron'
import type { RedisConnectionConfig } from '../shared/types'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const api = {
  listConnections: () => ipcRenderer.invoke('connections:list'),
  saveConnection: (config: RedisConnectionConfig) =>
    ipcRenderer.invoke('connections:save', clone(config)),
  deleteConnection: (id: string) => ipcRenderer.invoke('connections:delete', id),
  testConnection: (config: RedisConnectionConfig) => ipcRenderer.invoke('redis:test', clone(config)),
  connect: (config: RedisConnectionConfig) => ipcRenderer.invoke('redis:connect', clone(config)),
  disconnect: (id: string) => ipcRenderer.invoke('redis:disconnect', id),
  selectDb: (id: string, db: number) => ipcRenderer.invoke('redis:selectDb', id, db),
  ping: (id: string) => ipcRenderer.invoke('redis:ping', id),
  info: (id: string) => ipcRenderer.invoke('redis:info', id),
  scan: (id: string, pattern: string) => ipcRenderer.invoke('redis:scan', id, pattern),
  types: (id: string, keys: string[]) => ipcRenderer.invoke('redis:types', id, clone(keys)),
  getKey: (id: string, key: string) => ipcRenderer.invoke('redis:getKey', id, key),
  deleteKeys: (id: string, keys: string[]) =>
    ipcRenderer.invoke('redis:deleteKeys', id, clone(keys)),
  setString: (id: string, key: string, value: string) =>
    ipcRenderer.invoke('redis:setString', id, key, value),
  expire: (id: string, key: string, ttl: number) => ipcRenderer.invoke('redis:expire', id, key, ttl),
  rename: (id: string, key: string, nextKey: string) =>
    ipcRenderer.invoke('redis:rename', id, key, nextKey)
}

export type RedisAPI = typeof api

contextBridge.exposeInMainWorld('redisAPI', api)
