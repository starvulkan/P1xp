import { paint } from './teams.js'

const NS = 'http://www.w3.org/2000/svg'
const PAD = 26
const BOX = 1000

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

/* car dot drives off circuit prevention */
function projector(box) {
    const w = box.maxX - box.minX
    const h = box.maxY - box.minY
    const scale = (BOX - PAD * 2) / Math.max(w, h)
    const offX = (BOX - w * scale) / 2
    const offY = (BOX - h * scale) / 2
    return ([x, y]) => [
        (x - box.minX) * scale + offX,
        /* flip it cuz openf1's y grows the opposite way to svgs */
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

export function buildPath(points, project) {
    const pts = points.map(project)
    if (pts.length < 2) return ''
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') + ' Z'
}

export function mount(rootEl) {
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', `0 0 ${BOX} ${BOX}`)
    svg.setAttribute('class', 'map__svg')
    svg.setAttribute('aria-hidden', 'true')

    const track = document.createElementNS(NS, 'path')
    track.setAttribute('class', 'map__track')
    const cars = document.createElementNS(NS, 'g')
    svg.append(track, cars)

    const marks = new Map()
    let project = null
    let drawn = false

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
        label.setAttribute('dy', '-22')
        g.append(dot, label)
        cars.append(g)
        marks.set(number, { g, dot, label })
        return marks.get(number)
  }

  return function render(state, favourite) {
    if (!drawn) {
        if (!state.outline || state.outline.length < 50) return false
        const box = bounds(state.outline)
        if (!box) return false
        project = projector(box)
        track.setAttribute('d', buildPath(simplify(state.outline), project))
        rootEl.textContent = ''
        rootEl.append(svg)
        drawn = true
    }

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