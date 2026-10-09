import { get as read, set as write } from './storage.js'
import { normalise } from './schedule.js'

const API = 'https://api.openf1.org/v1'
const PAD = 12 * 60 * 60 * 1000
const BUNDLED = './sessions.json'
const CACHE_KEY = 'sessions'
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000
const CAL_KEY = 'calendar'
const CAL_TTL = 60 * 24 * 60 * 60 * 1000
const LIVE_PAD = 2 * 60 * 60 * 1000
const LEAD = 5 * 60 * 1000
const LAG = 90 * 60 * 1000

let weekends = null
let liveUntil = 0

function parseWeekend(round) {
    const at = Date.parse(`${round.start}T00:00:00Z`)
    const shut = Date.parse(`${round.end}T23:59:59Z`)
    return { ...round, at, from: at - PAD, to: shut + PAD }
}

function weekendsFrom(rows) {
    const meetings = new Map()
    for (const s of rows || []) {
        if (s.meeting == null || !Number.isFinite(s.start) || !Number.isFinite(s.end)) continue
        const m = meetings.get(s.meeting)
        if (!m) {
            meetings.set(s.meeting, {
                name: s.gp || s.country || s.circuit, country: s.country || '',
                circuit: s.circuit || '', at: s.start, shut: s.end,
            })
            continue
        }
        if (s.start < m.at) m.at = s.start
        if (s.end > m.shut) m.shut = s.end
    }
    return [...meetings.values()]
        .map((m) => ({
            name: m.name, country: m.country, circuit: m.circuit,
            at: m.at, from: m.at - LIVE_PAD, to: m.shut + LIVE_PAD,
            start: new Date(m.at).toISOString().slice(0, 10),
            end: new Date(m.shut).toISOString().slice(0, 10),
        }))
        .sort((a, b) => a.from - b.from)
}

export function weekendsNow() {
    return weekends || []
}

export async function loadWeekends(now = Date.now()) {
    if (weekends) return weekends
    const year = String(new Date(now).getUTCFullYear())

    const saved = await read(CAL_KEY, null)
    if (saved && Array.isArray(saved.rows) && saved.rows.length
        && saved.year === Number(year)
        && saved.savedAt && now - saved.savedAt < CAL_TTL) {
        weekends = saved.rows
        return weekends
    }

    try {
        const response = await fetch('./calendar.json', { signal: AbortSignal.timeout(8000) })
        if (!response.ok) throw new Error(`calendar.json returned ${response.status}`)
        const file = await response.json()
        const rounds = (file.seasons && file.seasons[year]) || []
        weekends = rounds.map(parseWeekend).sort((a, b) => a.from - b.from)
    } catch (error) {
        console.warn('calendar:', error)
        weekends = []
    }
    return weekends
}

export function weekendAt(list, now = Date.now()) {
    return (list || []).find((w) => now >= w.from && now <= w.to) || null
}

export function nextWeekend(list, now = Date.now()) {
        return (list || []).find((w) => w.from > now) || null
}

export function noteLiveSession(minutes = 45) {
    liveUntil = Date.now() + minutes * 60_000
}

export function sourceAt(list, now = Date.now()) {
    if (now < liveUntil) return 'live'
    return weekendAt(list, now) ? 'live' : 'archive'
}

export async function cachedSessions(now = Date.now()) {
    const entry = await read(CACHE_KEY, null)
    if (!entry || !Array.isArray(entry.rows) || !entry.rows.length) return null
    if (entry.year !== new Date(now).getUTCFullYear()) return null
    if (!entry.savedAt || now - entry.savedAt > CACHE_TTL) return null
    return entry.rows
}

export async function bundledSessions(now = Date.now()) {
    try {
        const response = await fetch(BUNDLED, { signal: AbortSignal.timeout(10_000) })
        if (!response.ok) throw new Error(`sessions.json returned ${response.status}`)

        const file = await response.json()
        if (!file || file.year !== new Date(now).getUTCFullYear()) return null
        if (!Array.isArray(file.rows) || !file.rows.length) return null

        const rows = file.rows[0].date_start ? file.rows.map(normalise) : file.rows

        return rows
            .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end))
            .sort((a, b) => a.start - b.start)
    } catch (error) {
        console.warn('calendar: bundled sessions unavailable', error)
        return null
    }
}

export async function refreshSessions(now = Date.now()) {
    const year = new Date(now).getUTCFullYear()
    try {
        const response = await fetch(`${API}/sessions?year=${year}`, { signal: AbortSignal.timeout(20_000) })
        if (response.status === 401 || response.status === 403) { noteLiveSession(); return null }
        if (!response.ok) throw new Error(`sessions returned ${response.status}`)
        const raw = await response.json()
        if (!Array.isArray(raw) || !raw.length) return null
        const rows = raw.map(normalise).sort((a, b) => a.start - b.start)

        try {
            const meta = await fetch(`${API}/meetings?year=${year}`, { signal: AbortSignal.timeout(20_000) })
            if (meta.ok) {
                const names = new Map(((await meta.json()) || [])
                    .map((m) => [m.meeting_key, m.meeting_name]))
                for (const r of rows) if (!r.gp) r.gp = names.get(r.meeting) || r.country || ''
            }
        } catch (error) {
            console.warn('calendar: meeting names unavailable', error)
        }

        await write(CACHE_KEY, { year, savedAt: now, rows })
        
        const derived = weekendsFrom(rows)
        if (derived.length) {
            weekends = derived
            await write(CAL_KEY, { year, savedAt: now, rows: derived })
        }

        return rows
    } catch (error) {
        console.warn('calendar: session refresh failed', error)
        return null
    }
}

export function targetFrom(sessions, list, now = Date.now()) {
    const rows = sessions || []

    const exact = rows.find((s) => now >= s.start && now <= s.end)
    if (exact) return { kind: 'live', session: exact, at: exact.start, slack: false }

    let loose = null
    for (let i = 0; i < rows.length; i++) {
        const s = rows[i]
        const after = rows[i + 1]
        const until = Math.min(s.end + LAG, after ? after.start - LEAD : Infinity)
        if (now >= s.start - LEAD && now <= until) loose = s
    }
    if (loose) return { kind: 'live', session: loose, at: loose.start, slack: true }

    const next = rows.find((s) => s.start > now)
    if (next) return { kind: 'session', session: next, at: next.start }
    const here = weekendAt(list, now)
    if (here) return { kind: 'weekend', weekend: here, at: here.at }
    const soon = nextWeekend(list, now)
    if (soon) return { kind: 'weekend', weekend: soon, at: soon.at }
    return { kind: 'none', at: null }
}
