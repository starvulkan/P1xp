const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')
const live = require('./live.cjs')

const DEV = process.argv.includes('--dev')
const RECORD = process.argv.includes('--record')
let win = null

function create() {
    win = new BrowserWindow({
        width: 1600,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        backgroundColor: '#0A0A0C',
        title: 'P1XP',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    win.once('ready-to-show', () => win.show())
    win.webContents.setWindowOpenHandler(({ url}) => {
        shell.openExternal(url)
        return { action: 'deny' }
    })

    if (DEV) win.loadURL('http://localhost:5173')
    else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
    create()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) create() })
})

app.on('window-all-closed', () => {
    live.stop()
    if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('live:start', async () => {
    const file = RECORD
        ? path.join(app.getPath('userData'), `live-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`)
        : null
    return live.start((topic, data) => {
        if (win && !win.isDestroyed()) win.webContents.send('live:message', { topic, data })
    }, file)
})

ipcMain.handle('live:stop', async () => live.stop())
