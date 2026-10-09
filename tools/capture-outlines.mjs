import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { buildOutline } from './outline.mjs'
import { slugFor } from '../src/tracks.js'

const API = 'https://api.openf1.org/v1'
const YEAR = Number(process.argv[2] || new Date().getUTCFullYear() - 1)
const MINUTES = Number(process.argv[3] || 12)
const OUT = 'public/outlines'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(path, tries = 4) {
    for (let i = 0; i < tries; i++) {
        const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(90_000) })
        if (response.status === 429) { await sleep(2000 * (i + 1)); continue }
        if (response.status === 404) return []
        if (response.status === 401 || response.status === 403) throw new Error('OpenF1 is gated right now, a session is live')
        if (!response.ok) throw new Error(`${path} returned ${response.status}`)
        return response.json()
    }
    throw new Error(`gave up on ${path}`)
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const races = (await get(`/sessions?year=${YEAR}&session_type=Race`))
    .filter((s) => s.date_start && s.session_key)
    .sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start))

console.log(`${races.length} races in ${YEAR}`)

const done = new Set()
let written = 0

for (const race of races) {
    const slug = slugFor({ circuit: race.circuit_short_name || race.location || '', country: race.country_name || '' })
    if (!slug) { console.log(`  ?  no slug for ${race.circuit_short_name || race.location}`); continue }
    if (done.has(slug)) continue
    if (existsSync(`${OUT}/${slug}.json`)) { done.add(slug); continue }

    const from = new Date(Date.parse(race.date_start) + 20 * 60_000)
    const to = new Date(from.getTime() + MINUTES * 60_000)
    const window = `date>=${from.toISOString()}&date<=${to.toISOString()}`

    try {
        const rows = await get(`/location?session_key=${race.session_key}&${window}`)
        const points = buildOutline(rows)
        if (!points) { console.log(`  !  ${slug}: not enough usable points (${rows.length} rows)`); continue }

        writeFileSync(`${OUT}/${slug}.json`, JSON.stringify({ slug, year: YEAR, session: race.session_key, points }))
        done.add(slug)
        written += 1
        console.log(`  ok ${slug.padEnd(16)} ${String(points.length).padStart(4)} points`)
    } catch (error) {
        console.log(`  !  ${slug}: ${error.message}`)
    }

    await sleep(1200)
}

console.log(`\nwrote ${written} outlines to ${OUT}`)