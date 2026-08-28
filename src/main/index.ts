import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// Linux window icon. Packaged, electron-builder copies it beside the app via
// `extraResources`; unpackaged, it is read straight from the source tree. It is
// deliberately not an asar-embedded `?asset` import: BrowserWindow resolves
// `icon` in native code, which cannot read inside an asar.
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(__dirname, '../../resources/icon.png')

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    minWidth: 900,
    minHeight: 670,
    title: 'ModbusX',
    show: false,
    autoHideMenuBar: true,
    // Frameless: the title bar is drawn by the renderer so it follows the app's
    // own theme instead of the OS chrome. macOS keeps its traffic lights via
    // hiddenInset, which is the platform-idiomatic equivalent.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const }
      : { frame: false }),
    // Windows and macOS take the window icon from the packaged bundle; Linux
    // does not, so it has to be set explicitly from a shipped file.
    ...(process.platform === 'linux' ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // The renderer's title bar mirrors this, so it has to be told when the state
  // changes by any other route — double-clicking the drag region, Win+Up, or a
  // window snap.
  const emitMaximized = (): void =>
    mainWindow.webContents.send('window:maximized-changed', mainWindow.isMaximized())
  mainWindow.on('maximize', emitMaximized)
  mainWindow.on('unmaximize', emitMaximized)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Must match `appId` in electron-builder.yml, otherwise Windows treats the
  // running app and the installed shortcut as different applications and
  // taskbar pinning / notifications misbehave.
  electronApp.setAppUserModelId('com.LAMSTREAM.ModbusX')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Window controls for the renderer-drawn title bar. Resolved from the sender
  // rather than a captured reference so they stay correct if a second window
  // is ever created.
  const senderWindow = (
    e: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
  ): BrowserWindow | null => BrowserWindow.fromWebContents(e.sender)

  ipcMain.on('window:minimize', (e) => senderWindow(e)?.minimize())
  ipcMain.on('window:toggle-maximize', (e) => {
    const w = senderWindow(e)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on('window:close', (e) => senderWindow(e)?.close())
  ipcMain.handle('window:is-maximized', (e) => senderWindow(e)?.isMaximized() ?? false)

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// Import Modbus IPC
const modbusIpc = import('../modbus/modbus-ipc')

// The Modbus layer holds an open serial port or socket. Release it before the
// process exits, otherwise the OS handle stays held and the port is
// unavailable to the next launch. This matters most on macOS, where closing
// the last window does not quit the app, so the port would otherwise stay
// claimed for the whole session.
//
// Electron does not await async `before-quit` listeners, so the quit is
// deferred explicitly and re-issued once teardown finishes.
let modbusClosed = false
app.on('before-quit', (event) => {
  if (modbusClosed) return
  event.preventDefault()
  modbusIpc
    .then(({ closeModbus }) => closeModbus())
    .catch((e) => console.warn('Modbus shutdown failed:', e))
    .finally(() => {
      modbusClosed = true
      app.quit()
    })
})
