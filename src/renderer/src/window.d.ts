import type { WindowAPI } from '../../preload'

declare global {
  interface Window {
    windowAPI: WindowAPI
  }
}

export {}
