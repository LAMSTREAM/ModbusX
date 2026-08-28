import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { modbusHandler } from '../modbus/modbus-handler'

// Custom APIs for renderer
const api = {}

// Window controls for the renderer-drawn title bar (the window is frameless on
// Windows and Linux, hiddenInset on macOS).
const windowAPI = {
  minimize: (): void => ipcRenderer.send('window:minimize'),
  toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
  close: (): void => ipcRenderer.send('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  /** Fires on maximize/unmaximize from ANY source — the drag region, Win+Up, a snap. */
  onMaximizedChanged: (cb: (maximized: boolean) => void): (() => void) => {
    const handler = (_e: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('window:maximized-changed', handler)
    return () => ipcRenderer.removeListener('window:maximized-changed', handler)
  },
  platform: process.platform
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('modbusAPI', modbusHandler)
    contextBridge.exposeInMainWorld('windowAPI', windowAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.modbusAPI = modbusHandler
  // @ts-ignore (define in dts)
  window.windowAPI = windowAPI
}

export type WindowAPI = typeof windowAPI
