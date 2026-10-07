import { get as read, set as write } from './storage.js'
import { paint } from './teams.js'

const API = 'https://api.openf1.org/v1'
const BUNDLED = './demo.json'
const CACHE_KEY = 'roster'
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function shape(list) {
    if (!Array.isArray(list)) return []
    const seen = new Set()
    return list
        .filter((d) => {
            if (!d.driver_number || seen.has(d.driver_number)) return false
            seen.add(d.driver_number)
            return true
        })
        .sort((a, b) => a.driver_number - b.driver_number)
        .map((d) => ({
            number: d.driver_number,
            abbr: d.name_acronym || String(d.driver_number),
            name: d.full_name || '',
            team: d.team_name || '',
            colour: paint(d.team_colour).fill,
        }))
}

async function live(tries = 3) {
    for (let i = 0; i < tries; i++) {
        try {
            const response = await fetch(`${API}/drivers?session_key=latest`, { signal: AbortSignal.timeout(8000) })
            if (response.status === 429) { await sleep(1200 * (i + 1)); continue }
            if (!response.ok) return []
            return shape(await response.json())
        } catch (error) {
            console.warn('roster:', error)
            return []
        }
    }
    return []
}

async function cached(now) {
    const entry = await read(CACHE_KEY, null)
    if (!entry || !Array.isArray(entry.rows) || !entry.rows.length) return []
    if (entry.year !== new Date(now).getUTCFullYear()) return []
    if (!entry.savedAt || now - entry.savedAt > CACHE_TTL) return []
    return entry.rows
}

async function bundled() {
    try {
        const response = await fetch(BUNDLED, { signal: AbortSignal.timeout(20_000) })
        if (!response.ok) throw new Error(`snapshot returned ${response.status}`)
        const snap = await response.json()
        return shape(snap && snap.drivers)
    } catch (error) {
        console.warn('roster: bundled snapshot unavailable', error)
        return []
    }
}

export async function load(now = Date.now()) {
    const fresh = await live()
    if (fresh.length) {
        await write(CACHE_KEY, { year: new Date(now).getUTCFullYear(), savedAt: now, rows: fresh })
        return fresh
    }
    const saved = await cached(now)
    if (saved.length) return saved
    return await bundled()
}