import { paint } from './teams.js'

const NS = 'http://www.w3.org/2000/svg'
const PAD = 44
const BOX = 1000
const LABEL = 24

function bounds(points) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [x, y] of points) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
    }
    if (!Number.isFinite(minX) || maxX === minX || maxY === minY) return null
    return { minX, maxX, minY, maxY }
}

function spin(deg) {
    if (!deg) return (p) => p
    const t = (deg * Math.PI) / 180
    const c = Math.cos(t)
    const s = Math.sin(t)
    return ([x, y]) => [x * c - y * s, x * s + y * c]
}

function projector(box) {
    const w = box.maxX - box.minX
    const h = box.maxY - box.minY
    const scale = (BOX - PAD * 2) / Math.max(w, h)
    const offX = (BOX - w * scale) / 2
    const offY = (BOX - h * scale) / 2
    return ([x, y]) => [
        (x - box.minX) * scale + offX,
        BOX - ((y - box.minY) * scale + offY),
    ]
}

function simplify(points, minGap = 12) {
    const out = []
    let last = null
    for (const p of points) {
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minGap) {
            out.push(p)
            last = p
        }
    }
    return out
}

export function buildPath(points, project, close = true) {
    const pts = points.map(project)
    if (pts.length < 2) return ''
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
    return close ? `${d} Z` : d
}

function nearest(points, at) {
    let best = 0
    let near = Infinity
    for (let i = 0; i < points.length; i++) {
        const d = (points[i][0] - at[0]) ** 2 + (points[i][1] - at[1]) ** 2
        if (d < near) { near = d; best = i }
    }
    return best
}

function sectorSpans(points, sectors) {
    const marks = []
    for (const sector of sectors) {
        if (!Array.isArray(sector.at) || !Number.isFinite(sector.at[0])) continue
        marks.push({ number: sector.number, at: nearest(points, sector.at) })
    }
    if (marks.length < 2) return []
    marks.sort((a, b) => a.at - b.at)
    return marks.map((m, i) => ({ number: m.number, from: m.at, to: marks[(i + 1) % marks.length].at }))
}

function arc(points, from, to) {
    if (to > from) return points.slice(from, to + 1)
    return [...points.slice(from), ...points.slice(0, to + 1)]
}

function outward([x, y]) {
    const dx = x - BOX / 2
    const dy = y - BOX / 2
    const len = Math.hypot(dx, dy) || 1
    return [x + (dx / len) * LABEL, y + (dy / len) * LABEL]
}

export function mount(rootEl) {
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', `0 0 ${BOX} ${BOX}`)
    svg.setAttribute('class', 'map__svg')
    svg.setAttribute('aria-hidden', 'true')

    const track = document.createElementNS(NS, 'path')
    const zones = document.createElementNS(NS, 'g')
    track.setAttribute('class', 'map__track')
    const turns = document.createElementNS(NS, 'g')
    const cars = document.createElementNS(NS, 'g')
    svg.append(track, zones, turns, cars)

    const marks = new Map()
    let project = null
    let drawnKey = null
    let spans = []
    let shown = ''

    function markFor(number) {
        if (marks.has(number)) return marks.get(number)
        const g = document.createElementNS(NS, 'g')
        g.setAttribute('class', 'map__car')
        const dot = document.createElementNS(NS, 'circle')
        dot.setAttribute('class', 'dot')
        dot.setAttribute('r', '15')
        const label = document.createElementNS(NS, 'text')
        label.setAttribute('class', 'dot__label')
        label.setAttribute('text-anchor', 'middle')
        label.setAttribute('dy', '-26')
        g.append(dot, label)
        cars.append(g)
        marks.set(number, { g, dot, label })
        return marks.get(number)
    }

    function drawFlags(points, flags) {
        const stamp = spans.map((s) => `${s.number}${flags[s.number] || ''}`).join('|')
        if (stamp === shown) return
        shown = stamp

        zones.textContent = ''
        for (const span of spans) {
            const flag = flags[span.number]
            if (!flag) continue
            const line = document.createElementNS(NS, 'path')
            line.setAttribute('class', 'map__zone')
            line.setAttribute('data-flag', flag)
            line.setAttribute('d', buildPath(arc(points, span.from, span.to), project, false))
            zones.append(line)
        }
    }

    function drawTurns(corners) {
        turns.textContent = ''
        for (const corner of corners) {
            if (!Number.isFinite(corner.x) || !Number.isFinite(corner.y)) continue
            const [x, y] = outward(project([corner.x, corner.y]))
            const label = document.createElementNS(NS, 'text')
            label.setAttribute('class', 'map__turn')
            label.setAttribute('x', x.toFixed(1))
            label.setAttribute('y', y.toFixed(1))
            label.setAttribute('text-anchor', 'middle')
            label.setAttribute('dy', '6')
            label.textContent = `${corner.number || ''}${corner.letter || ''}`
            turns.append(label)
        }
    }

    function draw(points, corners, sectors, rotation, key) {
        const turn = spin(rotation)
        const box = bounds(points.map(turn))
        if (!box) return false

        const place = projector(box)
        project = (point) => place(turn(point))
        spans = sectorSpans(points, sectors)
        shown = ''
        zones.textContent = ''

        track.setAttribute('d', buildPath(simplify(points), project))
        drawTurns(corners)
        rootEl.textContent = ''
        rootEl.append(svg)
        drawnKey = key

        return true
    }

    return function render(state, favourite, layout) {
        const bundled = layout && Array.isArray(layout.points) && layout.points.length >= 50
        const live = Array.isArray(state.outline) && state.outline.length >= 50

        const points = live ? state.outline : (bundled ? layout.points : null)
        if (!points) { drawnKey = null; return false }

        const rotation = (layout && Number(layout.rotation)) || 0
        const corners = (layout && Array.isArray(layout.corners)) ? layout.corners : []
        const sectors = (layout && Array.isArray(layout.sectors)) ? layout.sectors : []

        const key = `${(layout && layout.key) || 'none'}:${live ? 'live' : 'bundled'}:${rotation}:${corners.length}:${sectors.length}`
        if (drawnKey !== key && !draw(points, corners, sectors, rotation, key)) return false

        drawFlags(points, state.sectorFlags || {})

        const seen = new Set()
        for (const [number, car] of Object.entries(state.locations || {})) {
            if (!Number.isFinite(car.x)) continue
            seen.add(number)
            const { g, dot, label } = markFor(number)
            const [x, y] = project([car.x, car.y])
            g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`)
            const { fill, ink } = paint(car.colour)
            g.style.setProperty('--dot', fill)
            g.style.setProperty('--dot-ink', ink)
            g.classList.toggle('map__car--fav', String(number) === String(favourite))
            label.textContent = car.abbr
            dot.setAttribute('r', String(number) === String(favourite) ? '20' : '15')
        }
        for (const [number, mark] of marks) {
            if (!seen.has(number)) { mark.g.remove(); marks.delete(number) }
        }

        return true
    }
}