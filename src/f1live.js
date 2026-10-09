const STATIC = 'https://livetiming.formula1.com/static/'

const FLAGS = {
    1: 'green', 2: 'yellow', 3: 'yellow', 4: 'sc', 5: 'red', 6: 'vsc', 7: 'vsc',
}

const lines = new Map()
const people = new Map()
let sessionPath = ''

export function reset() {
    lines.clear()
    people.clear()
    sessionPath = ''
}

export function utc(value) {
    const text = String(value || '').trim()
    if (!text) return null

    return /(Z|[+-]\d\d:?\d\d)$/.test(text) ? text : `${text}Z`
}

export function toSeconds(value) {
    if (typeof value === 'number') return value
    const text = String(value || '').trim()
    if (!text) return null
    const parts = text.split(':').map(Number)
    if (parts.some((n) => !Number.isFinite(n))) return null
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return parts[0]
}

function merge(number, patch) {
    const prev = lines.get(number) || {}
    const next = { ...prev, ...patch }
    lines.set(number, next)
    return next
}

function rows(object) {
    if (!object) return []
    if (Array.isArray(object)) return object
    return Object.values(object)
}

function drivers(data) {
    const out = []
    for (const [key, d] of Object.entries(data || {})) {
        const number = Number(d && d.RacingNumber ? d.RacingNumber : key)
        if (!Number.isFinite(number)) continue
        
        const prev = people.get(number) || {}
        const next = {
            driver_number: number,
            name_acronym: d.Tla || prev.name_acronym || String(number),
            full_name: d.FullName || d.BroadcastName || prev.full_name || '',
            team_name: d.TeamName || prev.team_name || '',
            team_colour: d.TeamColour || prev.team_colour || '',
        }

        people.set(number, next)
        out.push(next)
    }
    return out
}

function timing(data, stamp) {
    const pos = []
    const iv = []
    const laps = []
    const best = []
    for(const [key, line] of Object.entries((data && data.Lines) || {})) {
        const number = Number(key)
        if (!Number.isFinite(number) || !line) continue
        const patch = {}
        if (line.Position != null) patch.position = Number(line.Position)
        if (line.GapToLeader != null) patch.gap = line.GapToLeader || null
        if (line.IntervalToPositionAhead && line.IntervalToPositionAhead.Value != null) {
            patch.interval = line.IntervalToPositionAhead.Value || null
        }
        if (line.LastLapTime && line.LastLapTime.Value) patch.last = toSeconds(line.LastLapTime.Value)
        if (line.BestLapTime && line.BestLapTime.Value) patch.best = toSeconds(line.BestLapTime.Value)
        if (line.NumberOfLaps != null) patch.lapNumber = Number(line.NumberOfLaps)
        const state = merge(number, patch)

        if (patch.position != null) pos.push({ driver_number: number, position: state.position, date: stamp })
        if (patch.gap != null || patch.interval != null) {
            iv.push({
                driver_number: number,
                gap_to_leader: state.gap ?? null,
                interval: state.interval ?? null,
                date: stamp,
            })
        }
        if (patch.last != null) {
            laps.push({
                driver_number: number,
                lap_duration: state.last,
                lap_number: state.lapNumber ?? null,
                date_start: stamp,
            })
        }
        if (patch.best != null) best.push({ driver_number: number, lap_duration: state.best })
    }
    return { pos, iv, laps, best, part: data && data.SessionPart != null ? Number(data.SessionPart) : null }
}

function lapCount(data) {
    if (!data) return null
    const current = Number(data.CurrentLap)
    const total = Number(data.TotalLaps)
    return {
        current: Number.isFinite(current) ? current : null,
        total: Number.isFinite(total) ? total : null,
    }
}

function stints(data) {
    const out = []
    for (const [key, line] of Object.entries((data && data.Lines) || {})) {
        const number = Number(key)
        if (!Number.isFinite(number) || !line || !line.Stints) continue
        const all = rows(line.Stints)
        const last = all[all.length - 1]
        if (!last || !last.Compound) continue
        out.push({
            driver_number: number,
            compound: String(last.Compound).toUpperCase(),
            stint_number: all.length,
            lap_start: Number(last.StartLaps) || 0,
            tyre_age_at_start: Number(last.StartLaps) || 0,
        })
    }
    return out
}

function control(data) {
    return rows(data && data.Messages).map((m) => ({
        date: utc(m.Utc),
        message: m.Message || '',
        flag: m.Flag || '',
        driver_number: m.RacingNumber != null ? Number(m.RacingNumber) : null,
    })).filter((m) => m.message && m.date)
}

function radio(data) {
    return rows(data && data.Captures).map((c) => ({
        date: utc(c.Utc),
        driver_number: c.RacingNumber != null ? Number(c.RacingNumber) : null,
        recording_url: c.Path ? STATIC + sessionPath + c.Path : null,
    })).filter((c) => c.recording_url && c.date)
}

function weather(data) {
    if (!data) return null
    return {
        air_temperature: Number(data.AirTemp),
        track_temperature: Number(data.TrackTemp),
        rainfall: Number(data.Rainfall) ? 1 : 0,
        date: new Date().toISOString(),
    }
}

function places(data, stamp) {
    const out = []
    for (const frame of rows(data && data.Position)) {
        const when = utc(frame.Timestamp) || stamp
        for (const [key, entry] of Object.entries(frame.Entries || {})) {
            const number = Number(key)
            if (!Number.isFinite(number) || !entry) continue
            if (!Number.isFinite(entry.X)) continue
            out.push({ driver_number: number, x: entry.X, y: entry.Y, date: when })
        }
    }
    return out
}

export function convert(topic, data, stamp = new Date().toISOString()) {
    switch (topic) {
        case 'Heartbeat': return { heartbeat: utc(data && data.Utc) }
        case 'DriverList': return { drivers: drivers(data) }
        case 'TimingData': return timing(data, stamp)
        case 'TimingAppData': return { stints: stints(data) }
        case 'LapCount': return { lapCount: lapCount(data) }
        case 'RaceControlMessages': return { rc: control(data) }
        case 'TeamRadio': return { radio: radio(data) }
        case 'WeatherData': return { weather: weather(data) }
        case 'Position': return { loc: places(data, stamp) }
        case 'TrackStatus':
            return { trackStatus: FLAGS[Number(data && data.Status)] || 'green' }
        case 'SessionStatus':
            return { sessionState: (data && data.Status) || '' }
        case 'SessionInfo':
            sessionPath = (data && data.Path) || ''
            return {
                sessionType: (data && data.Type) || 'Race',
                label: data && data.Meeting
                    ? `${data.Meeting.Name || ''} \u2503 ${(data.Meeting.Circuit || {}).ShortName || ''}`
                    : '',
            }
        default: return {}
    }
}
