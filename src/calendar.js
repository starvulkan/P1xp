import { get as read, set as write } from './storage.js'
import { normalise } from './schedule.js'

const API = 'https://api.openf1.org/v1'
const PAD = 12 * 60 * 60 * 1000
const CACHE_KEY = 'sessions'
const CACHE_TIL = 7 * 24 * 60 * 60 * 1000

let weekends = null
let liveUntil = 0

function parseWeekend(round) {
    const at = Date.parse(`${round.start}T00:00:00Z`)
    const shut = Date.parse(`${round.end}T23:59:59Z`)
    return { ...round, at, from: at - PAD, to: shut + PAD }
}

export async function loadWeekends(now = Date.now()) {
    if (weekends) return weekends
    const year = String(new Date(now).getUTCFullYear())
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
    if (!entry.savedAt || now - entry.savedAt > CACHE_TIL) return null
    return entry.rows
}

export async function refreshSessions(now = Date.now()) {
    const year = new Date(now).getUTCFullYear()
    try {
        const response = await fetch(`${API}/sessions?year=${year}`, { signal: AbortSignal.timeout(20_000) })
        if (response.status === 403) { noteLiveSession(); return null }
        if (!response.ok) throw new Error(`sessions returned ${response.status}`)
        const raw = await response.json()
        if (!Array.isArray(raw) || !raw.length) return null
        const rows = raw.map(normalise).sort((a, b) => a.start - b.start)
        await write(CACHE_KEY, { year, savedAt: now, rows })
        return rows
    } catch (error) {
        console.warn('calendar: session refresh failed', error)
        return null
    }
}

export function targetFrom(sessions, list, now = Date.now()) {
    const rows = sessions || []
    const live = rows.find((s) => now >= s.start && now <= s.end)
    if (live) return { kind: 'live', session: live, at: live.start }
    const next = rows.find((s) => s.start > now)
    if (next) return { kind: 'session', session: next, at: next.start }
    const here = weekendAt(list, now)
    if (here) return { kind: 'weekend', weekend: here, at: here.at }
    const soon = nextWeekend(list, now)
    if (soon) return { kind: 'weekend', weekend: soon, at: soon.at }
    return { kind: 'none', at: null }
}