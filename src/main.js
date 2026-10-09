import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-800.css'
import './style.css'
import * as theme from './theme.js'
import * as setup from './setup.js'
import * as schedule from './schedule.js'
import * as tracks from './tracks.js'
import * as trackmap from './trackmap.js'
import * as tower from './tower.js'
import * as radio from './radio.js'
import { createFeed, fmtWeather, fmtLaps, OVER, DONE, ONE_SHOT, DEMO_SESSION, DEMO_SPEED } from './f1.js'
import * as calendar from './calendar.js'
import * as roster from './roster.js'

const nextLabel = document.querySelector('#next-label')
const meetingName = document.querySelector('#meeting-name')
const meetingCircuit = document.querySelector('#meeting-circuit')
const nextTime = document.querySelector('#next-time')
const nextWhen = document.querySelector('#next-when')
const weekendList = document.querySelector('#weekend-list')

const wizardEl = document.querySelector('#wizard')
const homeEl = document.querySelector('#home')
const liveEl = document.querySelector('#live')
const feedEl = document.querySelector('#live-feed')
const liveSession = document.querySelector('#live-session')
const liveClock = document.querySelector('#live-clock')
const liveLaps = document.querySelector('#live-laps')
const livePit = document.querySelector('#live-pit')
const liveWeather = document.querySelector('#live-weather')
const mapEl = document.querySelector('#map')
const replayBar = document.querySelector('#replay-bar')
const replayText = document.querySelector('#replay-text')
const joinEl = document.querySelector('#live-join')
const exitEl = document.querySelector('#live-exit')

const feed = createFeed()
const renderTower = tower.mount({
  listEl: document.querySelector('#tower-list'),
  statusEl: document.querySelector('#live-status'),
  feedEl: document.querySelector('#feed-list'),
})
const renderMap = trackmap.mount(mapEl)
const renderRadio = radio.mount({ listEl: document.querySelector('#radio-list') })

let sessions = []
let weekends = []
let liveKey = null
let favourite = null
let demo = false
let layout = null
const finished = new Set()
const GRACE = 12 * 60 * 1000
let pendingEnd = 0
let holding = null
let joinable = null

const applyTrack = tracks.mount({
  photoEl: document.querySelector('#hero-photo'),
  scrimEl: document.querySelector('#hero-scrim'),
})

function render() {
  renderWeekend()
  renderCountdown()
}

async function loadLayout(session) {
  const slug = tracks.slugFor(session)
  if (!slug) { layout = null; return }
  if (layout && layout.key === slug) return

  layout = { key: slug, points: null }

  try {
    const response = await fetch(`./outlines/${slug}.json`, { signal: AbortSignal.timeout(10_000) })
     if (!response.ok) throw new Error(`outline returned ${response.status}`)

    const file = await response.json()
    if (Array.isArray(file.points) && file.points.length >= 50) {
      layout = {
        key: slug,
        points: file.points,
        rotation: Number(file.rotation) || 0,
        corners: Array.isArray(file.corners) ? file.corners : [],
        sectors: Array.isArray(file.sectors) ? file.sectors : [],
        pitLoss: (file.pitLoss && Number(file.pitLoss.normal)) || 0,
      }
    }
  } catch (error) {
    console.warn('map: no bundled outline for', slug, error)
  }
}

async function loadCalendar() {
  weekends = await calendar.loadWeekends()
  render()
  const saved = (await calendar.cachedSessions()) || (await calendar.bundledSessions())
  if (saved) { sessions = saved; render() }
  const fresh = await calendar.refreshSessions()
  if (fresh) { sessions = fresh; weekends = calendar.weekendsNow(); render() }
}

function pitText() {
  const loss = layout && Number(layout.pitLoss)
  return Number.isFinite(loss) && loss >= 5 && loss <= 90 ? `Pit ~${loss.toFixed(1)}s` : ''
}

function paintFeed() {
  if (!feedEl) return
  const using = feed.state.mode === 'live' && feed.liveReady()
  feedEl.hidden = !using
  if (!using) return

  if (Math.abs(feed.state.skew) > 180_000) {
    feedEl.dataset.feed = 'error'
    feedEl.textContent = `Your clock is ${Math.round(feed.state.skew / 60_000)} min off`
    return
  }

  const info = feed.state.feed || { state: 'connecting', detail: '' }
  const silent = feed.state.feedAt ? Date.now() - feed.state.feedAt : Infinity
  let tag = 'wait'
  let text = 'Connecting'

  if (info.state === 'error') {
    tag = 'error'
    text = info.detail ? `Feed error \u2502 ${info.detail}` : 'Feed error'
  } else if (info.state === 'retry') {
    tag = "error"
    text = `Reconnecting in ${info.detail}`
  } else if (info.state === 'closed') {
    tag = 'error'
    text = 'Feed dropped'
  } else if (feed.state.feedAt && silent < 15_000) {
    tag = 'live'
    text = 'Live feed'
  } else if (feed.state.feedAt) {
    tag = 'stale'
    text = `No data ${Math.round(silent / 1000)}s`
  } else if (info.state === 'subscribed') {
    tag = 'wait'
    text = 'Waiting for data'
  }

  feedEl.dataset.feed = tag
  feedEl.textContent = text
}

function paintLive() {
  paintFeed()
  renderTower(feed.state, favourite)
  renderRadio(feed.state, favourite)
  liveWeather.textContent = fmtWeather(feed.state.weather)
  if (renderMap(feed.state, favourite, layout)) mapEl.classList.add('map--live')
}

async function enterLive(session) {
  if (liveKey === session.key) return
  liveKey = session.key
  favourite = await setup.currentDriver()
  await loadLayout(session)
  homeEl.hidden = true
  liveEl.hidden = false
  joinEl.hidden = true
  exitEl.hidden = false
  liveSession.textContent = `${session.short} \u2502 ${session.circuit}`
  livePit.textContent = pitText()
  if (feed.liveReady()) await feed.startLiveFeed(session.type)
  else await feed.start(session.key, session.type)
}

function leaveLive() {
  if (liveKey === null) return
  liveKey = null
  feed.stop()
  liveEl.hidden = true
  homeEl.hidden = false
  exitEl.hidden = true
  liveLaps.textContent = ''
  livePit.textContent = ''
  mapEl.classList.remove('map--live')
}

async function joinLive() {
  if (!joinable) return
  await enterLive(joinable.session)
}

function exitLive() {
  leaveLive()
  renderCountdown()
}

async function startDemo() {
  demo = true
  favourite = await setup.currentDriver()
  await loadLayout({ circuit: 'Silverstone', country: 'United Kingdom' })
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

function sessionOver(pick) {
  if (!pick.slack) { pendingEnd = 0; return false }
  if (finished.has(pick.session.key)) return true

  const state = feed.state.sessionState
  const part = feed.state.sessionPart
  const segmented = part > 0 || !ONE_SHOT.has(feed.state.sessionType)

  if (DONE.has(state)) { finished.add(pick.session.key); return true }
  if (state !== 'Finished') { pendingEnd = 0; return false }

  if (!segmented || part >= 3) { finished.add(pick.session.key); return true }
  if (part > 0) { pendingEnd = 0; return false }

  if (!pendingEnd) pendingEnd = Date.now()
  if (Date.now() - pendingEnd < GRACE) return false

  finished.add(pick.session.key)
  return true
}

function liveClockText(pick, now) {
  if (!pick.slack) return schedule.elapsed(pick.session, now)

  const started = feed.state.sessionState === 'Started' && feed.state.sessionStateAt
  if (started) return schedule.elapsed({ start: feed.state.sessionStateAt }, now)

  return '--:--:--'
}

function renderCountdown() {
  const now = Date.now()

  if (demo) {
    joinEl.hidden = true
    exitEl.hidden = true
    liveLaps.textContent = ''
    livePit.textContent = ''
    liveClock.textContent = feed.state.clock
      ? new Date(feed.state.clock).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '--:--:--'
      paintLive()
      return
  }

  let pick = calendar.targetFrom(sessions, weekends, now)

  const heard = feed.state.sessionState
  if (pick.kind !== 'live' && holding && heard && heard !== 'Inactive' && !finished.has(holding.session.key)) {
    pick = holding
  }

  joinable = null
  if (pick.kind === 'live') {
    if (sessionOver(pick)) {
      holding = null
      pick = calendar.targetFrom(sessions.filter((s) => !finished.has(s.key)), weekends, now)
    } else {
      holding = pick
      joinable = pick
    }
  }

  if (liveKey !== null && (!joinable || joinable.session.key !== liveKey)) leaveLive()

  joinEl.hidden = !joinable || liveKey !== null
  if (joinable) joinEl.textContent = `Join ${joinable.session.short} live`
  exitEl.hidden = liveKey === null

  if (liveKey !== null) {
    liveClock.textContent = liveClockText(joinable, now)
    liveLaps.textContent = fmtLaps(feed.state)
    paintLive()
  }

  if (pick.kind === 'none') {
    nextLabel.textContent = 'Season finished. See ya next year!'
    nextTime.textContent = '--:--:--'
    nextWhen.textContent = ''
    nextTime.classList.remove('hero__time--live')
    return
  }

  if (pick.kind === 'weekend') {
    const day = (ms) => new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' })
    const started = pick.at <= now
    nextLabel.textContent = started
      ? `${pick.weekend.name} ┃ race weekend`
      : `Next up: ${pick.weekend.name}`
    nextTime.textContent = started ? '--:--:--' : schedule.formatCountdown(pick.at, now)
    nextTime.classList.remove('hero__time--live')
    nextWhen.textContent = `${day(pick.at)} \u2013 ${day(Date.parse(`${pick.weekend.end}T12:00:00Z`))}`
    return
  }

  const live = pick.kind === 'live'
  const running = live && (!pick.slack || feed.state.sessionState === 'Started')

  nextLabel.textContent = !live
    ? `Next up: ${pick.session.short} ┃ ${pick.session.country}`
    : running
      ? `${pick.session.short} is live ┃ ${pick.session.country}`
      : `${pick.session.short} ┃ waiting for the session`

  nextTime.textContent = live
    ? liveClockText(pick, now)
    : schedule.formatCountdown(pick.at, now)

  nextTime.classList.toggle('hero__time--live', running)
  nextWhen.textContent = schedule.localTime(pick.at)
}

function renderWeekend() {
  const now = Date.now()
  const pick = calendar.targetFrom(sessions, weekends, now)
  weekendList.textContent = ''
  if (pick.kind === 'none') return

  if (pick.kind === 'weekend') {
    applyTrack(pick.weekend)
    meetingName.textContent = pick.weekend.name
    meetingCircuit.textContent = pick.weekend.circuit
    return
  }

  const target = pick.session
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
    rootEl: wizardEl,
    teamsEl: document.querySelector('#setup-teams'),
    driversEl: document.querySelector('#setup-drivers'),
    tiersEl: document.querySelector('#setup-tiers'),
    stepEls: [...document.querySelectorAll('[data-step]')],
    nextEl: document.querySelector('#setup-next'),
    backEl: document.querySelector('#setup-back'),
    doneEl: document.querySelector('#setup-done'),
    fetchDrivers: roster.load,
  })
  document.querySelector('#setup-open').addEventListener('click', openSetup)
  document.querySelector('#demo-open').addEventListener('click', startDemo)
  document.querySelector('#replay-exit').addEventListener('click', stopDemo)
  joinEl.addEventListener('click', joinLive)
  exitEl.addEventListener('click', exitLive)

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !wizardEl.hidden) return
    if (demo) stopDemo()
    else if (liveKey !== null) exitLive()
  })

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

  await loadCalendar()
  setInterval(renderCountdown, 1000)
  setInterval(renderWeekend, 60_000)
  setInterval(loadCalendar, 30 * 60_000)
  }

  start()


