// first time setup, matters for out-the-box themes and F1 TV layout arrangement
import * as storage from './storage.js'
import * as theme from './theme.js'
import { F1TEAMS, TEAM_KEYS } from './teams.js'

const DONE_KEY = 'setupDone'
const DRIVER_KEY = 'driver'
const TIER_KEY = 'tier'

export const TIERS = {
    none: 'No F1 TV', // no f1 tv? *insert megamind here*
    pro: 'F1 TV Pro',
    premium: 'F1 TV Premium'
    // this determines how many allocated spaces you get in the UI for the livestream.
}

export async function isDone() {
    return (await storage.get(DONE_KEY, false)) === true
}

export async function currentTier() {
    const tier = await storage.get(TIER_KEY, 'none')
    return tier in TIERS ? tier : 'none'
}

export async function currentDriver() {
    return await storage.get(DRIVER_KEY, null)
}

export function applyTier(tier) {
    document.documentElement.dataset.tier = tier in TIERS ? tier : 'none'
}

export function mount({ rootEl, teamsEl, driversEl, tiersEl, stepEls, nextEl, backEl, doneEl, fetchDrivers }) {
    let step = 0
    let picked = { team: null, driver: null, tier: 'none' }

    function render() {
        stepEls.forEach((el, i) => { el.hidden = i !== step })
        backEl.hidden = step === 0
        nextEl.hidden = step === stepEls.length - 1
        doneEl.hidden = step !== stepEls.length - 1
        nextEl.disabled =
            (step === 0 && !picked.team) || (step === 1 && !picked.driver)
    }

    function choose(container, value, key) {
        picked[key] = value
        for (const btn of container.querySelectorAll('.choice')) {
            btn.classList.toggle('choice--on', btn.dataset.value === String(value))
        }
        render()
    }

    function button(container, value, label, key, colour) {
        const btn = document.createElement('button')
        btn.className = 'choice'
        btn.type = 'button'
        btn.dataset.value = String(value)
        btn.textContent = label
        if (colour) btn.style.setProperty('--choice', colour)
        btn.addEventListener('click', () => {
            choose(container, value, key)
            if (key === 'team') theme.apply(value)
            if (key === 'tier') applyTier(value)
    })
    container.append(btn)
  }

  async function loadDrivers() {
    driversEl.textContent = 'Loading drivers...'
    const drivers = await fetchDrivers()
    driversEl.textContent = ''
    picked.driver = null
    if (drivers.length === 0) {
        driversEl.textContent = 'Could not load drivers. You can set this later in settings.'
        picked.driver = 'skip'
        render()
        return
    }
    for (const d of drivers) {
        button(driversEl, d.number, `${d.abbr} ${d.name}`, 'driver', d.colour)
    }
    render()
  }

  for (const key of TEAM_KEYS) {
    button(teamsEl, key, F1TEAMS[key].name, 'team', F1TEAMS[key].primary)
  }
  for (const [key, label] of Object.entries(TIERS)) {
    button(tiersEl, key, label, 'tier', null)
  }
  choose(tiersEl, 'none', 'tier')
  loadDrivers()

  nextEl.addEventListener('click', () => { step++; render() })
  backEl.addEventListener('click', () => { step--; render() })

  doneEl.addEventListener('click', async () => {
    await theme.set(picked.team)
    await storage.set(DRIVER_KEY, picked.driver === 'skip' ? null : picked.driver)
    await storage.set(TIER_KEY, picked.tier)
    await storage.set(DONE_KEY, true)
    rootEl.hidden = true
  })

  render()
  return () => { rootEl.hidden = false; step = 0; render() }
}
