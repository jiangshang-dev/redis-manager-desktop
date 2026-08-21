import { app, BrowserWindow, ipcMain, shell, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import {
  loadConnections,
  saveConnections,
  upsertConnection
} from './connection-store'
import { redisService } from './redis-service'
import type { RedisConnectionConfig } from '../shared/types'

function resolveAppIcon(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources/icon.png')
  }
  return join(__dirname, '../../resources/icon.png')
}

function createWindow(): void {
  const iconPath = resolveAppIcon()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0b0e12',
    title: 'Redis Manager',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.platform === 'darwin') {
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) app.dock.setIcon(image)
  }

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.redis.manager.desktop')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void redisService.disconnectAll()
})

function serializableError(error: unknown): Error {
  return new Error(error instanceof Error ? error.message : String(error))
}

function toCloneable(value: unknown): unknown {
  if (value === undefined) return null
  return JSON.parse(
    JSON.stringify(value, (_key, current) => {
      if (typeof current === 'bigint') return String(current)
      if (current instanceof Map) return Object.fromEntries(current)
      if (current instanceof Set) return [...current]
      return current
    })
  )
}

function handle(
  channel: string,
  listener: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const result = await listener(event, ...args)
      return toCloneable(result)
    } catch (error) {
      throw serializableError(error)
    }
  })
}

handle('connections:list', () => loadConnections())
handle('connections:save', (_event, config: unknown) => {
  const list = upsertConnection(loadConnections(), config as RedisConnectionConfig)
  saveConnections(list)
  return list
})
handle('connections:delete', (_event, id: unknown) => {
  void redisService.disconnect(String(id))
  const list = loadConnections().filter((item) => item.id !== id)
  saveConnections(list)
  return list
})
handle('redis:test', (_event, config: unknown) => redisService.test(config as RedisConnectionConfig))
handle('redis:connect', async (_event, config: unknown) => {
  await redisService.connect(config as RedisConnectionConfig)
  return { ok: true }
})
handle('redis:disconnect', (_event, id: unknown) => redisService.disconnect(String(id)))
handle('redis:selectDb', (_event, id: unknown, db: unknown) =>
  redisService.selectDb(String(id), Number(db))
)
handle('redis:ping', (_event, id: unknown) => redisService.ping(String(id)))
handle('redis:info', (_event, id: unknown) => redisService.info(String(id)))
handle('redis:scan', (_event, id: unknown, pattern: unknown) =>
  redisService.scanKeys(String(id), String(pattern || '*'))
)
handle('redis:types', (_event, id: unknown, keys: unknown) =>
  redisService.keyTypes(String(id), keys as string[])
)
handle('redis:getKey', (_event, id: unknown, key: unknown) =>
  redisService.getKey(String(id), String(key))
)
handle('redis:deleteKeys', (_event, id: unknown, keys: unknown) =>
  redisService.deleteKeys(String(id), keys as string[])
)
handle('redis:setString', (_event, id: unknown, key: unknown, value: unknown) =>
  redisService.setString(String(id), String(key), String(value))
)
handle('redis:expire', (_event, id: unknown, key: unknown, ttl: unknown) =>
  redisService.expire(String(id), String(key), Number(ttl))
)
handle('redis:rename', (_event, id: unknown, key: unknown, nextKey: unknown) =>
  redisService.rename(String(id), String(key), String(nextKey))
)
