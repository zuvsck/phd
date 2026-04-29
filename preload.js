const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('phAPI', {
  getVideoInfo: (url) => ipcRenderer.invoke('get-video-info', url),
  downloadMP4: (opts) => ipcRenderer.invoke('download-mp4', opts),
  downloadHLS: (opts) => ipcRenderer.invoke('download-hls', opts),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),
  onProgress: (cb) => {
    ipcRenderer.on('download-progress', (_e, data) => cb(data));
  },
  offProgress: () => ipcRenderer.removeAllListeners('download-progress'),
});