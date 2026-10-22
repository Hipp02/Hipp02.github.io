const { app, BrowserWindow, WebContentsView, dialog, ipcMain, session } = require('electron')
const path = require('node:path')

const TOOLBAR_HEIGHT = 106
let mainWindow
let browserView
let browserSession
let cleanupStarted = false
let cleanupFinished = false

function updateBrowserBounds() {
  if (!mainWindow || !browserView) return

  const { width, height } = mainWindow.getContentBounds()
  browserView.setBounds({
    x: 0,
    y: TOOLBAR_HEIGHT,
    width,
    height: Math.max(0, height - TOOLBAR_HEIGHT)
  })
}

function sendBrowserState() {
  if (!mainWindow || !browserView || mainWindow.isDestroyed()) return

  const contents = browserView.webContents
  const currentUrl = contents.getURL()
  mainWindow.webContents.send('browser:state', {
    url: currentUrl,
    title: contents.getTitle(),
    loading: contents.isLoading(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    secure: currentUrl.startsWith('https://')
  })
}

function normalizeTarget(input) {
  const value = String(input || '').trim()
  if (!value) throw new Error('Enter a website or search term.')
  if (/\s/.test(value) || (!/[.:]/.test(value) && value.toLowerCase() !== 'localhost')) {
    return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`
  }
  if (/^(javascript|data|file|chrome|devtools):/i.test(value)) {
    throw new Error('Only HTTP and HTTPS websites can be opened.')
  }

  let target
  try {
    target = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  } catch {
    return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`
  }

  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('Only HTTP and HTTPS websites can be opened.')
  }
  return target.href
}

function isWebUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

async function navigate(input) {
  const target = normalizeTarget(input)
  await browserView.webContents.loadURL(target)
}

async function configureProxy(input) {
  const value = String(input || '').trim()
  if (!value) {
    await browserSession.setProxy({ mode: 'direct' })
    await browserSession.closeAllConnections()
    browserView.webContents.reload()
    return 'Direct connection'
  }

  let proxy
  try {
    proxy = new URL(value)
  } catch {
    throw new Error('Use a proxy URL such as socks5://host:1080 or http://host:8080.')
  }
  if (!['socks5:', 'http:'].includes(proxy.protocol) || !proxy.hostname ||
      !proxy.port || proxy.username || proxy.password || proxy.pathname !== '/' ||
      proxy.search || proxy.hash) {
    throw new Error('Use a proxy URL with a host and port. Credentials are not supported.')
  }

  const proxyUrl = `${proxy.protocol}//${proxy.host}`
  await browserSession.setProxy({ proxyRules: proxyUrl })
  await browserSession.closeAllConnections()
  browserView.webContents.reload()
  return `Proxy set: ${proxyUrl}`
}

async function loadExtension() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose an unpacked Chromium extension folder',
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const extension = await browserSession.loadExtension(result.filePaths[0], {
    allowFileAccess: false
  })
  return { id: extension.id, name: extension.name, version: extension.version }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#f2f5f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false
    }
  })

  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  browserSession.setPermissionCheckHandler(() => false)
  browserSession.on('will-download', (event) => event.preventDefault())

  browserView = new WebContentsView({
    webPreferences: {
      session: browserSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: false
    }
  })
  mainWindow.contentView.addChildView(browserView)
  updateBrowserBounds()
  mainWindow.on('resize', updateBrowserBounds)
  mainWindow.on('closed', () => {
    mainWindow = null
    browserView = null
  })

  const contents = browserView.webContents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    if (!isWebUrl(url)) event.preventDefault()
  })
  contents.on('will-redirect', (event, url) => {
    if (!isWebUrl(url)) event.preventDefault()
  })
  for (const eventName of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading']) {
    contents.on(eventName, sendBrowserState)
  }

  mainWindow.loadFile(path.join(__dirname, 'index.html'))
  contents.loadURL('https://duckduckgo.com')
}

ipcMain.handle('browser:navigate', (_event, input) => navigate(input))
ipcMain.handle('browser:back', () => {
  if (browserView.webContents.navigationHistory.canGoBack()) browserView.webContents.goBack()
})
ipcMain.handle('browser:forward', () => {
  if (browserView.webContents.navigationHistory.canGoForward()) browserView.webContents.goForward()
})
ipcMain.handle('browser:reload', () => browserView.webContents.reload())
ipcMain.handle('browser:proxy', (_event, input) => configureProxy(input))
ipcMain.handle('browser:load-extension', () => loadExtension())
ipcMain.handle('browser:extensions', () =>
  Object.values(browserSession.getAllExtensions()).map(({ id, name, version }) => ({ id, name, version }))
)

app.whenReady().then(async () => {
  browserSession = session.fromPartition('persist:sand-temporary')
  await browserSession.clearStorageData()
  await browserSession.clearCache()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', (event) => {
  if (!browserSession || cleanupFinished) return
  event.preventDefault()
  if (cleanupStarted) return

  cleanupStarted = true
  Promise.all([browserSession.clearStorageData(), browserSession.clearCache()])
    .catch((error) => console.error('Could not clear the temporary browser profile:', error))
    .finally(() => {
      cleanupFinished = true
      app.quit()
    })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})