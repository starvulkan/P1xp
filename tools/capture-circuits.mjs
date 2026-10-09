// for the multiviewer circuit API

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { slugFor } from '../src/tracks.js'

const OPENF1 = 'https://api.openf1.org/v1'
const MV = 'https://api.multiviewer.app/api/v1/circuits'
const YEAR = Number(process.argv[2] || new Date().getUTCFullYear() - 1)
const OUT = 'public/outlines'
const UA = { 'User-Agent': 'P1XP/0.2.0' }
const GAP = 20
const CAP = 1200

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function thin(points, gap = GAP, cap = CAP) {
    const out = []
    let last = null
    for (const p of points) {
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= gap) { out.push(p); last = p }
    }
    if (out.length <= cap) return out
    const step = Math.ceil(out.length / cap)
    return out.filter((_, i) => i % step === 0)
}

function seconds(value) {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0
}

function spot(entry) {
    const p = (entry && (entry.start || entry.trackPosition)) || entry || {}
    const x = Number(p.x)
    const y = Number(p.y)
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
}

const sessions = await (await fetch(`${OPENF1}/sessions?year=${YEAR}`)).json()
const keys = new Map()
for (const s of sessions) {
    const slug = slugFor({ circuit: s.circuit_short_name || s.location || '', country: s.country_name || '' })
    if (slug && s.circuit_key != null && !keys.has(slug)) keys.set(slug, s.circuit_key)
}
console.log(`${keys.size} circuit keys from OpenF1 ${YEAR}\n`)

let done = 0
let shown = false

for (const [slug, key] of keys) {
    const file = `${OUT}/${slug}.json`
    if (!existsSync(file)) { console.log(`  -  ${slug}: no outline yet, skipping`); continue }

    try {
        const response = await fetch(`${MV}/${key}/${YEAR}`, { headers: UA, signal: AbortSignal.timeout(30_000) })
        if (!response.ok) { console.log(`  !  ${slug}: circuit ${key} returned ${response.status}`); await sleep(400); continue }

        const data = await response.json()
        const outline = JSON.parse(readFileSync(file, 'utf8'))

        if (!shown) {
            shown = true
            console.log(`  first marshal sector: ${JSON.stringify((data.marshalSectors || [])[0])}`)
            console.log(`  pitLoss: ${JSON.stringify(data.pitLoss)}\n`)
        }

        const raw = []
        const xs = data.x || []
        const ys = data.y || []
        for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
            const x = Number(xs[i])
            const y = Number(ys[i])
            if (Number.isFinite(x) && Number.isFinite(y)) raw.push([x, y])
        }

        const was = outline.points.length
        let note = `kept openf1 ${was} pts`
        if (raw.length >= 50) {
            outline.points = thin(raw)
            outline.source = 'multiviewer'
            const shut = Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1])
            note = `${raw.length} raw -> ${outline.points.length} pts (was ${was}), ends ${Math.round(shut)} apart`
        }

        outline.rotation = Number(data.rotation) || 0
        outline.circuitKey = key
        const pit = data.pitLoss || {}
        outline.pitLoss = { normal: seconds(pit.normal), sc: seconds(pit.sc), vsc: seconds(pit.vsc) }
        outline.corners = (data.corners || []).map((c) => ({
            number: Number(c.number) || 0,
            letter: c.letter || '',
            x: Number((c.trackPosition || {}).x) || 0,
            y: Number((c.trackPosition || {}).y) || 0,
            angle: Number(c.angle) || 0,
        }))
        outline.sectors = (data.marshalSectors || []).map((s, i) => {
            const at = spot(s)
            return at ? { number: Number(s.number) || i + 1, at } : null
        }).filter(Boolean)

        writeFileSync(file, JSON.stringify(outline))
        done += 1

        console.log(`  ok ${slug.padEnd(16)} rot ${String(outline.rotation).padStart(4)}deg  ${String(outline.corners.length).padStart(2)} corners  ${String(outline.sectors.length).padStart(2)} sectors  pit ${String(outline.pitLoss.normal).padStart(5)}s  ${note}`)
    } catch (error) {
        console.log(`  !  ${slug}: ${error.message}`)
    }

    await sleep(400)
}

console.log(`\nupdated ${done} outline files`)