const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  scanDirectory: (dirPath) => ipcRenderer.invoke('fs:scanDirectory', dirPath),
  readStore: () => ipcRenderer.invoke('store:read'),
  writeStore: (data) => ipcRenderer.invoke('store:write', data),
  writeStoreSync: (data) => ipcRenderer.send('store:writeSync', data),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close')
});
