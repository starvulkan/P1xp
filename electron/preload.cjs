const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('p1xp', {
    desktop: true,
    startLive: () => ipcRenderer.invoke('live:start'),
    stopLive: () => ipcRenderer.invoke('live:stop'),
    onLiveMessage: (fn) => {
        const handler = (_event, payload) => fn(payload)
        ipcRenderer.on('live:message', handler)
        return () => ipcRenderer.removeListener('live:message', handler)
    },
})