/* get f1 session data from openf1 */
const API = 'https://api.openf1.org/v1'

export const COMPOUND = {
    SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W',
}

async function get(path) {
    try {
        const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(10_000) })
        if (!response.ok) throw new Error(`${path} returned ${response.status}`)
        const data = await response.json()
    } catch (error) {
        console.warn('openf1:', error)
        return null
    }
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

export function createFeed() {
    const state = {
        drivers: {},
        timing: [],
        locations: {},
        outline: [],
        trackStatus: 'green',
        raceControl: [],
        mode: 'live',
        loading: false,
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
    const [pos, iv, laps, stints, rc, loc] = await Promise.all([
        get(`/position?session_key=${sessionKey}`),
        get(`/intervals?session_key=${sessionKey}`),
        get(`/laps?session_key=${sessionKey}`),
        get(`/stints?session_key=${sessionKey}`),
        get(`/race_control?session_key=${sessionKey}`),
        get(`/location?session_key=${sessionKey}&date>${new Date(Date.now() - 30_000).toISOString()}`),
    ])
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
    }
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

    async function loadReplay(startAt) {
        state.loading = true
        const [pos, iv, laps, stints, rc, loc] = await Promise.all([
            get(`/position?session_key=${sessionKey}`),
            get(`/intervals?session_key=${sessionKey}`),
            get(`/laps?session_key=${sessionKey}`),
            get(`/stints?session_key=${sessionKey}`),
            get(`/race_control?session_key=${sessionKey}`),
            get(`/location?session_key=${sessionKey}&driver_number=${startAt}`),
        ])

        for (const s of stints || []) {
            const prev = stint.get(s.driver_number)
            if (!prev || s.stint_number >= prev.stint_number) stint.set(s.driver_number, s)
        }

        const clean = (loc || []).filter((r) => Number.isFinite(r.x) && (r.x !== 0 || r.y !== 0))
        state.outline = clean.map((r) => [r.x, r.y])

        const seen = []
        streams = [
            makeStream(pos, 'date', (r) => newest(position, r, 'date')),
            makeStream(iv, 'date', (r) => newest(interval, r, 'date')),
            makeStream(laps, 'date_start', (r) => newest(lap, r, 'date_start')),
            makeStream(rc, 'date', (r) => { if (r.message) seen.push(r) }),
            makeStream(clean, 'date', (r) => newest(location, r, 'date')),
        ]
        streams.rc = { seen }

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

        async startReplay(key, { speed: rate = 8, tracer = 1 } = {}) {
            this.stop()
            sessionKey = key
            state.mode = 'replay'
            speed = rate
            await loadDrivers()
            await loadReplay(tracer)
            every(400, advance)
        },

        stop() {
            timers.forEach(clearInterval)
            timers = []
            position.clear(); interval.clear(); lap.clear(); stint.clear(); location.clear()
            state.timing = []; state.raceControl = []; state.outline = []
            state.trackStatus = 'green'
        },
    }
}

export async function findDemoSession(year = new Date().getFullYear() - 1) {
    const rows = await get(`/sessions?year=${year}&session_type=Race`)
    if (!rows || rows.length === 0) return null
    return rows[Math.floor(rows.length / 2)]
}