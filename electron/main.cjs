const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')
const live = require('./live.cjs')
const fs = require('node:fs')

const DEV = process.argv.includes('--dev')
const RECORD = process.argv.includes('--record')
let win = null

const TYPES = { webp: 'webp', jpg: 'jpeg', jpeg: 'jpeg', png: 'png' }

function tracksDir() {
    return path.join(app.getPath('userData'), 'tracks')
}

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
    try { 
        fs.mkdirSync(tracksDir(), { recursive: true }) 
    } catch (error) { 
        console.warn('tracks:', error) 
    }
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

ipcMain.handle('tracks:find', async (_event, slug) => {
    if (typeof slug !== 'string' || !/^[a-z0-9-]{1,40}$/.test(slug)) return null

    for (const [ext, type] of Object.entries(TYPES)) {
        const file = path.join(tracksDir(), `${slug}.${ext}`)
        try {
            if (!fs.existsSync(file)) continue
            return `data:image/${type};base64,${fs.readFileSync(file).toString('base64')}`
        } catch (error) {
            console.warn('tracks:', error)
        }
    }
    return null
})

ipcMain.handle('tracks:open', async () => {
    const dir = tracksDir()
    try { fs.mkdirSync(dir, { recursive: true }) } catch (error) { console.warn('tracks:', error) }
    return shell.openPath(dir)
})
