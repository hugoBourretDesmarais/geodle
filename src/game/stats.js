const KEY = 'geodle.stats'

const empty = () => ({ games: 0, guesses: 0, totalKm: 0, bestGameKm: null, bestGuessKm: null, perCapital: {} })

export function loadStats() {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return empty()
  }
}

export function recordGame(rounds) {
  const s = loadStats()
  const total = rounds.reduce((sum, r) => sum + r.distanceKm, 0)
  s.games += 1
  s.guesses += rounds.length
  s.totalKm += total
  s.bestGameKm = s.bestGameKm == null ? total : Math.min(s.bestGameKm, total)
  for (const r of rounds) {
    s.bestGuessKm = s.bestGuessKm == null ? r.distanceKm : Math.min(s.bestGuessKm, r.distanceKm)
    const pc = s.perCapital[r.capital.cca2] || { n: 0, km: 0 }
    pc.n += 1
    pc.km += r.distanceKm
    s.perCapital[r.capital.cca2] = pc
  }
  localStorage.setItem(KEY, JSON.stringify(s))
  return s
}

export function resetStats() {
  localStorage.removeItem(KEY)
  return empty()
}
