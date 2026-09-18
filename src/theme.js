// theme selector by (user selected) favorite team!

import { F1TEAMS, TEAM_KEYS, contrastOn } from "./teams.js";
import * as storage from './storage.js'

const KEY = 'team'
export const DEFAULT_TEAM = 'ferrari' // yes i'll force depression onto you if u dont choose muehehhehe

export async function current() {
  const key = await storage.get(KEY, DEFAULT_TEAM)
  return TEAM_KEYS.includes(key) ? key : DEFAULT_TEAM
}

export async function set(key) {
    await storage.set(KEY, TEAM_KEYS.includes(key) ? key : DEFAULT_TEAM)
}

export function apply(key) {
  const team = TEAMS[key] || TEAMS[DEFAULT_TEAM]
  const root = document.documentElement
  root.dataset.team = TEAM_KEYS.includes(key) ? key : DEFAULT_TEAM
  root.style.setProperty('--team', team.primary)
  root.style.setProperty('--team-2', team.secondary)
  root.style.setProperty('--on-team', contrastOn(team.primary))
}

export async function init() {
    const key = await current()
    apply(key)
    return key
}