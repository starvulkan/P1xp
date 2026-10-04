import { writeFileSync } from 'node:fs'

const API = 'https://api.openf1.org/v1'
const SESSION = Number(process.argv[2] || 9947)
const WINDOW_MIN = Number(process.argv[3] || 10)
const OUT = 'public/demo.json'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(path, tries = 4) {
    for (let i = 0; i < tries; i++) {
        const response = await fetch(`${API}${path}`)
        if (response.status === 429) { await sleep(1500 * (i + 1)); continue }
        if (response.status === 404) return []
        if (response.status === 401 || response.status === 403) throw new Error('OpenF1 is gated right now, a session is live')
        if (!response.ok) {
            const body = await response.text().catch(() => '')
            throw new Error(`${path} returned ${response.status} ${body.slice(0, 300)}`)
        }
        return response.json()
    }
    throw new Error(`gave up on ${path}`)
}

function pickAnchor(messages, from, to) {
    const inside = (t) => Number.isFinite(t) && t >= from && t <= to
    const hits = (messages || []).filter((m) => {
        const t = String(m.message || '').toUpperCase()
        const deployed = (t.includes('SAFETY CAR') && (t.includes('DEPLOYED') || t.includes('IN THIS LAP')))
            || t.includes('RED FLAG')
        return deployed && inside(new Date(m.date).getTime())
    })
    return hits.length ? new Date(hits[0].date).getTime() : from + (to - from) * 0.4
}

const meta = await get(`/sessions?session_key=${SESSION}`)
const info = meta[0]
if (!info) throw new Error(`no session ${SESSION}`)

const sStart = new Date(info.date_start).getTime()
const sEnd = new Date(info.date_end).getTime()
const safeFrom = sStart + 4 * 60_000
const safeTo = sEnd - 2 * 60_000

const rcAll = await get(`/race_control?session_key=${SESSION}`)
const anchor = pickAnchor(rcAll, safeFrom, safeTo)

let fromMs = Math.max(safeFrom, anchor - 2 * 60_000)
let toMs = fromMs + WINDOW_MIN * 60_000
if (toMs > safeTo) { toMs = safeTo; fromMs = Math.max(safeFrom, toMs - WINDOW_MIN * 60_000) }
const from = new Date(fromMs).toISOString()
const to = new Date(toMs).toISOString()
const win = `&date>${from}&date<${to}`

console.log(`${info.meeting_name} - ${info.session_name}`)
console.log(`window ${from} → ${to}`)

const step = async (label, path) => {
    const rows = await get(path)
    console.log(`  ${label} ${rows.length}`)
    await sleep(400)
    return rows
}

const inWindow = (row, key = 'date') => {
    const t = new Date(row[key]).getTime()
    return t >= fromMs && t <= toMs
}

const snap = {
    session: SESSION,
    label: `${info.meeting_name} \u2503 ${info.circuit_short_name}`,
    from,
    to,
    drivers: await step('drivers', `/drivers?session_key=${SESSION}`),
    grid: await step('grid', `/position?session_key=${SESSION}&date<${from}`),
    gaps: await step('gaps so far', `/intervals?session_key=${SESSION}&date>${new Date(fromMs - 90_000).toISOString()}&date<${from}`),
    pos: await step('positions', `/position?session_key=${SESSION}${win}`),
    iv: await step('intervals', `/intervals?session_key=${SESSION}${win}`),
    laps: await step('lap times', `/laps?session_key=${SESSION}&date_start>${from}&date_start<${to}`),
    stints: await step('tyres', `/stints?session_key=${SESSION}`),
    weather: await step('weather', `/weather?session_key=${SESSION}${win}`),
    loc: await step('car positions', `/location?session_key=${SESSION}${win}`),
}

snap.rc = rcAll.filter((m) => m.message && inWindow(m))
snap.radio = (await step('team radio', `/team_radio?session_key=${SESSION}`))
    .filter((r) => r.recording_url && inWindow(r))

snap.loc = snap.loc
    .filter((r, i) => i % 3 === 0)
    .filter((r) => Number.isFinite(r.x) && (r.x !== 0 || r.y !== 0))
    .map((r) => ({ driver_number: r.driver_number, x: Math.round(r.x), y: Math.round(r.y), date: r.date }))

writeFileSync(OUT, JSON.stringify(snap))
const mb = (JSON.stringify(snap).length / 1048576).toFixed(2)
console.log(`\nwrote ${OUT} (${mb} MB) - rc ${snap.rc.length}, radio ${snap.radio.length}, loc ${snap.loc.length}`)
