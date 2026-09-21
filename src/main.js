import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-800.css'
import './style.css'
import * as theme from './theme.js'
import * as setup from './setup.js'
import * as schedule from './schedule.js'
import { paint } from './teams.js'

const API = 'https://api.openf1.org/v1'

const nextLabel = document.querySelector('#next-label')
const meetingName = document.querySelector('#meeting-name')
const meetingCircuit = document.querySelector('#meeting-circuit')
const nextTime = document.querySelector('#next-time')
const nextWhen = document.querySelector('#next-when')
const weekendList = document.querySelector('#weekend-list')

let sessions = []

async function getJSON(path) {
  try {
    const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`${path} returned ${response.status}`)
    return await response.json()
  } catch (error) {
    console.warn('openf1:', error)
    return null
  }
}

async function fetchDrivers() {
  const list = await getJSON('/drivers?session_key=latest')
  if (!Array.isArray(list)) return []
  const seen = new Set()
  return list
    .filter((d) => {
      if (!d.driver_number || seen.has(d.driver_number)) return false
      seen.add(d.driver_number)
      return true
    })
    .sort((a, b) => a.driver_number - b.driver_number)
    .map((d) => ({
      number: d.driver_number,
      abbr: d.name_acronym || String(d.driver_number),
      name: d.full_name || '',
      team: d.team_name || '',
      colour: paint(d.team_colour).fill,
    }))
}

async function loadSessions() {
  const year = new Date().getFullYear()
  const list = await getJSON(`/sessions?year=${year}`)
  if (!Array.isArray(list)) return []
  return list.map(schedule.normalise).sort((a, b) => a.start - b.start)
}

function renderCountdown() {
  const now = Date.now()
  const target = schedule.currentOrNext(sessions, now)

  if (!target) {
    nextLabel.textContent = sessions.length
      ? 'Season finished. See ya next year!'
      : 'Could not reach the F1 calendar...'
    nextTime.textContent = '--:--:--'
    nextWhen.textContent = ''
    return
  }

  const live = schedule.stateOf(target, now) === 'live'
  nextLabel.textContent = live
    ? `${target.short} is live ┃ ${target.country}`
    : `Next up: ${target.short} ┃ ${target.country}`
  nextTime.textContent = live
    ? schedule.elapsed(target, now)
    : schedule.formatCountdown(target.start, now)
  nextTime.classList.toggle('hero__time--live', live)
  nextWhen.textContent = schedule.localTime(target.start)
}

function renderWeekend() {
  const now = Date.now()
  const target = schedule.currentOrNext(sessions, now)
  weekendList.textContent = ''
  if (!target) return

  meetingName.textContent = target.country
  meetingCircuit.textContent = target.circuit
  for (const s of sessions.filter((x) => x.meeting === target.meeting)) {
    const item = document.createElement('li')
    item.className = 'sched__item'
    item.dataset.state = schedule.stateOf(s, now)
    item.append(
      Object.assign(document.createElement('span'), { className: 'sched__name', textContent: s.short }),
      Object.assign(document.createElement('span'), { className: 'sched__time', textContent: schedule.localTime(s.start) }),
    )
    weekendList.append(item)
  }
}

async function start() {
  setup.applyTier(await setup.currentTier())
  await theme.init()

  const openSetup = setup.mount({
    rootEl: document.querySelector('#wizard'),
    teamsEl: document.querySelector('#setup-teams'),
    driversEl: document.querySelector('#setup-drivers'),
    tiersEl: document.querySelector('#setup-tiers'),
    stepEls: [...document.querySelectorAll('[data-step]')],
    nextEl: document.querySelector('#setup-next'),
    backEl: document.querySelector('#setup-back'),
    doneEl: document.querySelector('#setup-done'),
    fetchDrivers,
  })
  document.querySelector('#setup-open').addEventListener('click', openSetup)
  if (!(await setup.isDone())) openSetup()

  sessions = await loadSessions()
  renderWeekend()
  renderCountdown()
  setInterval(renderCountdown, 1000)
  setInterval(renderWeekend, 60_000)
  }

  start()


