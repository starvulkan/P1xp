import { buildOutline, busiestDriver } from './outline.mjs'
import { slugFor } from '../src/tracks.js'

const API = 'https://api.openf1.org/v1'
const WANT = (process.argv[2] || 'austria').toLowerCase()
const YEAR = Number(process.argv[3] || 2025)
const AFTER = Number(process.argv[4] || 20)
const MINUTES = Number(process.argv[5] || 25)

async function get(path) {
    const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`${path} returned ${response.status}`)
    return response.json()
}

const races = await get(`/sessions?year=${YEAR}&session_type=Race`)
const hits = races.filter((r) => slugFor({ circuit: r.circuit_short_name || r.location || '', country: r.country_name || '' }) === WANT)
if (!hits.length) throw new Error(`no ${YEAR} race maps to slug "${WANT}"`)

for (const race of hits) {
    const from = new Date(Date.parse(race.date_start) + AFTER * 60_000)
    const to = new Date(from.getTime() + MINUTES * 60_000)
    console.log(`\n=== ${WANT} | session ${race.session_key} | ${race.circuit_short_name} ===`)
    console.log(`window ${from.toISOString()} -> ${to.toISOString()}`)

    const rows = await get(`/location?session_key=${race.session_key}&date>=${from.toISOString()}&date<=${to.toISOString()}`)
    console.log(`raw rows: ${rows.length}`)

    const finite = rows.filter((r) => r && Number.isFinite(Number(r.x)) && Number.isFinite(Number(r.y)))
    const moving = finite.filter((r) => Number(r.x) !== 0 || Number(r.y) !== 0)
    console.log(`  finite x/y:      ${finite.length}`)
    console.log(`  not at (0,0):    ${moving.length}   <- buildOutline needs >= 200`)

    if (!moving.length) { console.log('  nothing usable in this window'); continue }

    const drivers = new Set(moving.map((r) => r.driver_number))
    const who = busiestDriver(rows)
    const mine = moving.filter((r) => r.driver_number === who)
    console.log(`  distinct drivers: ${drivers.size}`)
    console.log(`  busiest driver:   ${who} with ${mine.length} points   <- needs >= 50`)

    const xs = moving.map((r) => Number(r.x))
    const ys = moving.map((r) => Number(r.y))
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    console.log(`  x range: ${Math.min(...xs)} .. ${Math.max(...xs)}  (span ${Math.round(w)})`)
    console.log(`  y range: ${Math.min(...ys)} .. ${Math.max(...ys)}  (span ${Math.round(h)})`)
    console.log(`  diagonal: ${Math.round(Math.hypot(w, h))}  -> oneLap wants ${Math.round(Math.hypot(w, h) * 1.5)} of travel before closing`)
    console.log(`  sample row: ${JSON.stringify(moving[0])}`)

    for (const [cell, min] of [[40, 5], [40, 2], [80, 2], [140, 1], [20, 1], [300, 1]]) {
        const got = buildOutline(rows, { cell, minDrivers: min })
        console.log(`  cell ${String(cell).padStart(3)} / ${min} driver(s) -> ${got ? got.length + ' points' : 'null'}`)
    }

    const cell = 40
    const votes = new Map()
    for (const r of moving) {
        const k = `${Math.round(Number(r.x) / cell)}:${Math.round(Number(r.y) / cell)}`
        if (!votes.has(k)) votes.set(k, new Set())
        votes.get(k).add(r.driver_number)
    }
    const sorted = moving.filter((r) => r.driver_number === who).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    const voted = sorted.filter((r) => (votes.get(`${Math.round(Number(r.x) / cell)}:${Math.round(Number(r.y) / cell)}`) || new Set()).size >= 5)
    console.log(`\n  step by step at cell 40 / 5 drivers:`)
    console.log(`    driver ${who} rows:        ${sorted.length}`)
    console.log(`    after the vote filter:  ${voted.length}   <- needs >= 50`)
    console.log(`    distinct cells overall: ${votes.size}`)
    const dates = sorted.slice(0, 3).map((r) => r.date)
    console.log(`    first dates: ${JSON.stringify(dates)}`)
    console.log(`    parsed ok:   ${dates.map((d) => Number.isFinite(Date.parse(d))).join(', ')}`)

    const pts = voted.map((r) => [Number(r.x), Number(r.y)])
    if (pts.length >= 50) {
        const xs2 = pts.map((p) => p[0]); const ys2 = pts.map((p) => p[1])
        const diag = Math.hypot(Math.max(...xs2) - Math.min(...xs2), Math.max(...ys2) - Math.min(...ys2))
        let total = 0
        for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1])
        console.log(`    path travel: ${Math.round(total)} over ${pts.length} points`)
        console.log(`    oneLap needs ${Math.round(diag * 1.5)} travel then a return within ${Math.round(diag * 0.04)}`)
        let best = Infinity
        let run = 0
        for (let i = 1; i < pts.length; i++) {
            run += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1])
            if (run < diag * 1.5) continue
            best = Math.min(best, Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]))
        }
        console.log(`    closest return to the start after that: ${Number.isFinite(best) ? Math.round(best) : 'never got far enough'}`)
    }
}