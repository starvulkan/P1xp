const CELL = 40
const MIN_DRIVERS = 5

function cellKey(x, y, cell) {
    return `${Math.round(x / cell)}:${Math.round(y / cell)}`
}

function clean(rows) {
    return (rows || [])
        .filter((r) => r && Number.isFinite(Number(r.x)) && Number.isFinite(Number(r.y)))
        .filter((r) => Number(r.x) !== 0 || Number(r.y) !== 0)
}

function span(points) {
    const xs = points.map((p) => p[0])
    const ys = points.map((p) => p[1])
    return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
}

export function busiestDriver(rows, cell = CELL) {
    const cells = new Map()
    for (const r of clean(rows)) {
        if (r.driver_number == null) continue
        if (!cells.has(r.driver_number)) cells.set(r.driver_number, new Set())
        cells.get(r.driver_number).add(cellKey(Number(r.x), Number(r.y), cell))
    }

    let best = null
    for (const [number, visited] of cells) if (!best || visited.size > best[1]) best = [number, visited.size]

    return best ? best[0] : null
}

function oneLap(points) {
    if (points.length < 50) return points
    const diagonal = span(points)
    const near = diagonal * 0.04
    const enough = diagonal * 1.5

    for (let start = 0; start < points.length - 50; start += 25) {
        const from = points[start]
        let run = 0

        for (let i = start + 1; i < points.length; i++) {
            run += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
            if (run < enough) continue
            if (Math.hypot(points[i][0] - from[0], points[i][1] - from[1]) <= near) {
                return points.slice(start, i + 1)
            }
        }
    }

    return points
}

function attempt(all, driver, cell, minDrivers) {
    const voters = new Map()
    for (const r of all) {
        const k = cellKey(Number(r.x), Number(r.y), cell)
        if (!voters.has(k)) voters.set(k, new Set())
        voters.get(k).add(r.driver_number)
    }

    const path = all
        .filter((r) => r.driver_number === driver)
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
        .filter((r) => (voters.get(cellKey(Number(r.x), Number(r.y), cell)) || new Set()).size >= minDrivers)
        .map((r) => [Number(r.x), Number(r.y)])

    if (path.length < 50) return null

    const seen = new Set()
    const out = []
    for (const [x, y] of oneLap(path)) {
        const k = cellKey(x, y, cell)
        if (seen.has(k)) continue
        seen.add(k)
        out.push([Math.round(x), Math.round(y)])
    }

    return out.length >= 50 ? out : null
}

export function buildOutline(rows, options = {}) {
    const all = clean(rows)
    if (all.length < 200) return null

    const driver = options.driver ?? busiestDriver(rows)

    /* strict first, then looser: short compact circuits need a bigger grid
       and fewer votes before a lap closes cleanly */
    const tries = options.cell
        ? [[options.cell, options.minDrivers ?? MIN_DRIVERS]]
        : [[CELL, MIN_DRIVERS], [CELL, 2], [80, 2], [140, 1]]

    for (const [cell, minDrivers] of tries) {
        const got = attempt(all, driver, cell, minDrivers)
        if (got) return got
    }

    return null
}