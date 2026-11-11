const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('calcUpdate', {
  kind: 'desktop',
  status: (fileName) => ipcRenderer.invoke('update:status', fileName),
  download: (opts) => ipcRenderer.invoke('update:download', opts),
  openFile: (filePath) => ipcRenderer.invoke('update:open', filePath),
  reveal: (filePath) => ipcRenderer.invoke('update:reveal', filePath),
  openExternal: (url) => ipcRenderer.invoke('update:openExternal', url),
  onProgress: (cb) => {
    ipcRenderer.on('update:progress', (event, data) => cb(data));
  },
});
