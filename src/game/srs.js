const KEY = 'geodle.srs'
const DAY = 86_400_000
const MINUTE = 60_000

export const GRADES = [
  { id: 'again', label: 'Again', key: '1' },
  { id: 'hard', label: 'Hard', key: '2' },
  { id: 'good', label: 'Good', key: '3' },
  { id: 'easy', label: 'Easy', key: '4' },
]

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

function save(cards) {
  localStorage.setItem(KEY, JSON.stringify(cards))
}

export function loadCards() {
  return load()
}

export function resetCards() {
  localStorage.removeItem(KEY)
}

function fresh() {
  return { ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0 }
}

// Returns the next interval in ms for a card and grade, SM-2 with a short learning step.
export function nextInterval(card, grade) {
  const c = card || fresh()
  if (grade === 'again') return 10 * MINUTE
  if (c.reps === 0 || c.interval < DAY) {
    return { hard: 12 * 60 * MINUTE, good: DAY, easy: 4 * DAY }[grade]
  }
  const mult = { hard: 1.2, good: c.ease, easy: c.ease * 1.3 }[grade]
  return Math.round(c.interval * mult)
}

export function grade(cards, id, g, now = Date.now()) {
  const c = { ...(cards[id] || fresh()) }
  const interval = nextInterval(c, g)
  if (g === 'again') {
    c.lapses += c.reps > 0 ? 1 : 0
    c.ease = Math.max(1.3, c.ease - 0.2)
  } else {
    if (g === 'hard') c.ease = Math.max(1.3, c.ease - 0.15)
    if (g === 'easy') c.ease += 0.15
    c.reps += 1
  }
  c.interval = interval
  c.due = now + interval
  c.last = now
  const next = { ...cards, [id]: c }
  save(next)
  return next
}

export function formatInterval(ms) {
  if (ms < 60 * MINUTE) return `${Math.round(ms / MINUTE)}m`
  if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))}h`
  const d = ms / DAY
  if (d < 30) return `${Math.round(d)}d`
  if (d < 365) return `${Math.round(d / 30)}mo`
  return `${(d / 365).toFixed(1)}y`
}

export function counts(cards, pool, now = Date.now()) {
  let due = 0, learned = 0, fresh = 0
  for (const c of pool) {
    const card = cards[c.ccn3]
    if (!card) fresh += 1
    else {
      if (card.due <= now) due += 1
      if (card.interval >= DAY) learned += 1
    }
  }
  return { due, fresh, learned }
}

export function nextDue(cards, pool, now = Date.now()) {
  let soonest = null
  for (const c of pool) {
    const card = cards[c.ccn3]
    if (card && card.due > now && (soonest == null || card.due < soonest)) soonest = card.due
  }
  return soonest
}

// Due cards first (oldest due first), then unseen ones largest-first, capped at newLimit.
export function buildQueue(cards, pool, newLimit, now = Date.now()) {
  const due = pool.filter(c => cards[c.ccn3] && cards[c.ccn3].due <= now).sort((a, b) => cards[a.ccn3].due - cards[b.ccn3].due)
  const unseen = pool.filter(c => !cards[c.ccn3]).sort((a, b) => b.area - a.area).slice(0, newLimit)
  return [...due, ...unseen]
}
