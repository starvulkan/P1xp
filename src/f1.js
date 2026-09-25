/* get f1 session data from openf1 */
const API = 'https://api.openf1.org/v1'

export const DEMO_SESSION = 9947
export const DEMO_SPEED = 3
export const DEMO_WINDOW_MIN = 10

export const COMPOUND = {
    SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(path, tries = 4) {
    for (let i = 0; i < tries; i++) {
        try {
            const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(25_000) })
            if (response.status === 429) { await sleep(1500 * (i + 1)); continue }
            if (response.status === 404) return []
            if (!response.ok) throw new Error(`${path} returned ${response.status}`)
            const data = await response.json()
            return Array.isArray(data) ? data : []
        } catch (error) {
            console.warn('openf1:', error)
            if (i === tries - 1) return null
            await sleep(800 * (i + 1))
        }
    }
    console.warn('openf1: gave up on', path)
    return null
}

function pickAnchor(messages, from, to) {
    const inside = (t) => Number.isFinite(t) && (!from || t >= from) && (!to || t <= to)
    const hits = (messages || []).filter((m) => {
        const t = String(m.message || '').toUpperCase()
        const deployed = (t.includes('SAFETY CAR') && (t.includes('DEPLOYED') || t.includes('IN THIS LAP')))
            || t.includes('RED FLAG')
        return deployed && inside(new Date(m.date).getTime())
    })
    if (hits.length) return new Date(hits[0].date).getTime()
    if (Number.isFinite(from) && Number.isFinite(to)) return from + (to - from) * 0.4
    const all = (messages || []).map((m) => new Date(m.date).getTime())
        .filter((t) => inside(t)).sort((a, b) => a - b)
    return all.length ? all[Math.floor(all.length * 0.4)] : Date.now()
}

function newest(target, row, stamp) {
    const n = row.driver_number
    if (n == null) return
    const prev = target.get(n)
    if (!prev || new Date(row[stamp]) >= new Date(prev[stamp])) target.set(n, row)
}

export function fmtLap(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '--'
    const m = Math.floor(seconds / 60)
    const s = (seconds % 60).toFixed(3).padStart(6, '0')
    return m > 0 ? `${m}:${s}` : s
}

export function fmtGap(value) {
    if (value == null || value === '') return '--'
    if (typeof value === 'string') return value
    if (!Number.isFinite(value)) return '--'
    return value === 0 ? '--' : `+${value.toFixed(3)}`
}

export function fmtWeather(w) {
    if (!w) return ''
    const bits = []
    if (Number.isFinite(w.track_temperature)) bits.push(`Track ${Math.round(w.track_temperature)}\u00B0`)
    if (Number.isFinite(w.air_temperature)) bits.push (`Air ${Math.round(w.air_temperature)}\u00B0`)
    if (w.rainfall) bits.push('Rain')
    return bits.join(' \u2502 ')
}

function statusFrom(messages) {
    for (const m of [...messages].reverse()) {
        const text = String(m.message || '').toUpperCase()
        if (text.includes('RED FLAG')) return 'red'
        if (text.includes('VIRTUAL SAFETY CAR') && !text.includes('ENDING')) return 'vsc'
        if (text.includes('SAFETY CAR') && !text.includes('IN THIS LAP')) return 'sc'
        if (m.flag === 'RED') return 'red'
        if (m.flag === 'DOUBLE YELLOW' || m.flag === 'YELLOW') return 'yellow'
        if (m.flag === 'GREEN' || m.flag === 'CLEAR') return 'green'
    }
    return 'green'
}

function penaltiesFrom(messages) {
    const secs = {}
    const other = {}
    for (const m of messages) {
        const n = m.driver_number
        const text = String(m.message || '').toUpperCase()
        if (n == null || !text.includes('PENALTY')) continue
        if (text.includes('DELETED') || text.includes('RESCINDED') || text.includes('NO FURTHER')) continue
        if (text.includes('STOP AND GO') || text.includes('STOP/GO')) { other[n] = 'S+G'; continue }
        if (text.includes('DRIVE THROUGH')) { other[n] = 'DT'; continue }
        if (text.includes('GRID')) { other[n] = 'GRID'; continue }
        const s = text.match(/(\d+)\s*SECOND/)
        if (s) secs[n] = (secs[n] || 0) + Number(s[1])
    }
    const out = {}
    for (const n of new Set([...Object.keys(secs), ...Object.keys(other)])) {
        out[n] = other[n] || `+${secs[n]}s`
    }
    return out
}

export function createFeed() {
    const state = {
        drivers: {},
        timing: [],
        locations: {},
        outline: [],
        trackStatus: 'green',
        raceControl: [],
        penalties: {},
        radio: [],
        weather: null,
        mode: 'live',
        loading: false,
        progress: '',
        clock: 0,
        updatedAt: 0,
    }

    const position = new Map()
    const interval = new Map()
    const lap = new Map()
    const stint = new Map()
    const location = new Map()

    let sessionKey = null
    let timers = []
    let streams = []
    let wallStart = 0
    let virtualStart = 0
    let speed = 1

    async function loadDrivers() {
        const rows = await get(`/drivers?session_key=${sessionKey}`)
        if (!rows) return
        for (const d of rows) {
            if (d.driver_number == null) continue
            state.drivers[d.driver_number] = {
                number: d.driver_number,
                abbr: d.name_acronym || String(d.driver_number),
                name: d.full_name || '',
                team: d.team_name || '',
                colour: d.team_colour || '',
            }
        }
    }

    function rebuild() {
        const rows = []
        for (const [number, p] of position) {
            const driver = state.drivers[number]
            if (!driver || p.position == null) continue
            const s = stint.get(number)
            const i = interval.get(number)
            const l = lap.get(number)
            rows.push({
                pos: p.position,
                number,
                abbr: driver.abbr,
                team: driver.team,
                colour: driver.colour,
                gap: i ? i.gap_to_leader : null,
                interval: i ? i.interval : null,
                lastLap: l ? l.lap_duration : null,
                compound: s ? COMPOUND[s.compound] || null : null,
                stintLaps: s && Number.isFinite(s.tyre_age_at_start) && Number.isFinite(l?.lap_number)
                    ? s.tyre_age_at_start + (l.lap_number - s.lap_start) + 1
                    : null,
                penalty: state.penalties[number] || null,
            })
        }
        rows.sort((a, b) => a.pos - b.pos)
        state.timing = rows

        const dots = {}
        for (const [number, loc] of location) {
            const driver = state.drivers[number]
            if (driver && Number.isFinite(loc.x)) {
                dots[number] = { x: loc.x, y: loc.y, abbr: driver.abbr, colour: driver.colour }
            }
        }
        state.locations = dots
        state.updatedAt = Date.now()
    }

/* live stream */

    async function pollLive() {
    const pos = await get(`/position?session_key=${sessionKey}`)
    const iv = await get(`/intervals?session_key=${sessionKey}`)
    const laps = await get(`/laps?session_key=${sessionKey}`)
    const stints = await get(`/stints?session_key=${sessionKey}`)
    const rc = await get(`/race_control?session_key=${sessionKey}`)
    const loc = await get(`/location?session_key=${sessionKey}&date>${new Date(Date.now() - 30_000).toISOString()}`)
    const radio = await get(`/team_radio?session_key=${sessionKey}`)
    const weather = await get(`/weather?session_key=${sessionKey}`)

    for (const r of pos || []) newest(position, r, 'date')
    for (const r of iv || []) newest(interval, r, 'date')
    for (const r of laps || []) newest(lap, r, 'date_start')
    for (const s of stints || []) {
        const prev = stint.get(s.driver_number)
        if (!prev || s.stint_number >= prev.stint_number) stint.set(s.driver_number, s)
    }
    for (const r of loc || []) newest(location, r, 'date')
    if (rc) {
        state.raceControl = rc.filter((m) => m.message)
            .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 40)
        state.trackStatus = statusFrom(rc)
        state.penalties = penaltiesFrom(rc)
    }
    if (radio) state.radio = radio.filter((r) => r.recording_url)
        .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 25)
    if (weather && weather.length) state.weather = weather[weather.length - 1]
    rebuild()
  }

  /* come mr dj song pon de replayyy */

    function virtualNow() {
        return virtualStart + (Date.now() - wallStart) * speed
    }

    function advance() {
        const t = virtualNow()
        state.clock = t
        let changed = false
        for (const s of streams) {
            while (s.i < s.rows.length && new Date(s.rows[s.i][s.stamp]).getTime() <= t) {
                s.take(s.rows[s.i]); s.i++; changed = true 
            }
        }
        if (changed) {
            state.raceControl = streams.rc.seen
                .slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 40)
            state.trackStatus = statusFrom(streams.rc.seen)
            state.penalties = penaltiesFrom(streams.rc.seen)
            state.radio = streams.radio.heard.slice(0, 25)
            rebuild()
        }
    }

    function makeStream(rows, stamp, take) {
        return {
            rows: (rows || []).filter((r) => r[stamp])
                .sort((a, b) => new Date(a[stamp]) - new Date(b[stamp])),
            i: 0, stamp, take,
        }
    }

    async function loadReplay(startAt, windowMin) {
        state.loading = true
        const step = async (label, path) => { state.progress = label; return get(path) }

        const meta = await step('session', `/sessions?session_key=${sessionKey}`)
        const info = (meta && meta[0]) || null
        const sStart = info ? new Date(info.date_start).getTime() : NaN
        const sEnd = info ? new Date(info.date_end).getTime() : NaN
        const safeFrom = Number.isFinite(sStart) ? sStart + 4 * 60_000 : NaN
        const safeTo = Number.isFinite(sEnd) ? sEnd - 2 * 60_000 : NaN

        const rcAll = await step('race control', `/race_control?session_key=${sessionKey}`)
        const anchor = pickAnchor(rcAll, safeFrom, safeTo)

        let fromMs = anchor - 2 * 60_000
        let toMs = anchor + (windowMin - 2) * 60_000
        if (Number.isFinite(safeFrom) && fromMs < safeFrom) { fromMs = safeFrom; toMs = fromMs + windowMin * 60_000 }
        if (Number.isFinite(safeTo) && toMs > safeTo) { toMs = safeTo; fromMs = Math.max(safeFrom || 0, toMs - windowMin * 60_000) }
        const from = new Date(fromMs).toISOString()
        const to = new Date(toMs).toISOString()
        const win = `&date>${from}&date<${to}`

        const preFrom = new Date(fromMs - 90_000).toISOString()
        const gridRows = await step('grid', `/position?session_key=${sessionKey}&date<${from}`)
        for (const r of gridRows || []) newest(position, r, 'date')
        const gapRows = await step('gaps so far', `/intervals?session_key=${sessionKey}&date>${preFrom}&date<${from}`)
        for (const r of gapRows || []) newest(interval, r, 'date')

        const pos = await step('positions', `/position?session_key=${sessionKey}${win}`)
        const iv = await step('gaps', `/intervals?session_key=${sessionKey}${win}`)
        const laps = await step('lap times', `/laps?session_key=${sessionKey}&date_start>${from}&date_start<${to}`)
        const stints = await step('tyres', `/stints?session_key=${sessionKey}`)
        const radioAll = await step('team radio', `/team_radio?session_key=${sessionKey}`)
        const weather = await step('weather', `/weather?session_key=${sessionKey}${win}`)
        const loc = await step('car positions', `/location?session_key=${sessionKey}${win}`)
        state.progress = ''

        const inWindow = (row, key = 'date') => {
            const t = new Date(row[key]).getTime()
            return t >= new Date(from).getTime() && t <= new Date(to).getTime()
        }
        const rc = (rcAll || []).filter((m) => inWindow(m))
        const radio = (radioAll || []).filter((r) => r.recording_url && inWindow(r))

        for (const s of stints || []) {
            const prev = stint.get(s.driver_number)
            if (!prev || s.stint_number >= prev.stint_number) stint.set(s.driver_number, s)
        }

        const clean = (loc || []).filter((r) => Number.isFinite(r.x) && (r.x !== 0 || r.y !== 0))
        // every other sample is plenty for a moving dot, and halves the work
        const dots = clean.filter((r, i) => i % 2 === 0)
        state.outline = clean.filter((r) => r.driver_number === startAt).map((r) => [r.x, r.y])
        if (state.outline.length < 50 && clean.length) {
            const fallback = clean[0].driver_number
            state.outline = clean.filter((r) => r.driver_number === fallback).map((r) => [r.x, r.y])
        }

        const seen = []
        const heard = []
        streams = [
            makeStream(pos, 'date', (r) => newest(position, r, 'date')),
            makeStream(iv, 'date', (r) => newest(interval, r, 'date')),
            makeStream(laps, 'date_start', (r) => newest(lap, r, 'date_start')),
            makeStream(rc, 'date', (r) => { if (r.message) seen.push(r) }),
            makeStream(dots, 'date', (r) => newest(location, r, 'date')),
            makeStream(radio, 'date', (r) => { heard.unshift(r); heard.length = Math.min(heard.length, 25) }),
            makeStream(weather, 'date', (r) => { state.weather = r }),
        ]
        streams.rc = { seen }
        streams.radio = { heard }

        const first = streams
            .map((s) => s.rows[0] && new Date(s.rows[0][s.stamp]).getTime())
            .filter(Boolean)
        virtualStart = first.length ? Math.min(...first) : Date.now()
        wallStart = Date.now()
        state.loading = false
    }

    function every(ms, fn) {
        fn()
        timers.push(setInterval(fn, ms))
    }

    return {
        state,

        async start(key) {
            this.stop()
            sessionKey = key
            state.mode = 'live'
            every(3000, pollLive)
        },

        async startReplay(key, { speed: rate = 3, tracer = 1, windowMin = 10 } = {}) {
            this.stop()
            sessionKey = key
            state.mode = 'replay'
            speed = rate
            await loadDrivers()
            await loadReplay(tracer, windowMin)
            every(400, advance)
        },

        stop() {
            timers.forEach(clearInterval)
            timers = []
            position.clear(); interval.clear(); lap.clear(); stint.clear(); location.clear()
            state.timing = []; state.raceControl = []; state.outline = []
            state.trackStatus = 'green'; state.penalties = {}; state.radio = []; state.weather = null
        },
    }
}

export async function findDemoSession(year = new Date().getFullYear() - 1) {
    const rows = await get(`/sessions?year=${year}&session_type=Race`)
    if (!rows || rows.length === 0) return null
    return rows[Math.floor(rows.length / 2)]
}