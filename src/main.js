import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-800.css'
import './style.css'
import * as theme from './theme.js'
import * as setup from './setup.js'
import * as schedule from './schedule.js'
import { paint } from './teams.js'
import * as tracks from './tracks.js'
import * as trackmap from './trackmap.js'
import * as tower from './tower.js'
import * as radio from './radio.js'
import { createFeed, fmtWeather, DEMO_SESSION, DEMO_SPEED } from './f1.js'

const API = 'https://api.openf1.org/v1'

const nextLabel = document.querySelector('#next-label')
const meetingName = document.querySelector('#meeting-name')
const meetingCircuit = document.querySelector('#meeting-circuit')
const nextTime = document.querySelector('#next-time')
const nextWhen = document.querySelector('#next-when')
const weekendList = document.querySelector('#weekend-list')

const homeEl = document.querySelector('#home')
const liveEl = document.querySelector('#live')
const liveSession = document.querySelector('#live-session')
const liveClock = document.querySelector('#live-clock')
const liveWeather = document.querySelector('#live-weather')
const mapEl = document.querySelector('#map')
const replayBar = document.querySelector('#replay-bar')
const replayText = document.querySelector('#replay-text')

const feed = createFeed()
const renderTower = tower.mount({
  listEl: document.querySelector('#tower-list'),
  statusEl: document.querySelector('#live-status'),
  feedEl: document.querySelector('#feed-list'),
})
const renderMap = trackmap.mount(mapEl)
const renderRadio = radio.mount({ listEl: document.querySelector('#radio-list') })

let sessions = []
let liveKey = null
let favourite = null
let demo = false

const applyTrack = tracks.mount({
  photoEl: document.querySelector('#hero-photo'),
  scrimEl: document.querySelector('#hero-scrim'),
})

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

function paintLive() {
  renderTower(feed.state, favourite)
  renderRadio(feed.state, favourite)
  liveWeather.textContent = fmtWeather(feed.state.weather)
  if (renderMap(feed.state, favourite)) mapEl.classList.add('map--live')
}

async function enterLive(session) {
  if (liveKey === session.key) return
  liveKey = session.key
  favourite = await setup.currentDriver()
  homeEl.hidden = true
  liveEl.hidden = false
  liveSession.textContent = `${session.short} \u2502 ${session.circuit}`
  await feed.start(session.key)
}

function leaveLive() {
  if (liveKey === null) return
  liveKey = null
  feed.stop()
  liveEl.hidden = true
  homeEl.hidden = false
  mapEl.classList.remove('map--live')
}

async function startDemo() {
  demo = true
  favourite = await setup.currentDriver()
  homeEl.hidden = true
  liveEl.hidden = false
  replayBar.hidden = false
  replayText.textContent = 'Loading replay...'
  await feed.startReplay(DEMO_SESSION, { speed: DEMO_SPEED })
  replayText.textContent = `Replay \u2502 ${DEMO_SPEED}x speed`
}

function stopDemo() {
  demo = false
  feed.stop()
  replayBar.hidden = true
  liveEl.hidden = true
  homeEl.hidden = false
  mapEl.classList.remove('map--live')
}

function renderCountdown() {
  const now = Date.now()

  if (demo) {
    liveClock.textContent = feed.state.clock
      ? new Date(feed.state.clock).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '--:--:--'
      paintLive()
      return
  }

  const target = schedule.currentOrNext(sessions, now)

  if (target && schedule.stateOf(target, now) === 'live') {
    enterLive(target)
    liveClock.textContent = schedule.elapsed(target, now)
    paintLive()
  } else {
    leaveLive()
  }

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

  applyTrack(target)

  meetingName.textContent = target.gp || target.country
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
  document.querySelector('#demo-open').addEventListener('click', startDemo)
  document.querySelector('#replay-exit').addEventListener('click', stopDemo)

  for (const [id, url] of [
    ['#open-stream', 'https://f1tv.formula1.com/'],
    ['#open-onboard', 'https://f1tv.formula1.com/'],
  ]) {
    const button = document.querySelector(id)
    button.addEventListener('click', () => {
      window.open(url, `p1xp${id}`, 'width=1280,height=720')
      button.closest('.drop').classList.add('drop--open')
      button.textContent = 'Reopen F1 TV'
    })
  }

  if (!(await setup.isDone())) openSetup()

  sessions = await loadSessions()
  renderWeekend()
  renderCountdown()
  setInterval(renderCountdown, 1000)
  setInterval(renderWeekend, 60_000)
  }

  start()


