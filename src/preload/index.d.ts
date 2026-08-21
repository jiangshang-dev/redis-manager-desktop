import type { RedisAPI } from './index'

declare global {
  interface Window {
    redisAPI: RedisAPI
  }
}

export {}
