import { paint } from './teams.js'
import { fmtLap, fmtGap } from './f1.js'

export function mount({ listEl, statusEl, feedEl }) {
    const rows = new Map()

    function rowFor(number) {
        if (rows.has(number)) return rows.get(number)
        const el = document.createElement('li')
        el.className = 'tower__row'
        const cells = {}
        const add = (cls, tag = 'span') => {
            const c = document.createElement(tag)
            c.className = cls
            el.append(c)
            return c
        }
        cells.pos = add('tower__pos')
        cells.color = add('tower__color', 'i')
        cells.abbr = add('tower__abbr')
        cells.pen = add('tower__pen')
        cells.tyre = add('tower__tyre')
        cells.lap = add('tower__lap')
        cells.gap = add('tower__gap')
        rows.set(number, { el, cells })
        return rows.get(number)
    }

    function renderTiming(timing, favourite) {
        const seen = new Set()
        timing.forEach((d, index) => {
            seen.add(d.number)
            const { el, cells } = rowFor(d.number)
            const { fill, ink } = paint(d.colour)
            el.style.setProperty('--dot', fill)
            el.style.setProperty('--dot-ink', ink)
            el.classList.toggle('tower__row--fav', String(d.number) === String(favourite))
            cells.pos.textContent = d.pos
            cells.abbr.textContent = d.abbr
            cells.pen.textContent = d.penalty || ''
            cells.tyre.textContent = d.compound || ''
            cells.tyre.dataset.compound = d.compound || ''
            cells.tyre.title = d.stintLaps ? `${d.stintLaps} laps on this set` : ''
            cells.lap.textContent = fmtLap(d.lastLap)
            cells.gap.textContent = index === 0 ? 'LEADER' : fmtGap(d.interval ?? d.gap)
            if (el.parentNode !== listEl || listEl.children[index] !== el) {
                listEl.insertBefore(el, listEl.children[index] || null)
            }
        })
        for (const [number, row] of rows) {
            if (!seen.has(number)) { row.el.remove(); rows.delete(number) }
        }
    }

    function renderStatus(status) {
        const labels = { green: 'Track clear', yellow: 'Yellow flag', vsc: 'Virtual Safety Car', sc: 'Safety Car', red: 'Red flag' }
        statusEl.dataset.status = status
        statusEl.textContent = labels[status] || labels.green
    }

    function renderFeed(messages) {
        feedEl.textContent = ''
        for (const m of messages.slice(0, 12)) {
            const item = document.createElement('li')
            item.className = 'feed__item'
            item.append(
                Object.assign(document.createElement('span'), {
                    className: 'feed__time',
                    textContent: new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),  
                }),
                Object.assign(document.createElement('span'), {
                    className: 'feed__text', textContent: m.message,
                }),
            )
            feedEl.append(item)
        }
    }

    return function render(state, favourite) {
        renderTiming(state.timing, favourite)
        renderStatus(state.trackStatus)
        renderFeed(state.raceControl)
    }
}
