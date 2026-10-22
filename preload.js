const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sand', {
  navigate: (url) => ipcRenderer.invoke('browser:navigate', url),
  back: () => ipcRenderer.invoke('browser:back'),
  forward: () => ipcRenderer.invoke('browser:forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  setProxy: (url) => ipcRenderer.invoke('browser:proxy', url),
  loadExtension: () => ipcRenderer.invoke('browser:load-extension'),
  getExtensions: () => ipcRenderer.invoke('browser:extensions'),
  onState: (callback) => {
    ipcRenderer.removeAllListeners('browser:state')
    ipcRenderer.on('browser:state', (_event, state) => callback(state))
  }
})