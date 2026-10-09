import { writeFileSync } from 'node:fs'

const API = 'https://api.openf1.org/v1'
const YEAR = Number(process.argv[2] || new Date().getUTCFullYear())
const OUT = 'public/sessions.json'

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

const raw = await get(`/sessions?year=${YEAR}`)
if (!Array.isArray(raw) || !raw.length) throw new Error(`no sessions for ${YEAR}`)

const meetings = await get(`/meetings?year=${YEAR}`)
const names = new Map((meetings || []).map((m) => [m.meeting_key, m.meeting_name]))

const rows = raw
    .filter((s) => s.date_start && s.date_end && s.session_key != null)
    .map((s) => ({
        session_key: s.session_key,
        meeting_key: s.meeting_key,
        session_name: s.session_name,
        session_type: s.session_type,
        circuit_short_name: s.circuit_short_name || s.location || '',
        country_name: s.country_name || '',
        meeting_name: s.meeting_name || names.get(s.meeting_key) || '',
        date_start: s.date_start,
        date_end: s.date_end,
    }))
    .sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start))

writeFileSync(OUT, JSON.stringify({ year: YEAR, captured: new Date().toISOString(), rows }, null, 2))

const weekends = new Set(rows.map((r) => r.meeting_key)).size
console.log(`wrote ${rows.length} sessions across ${weekends} weekends for ${YEAR} to ${OUT}`)