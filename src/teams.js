/* 
hey its everyone's favorite teams! this code is to set up their color palettes
for the client's themes!
*/

export const F1TEAMS = {
  mclaren:     { name: 'McLaren',          primary: '#FF8000', secondary: '#47C7FC' },
  ferrari:     { name: 'Ferrari',          primary: '#E8002D', secondary: '#FFF200' },
  redbull:     { name: 'Red Bull Racing',  primary: '#3671C6', secondary: '#FF1E00' },
  mercedes:    { name: 'Mercedes',         primary: '#27F4D2', secondary: '#C0C0C0' },
  astonmartin: { name: 'Aston Martin',     primary: '#229971', secondary: '#CEDC00' },
  alpine:      { name: 'Alpine',           primary: '#FF87BC', secondary: '#0093CC' },
  haas:        { name: 'Haas',             primary: '#FF0000', secondary: '#FFFFFF' },
  racingbulls: { name: 'Racing Bulls',     primary: '#FFFFFF', secondary: '#3671C6' },
  williams:    { name: 'Williams',         primary: '#64C4FF', secondary: '#00A0DE' },
  audi:        { name: 'Audi',             primary: '#F50537', secondary: '#C8CDD2' },
  cadillac:    { name: 'Cadillac',         primary: '#000000', secondary: '#CFD4D9' },
}

export const TEAM_KEYS = Object.keys(F1TEAMS)
export const FALLBACK = '#8A9099'

export function normaliseHex(hex) {
    const h = String(hex || '').replace('#', '').trim()
    return h.length === 6 ? `#${h.toUpperCase()}` : FALLBACK
}

export function contrastOn(hex) {
    const h = normaliseHex(hex).slice(1)
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    return lum > 0.55 ? '#0B0D10' : '#FFFFFF'
}

export function paint(hex) {
    const fill = normaliseHex(hex)
    return { fill, ink: contrastOn(fill) }
}

export function paintTeam(key) {
    return paint(F1TEAMS[key] ? F1TEAMS[key].primary : FALLBACK)
}

export function teamByName(name) {
  if (!name) return null
  const needle = String(name).toLowerCase().replace(/[^a-z]/g, '')
  for (const [key, team] of Object.entries(TEAMS)) {
    const plain = team.name.toLowerCase().replace(/[^a-z]/g, '')
    if (needle.includes(plain) || plain.includes(needle)) return { key, ...team }
  }
  return null
}