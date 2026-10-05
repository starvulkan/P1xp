const zlib = require('node:zlib')
const WebSocket = require('ws')

const NEGOTIATE = 'https://livetiming.formula1.com/signalrcore/negotiate'
const SOCKET = 'wss://livetiming.formula1.com/signalrcore'
const RS = '\u001e'

const TOPICS = [
    'Heartbeat', 'SessionInfo', 'SessionStatus', 'TrackStatus', 'LapCount',
    'DriverList', 'TimingData', 'TimingAppData', 'TimingStats',
    'WeatherData', 'RaceControlMessages', 'TeamRadio', 'Position.z',
]

let socket = null
let ping = null

function inflate(value) {
    const raw = zlib.inflateRawSync(Buffer.from(value, 'base64')).toString('utf8')
    return JSON.parse(raw.replace(/^\uFEFF/, ''))
}

function decode(topic, data) {
    if (!topic.endsWith('.z')) return { topic, data }
    try {
        return { topic: topic.slice(0, -2), data: inflate(data) }
    } catch (error) {
        console.warn('live: could not inflate', topic, error.message)
        return null
    }
}

async function cookie() {
    const response = await fetch(NEGOTIATE, { method: 'OPTIONS' })
    const raw = response.headers.getSetCookie
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie') || '']
    const hit = raw.map((c) => String(c).split(';')[0])
        .find((c) => c.startsWith('AWSALBCORS='))
    return hit || null
}

function send(payload) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload) + RS)
}

function handle(text, emit) {
    for (const chunk of text.split(RS)) {
        if (!chunk) continue
        let message
        try { message = JSON.parse(chunk) } catch { continue }

        if (message.type === 6) { send({ type: 6 }); continue }
        if (message.type === 3 && message.result) {
            for (const [topic, data] of Object.entries(message.result)) {
                const row = decode(topic, data)
                if (row) emit(row.topic, row.data)
            }
            continue
        }
        if (message.type === 1 && message.target === 'feed') {
            const [topic, data] = message.arguments || []
            if (!topic) continue
            const row = decode(topic, data)
            if (row) emit(row.topic, row.data)
        }
    }
}

async function start(emit) {
    stop()
    const jar = await cookie()
    socket = new WebSocket(SOCKET, { headers: jar ? { Cookie: jar } : {} })

    socket.on('open', () => {
        socket.send(JSON.stringify({ protocol: 'json', version: 1 }) + RS)
        send({ type: 1, target: 'Subscribe', arguments: [TOPICS], invocationId: '1' })
        ping = setInterval(() => send({ type: 6 }), 15_000)
    })
    socket.on('message', (buffer) => handle(buffer.toString('utf8'), emit))
    socket.on('error', (error) => console.warn('live:', error.message))
    socket.on('close', () => { clearInterval(ping); ping = null })

    return true
}

function stop() {
    clearInterval(ping); ping = null
    if (socket) { try { socket.close() } catch {} socket = null }
    return true
}

module.exports = { start, stop, decode, TOPICS }