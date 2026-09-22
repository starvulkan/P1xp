// race weekend schedule! possibly the most important part of all this.
// determines how the UI should load, live session mode, or no live session mode.
export const KINDS = {
    'Practice 1': 'FP1',
    'Practice 2': 'FP2',
    'Practice 3': 'FP3',
    'Sprint Qualifying': 'Sprint Quali',
    'Sprint': 'Sprint',
    'Qualifying': 'Qualifying',
    'Race': 'Race',
}

export function shortName(name) {
    return KINDS[name] || name
}

export function normalise(raw) {
  const start = new Date(raw.date_start).getTime()
  const end = new Date(raw.date_end).getTime()
  return {
    key: raw.session_key,
    meeting: raw.meeting_key,
    name: raw.session_name,
    short: shortName(raw.session_name),
    type: raw.session_type,
    circuit: raw.circuit_short_name || raw.location || '',
    gp: raw.meeting_name || '',
    country: raw.country_name || '',
    start,
    end,
  }
}

export function stateOf(session, now = Date.now()) {
    if (!session) return 'none'
    if (now < session.start) return 'upcoming'
    if (now <= session.end) return 'live'
    return 'finished'
}

export function liveSession(sessions, now = Date.now()) {
  return sessions.find((s) => stateOf(s, now) === 'live') || null
}

export function nextSession(sessions, now = Date.now()) {
  return sessions
    .filter((s) => s.start > now)
    .sort((a, b) => a.start - b.start)[0] || null
}

export function currentOrNext(sessions, now = Date.now()) {
  return liveSession(sessions, now) || nextSession(sessions, now)
}

export function countdown(target, now = Date.now()) {
  const ms = Math.max(0, target - now)
  const total = Math.floor(ms / 1000)
  return {
    ms,
    days: Math.floor(total / 86400),
    hours: Math.floor(total / 3600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
    done: ms === 0,
  }
}

export function formatCountdown(target, now = Date.now()) {
    const c = countdown(target, now)
    const pad = (n) => String(n).padStart(2, '0')
    const clock = `${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`
    return c.days > 0 ? `${c.days}d ${clock}` : clock
}

export function localTime(ms) {
    return new Date(ms).toLocaleString([], {
        weekday: 'short', hour: '2-digit', minute: '2-digit',
    })
}

export function elapsed(session, now = Date.now()) {
  const pad = (n) => String(n).padStart(2, '0')
  const total = Math.max(0, Math.floor((now - session.start) / 1000))
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`
}