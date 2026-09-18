<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { capitals, featureFor, infoFor, world, loadDetailedWorld } from './game/world.js'

const GlobeView = defineAsyncComponent(() => import('./components/GlobeView.vue'))
import { distanceKm, distanceToFeature, featureCenter, formatKm, verdict, shuffle } from './game/geo.js'
import { loadStats, recordGame, resetStats } from './game/stats.js'
import { GRADES, loadCards, resetCards, grade as gradeCard, nextInterval, formatInterval, counts, nextDue, buildQueue, exportCards, importCards } from './game/srs.js'

const ROUNDS = 5
const REGIONS = ['All', 'Africa', 'Americas', 'Asia', 'Europe', 'Oceania']
const MODES = [
  { id: 'country', name: 'Countries' },
  { id: 'capital', name: 'Capitals' },
  { id: 'learn', name: 'Learn' },
  { id: 'explore', name: 'Explore' },
]
const POINT_COUNTRY_KM = 30
const BORDER_GRACE_KM = 8
const NEW_LIMITS = [5, 10, 20]

const screen = ref('start')
const mode = ref('country')
const region = ref('All')
const rounds = ref([])
const index = ref(0)
const pending = ref(null)
const revealed = ref(false)
const stats = ref(loadStats())
const globeRef = ref(null)

const query = ref('')
const selected = ref(null)

const cards = ref(loadCards())
const newLimit = ref(10)
const queue = ref([])
const current = ref(null)
const shown = ref(false)
const session = ref({ reviewed: 0, again: 0 })
const answer = ref('')
const answerCursor = ref(0)
const typed = ref(null)
const answerInput = ref(null)
const importInput = ref(null)
const importError = ref('')

const round = computed(() => rounds.value[index.value])
const totalKm = computed(() => rounds.value.reduce((s, r) => s + (r.distanceKm ?? 0), 0))
const pool = computed(() => (region.value === 'All' ? capitals : capitals.filter(c => c.region === region.value)))
const avgKm = computed(() => (stats.value.guesses ? stats.value.totalKm / stats.value.guesses : null))
const playing = computed(() => screen.value === 'play')
const exploring = computed(() => screen.value === 'explore')
const learning = computed(() => screen.value === 'learn')
const gameMode = computed(() => (mode.value === 'capital' ? 'capital' : 'country'))
const learnCounts = computed(() => counts(cards.value, pool.value))
const learnNextDue = computed(() => nextDue(cards.value, pool.value))
const currentFeature = computed(() => (world.value && current.value ? featureFor(current.value) : null))
const currentTiny = computed(() => !currentFeature.value || featureCenter(currentFeature.value).span < 1.5)
const correct = computed(() => typed.value != null && typed.value.ccn3 === current.value?.ccn3)
const suggestedGrade = computed(() => (typed.value == null ? null : correct.value ? 'good' : 'again'))

const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const answerHits = computed(() => {
  const q = norm(answer.value.trim())
  if (!q) return []
  const starts = capitals.filter(c => norm(c.country).startsWith(q))
  const rest = capitals.filter(c => !starts.includes(c) && norm(c.country).includes(q))
  return [...starts, ...rest].slice(0, 6)
})

const neighbourLabels = computed(() => {
  if (!learning.value || !current.value || !currentFeature.value) return []
  world.value
  const c = featureCenter(currentFeature.value)
  const size = Math.max(0.3, Math.min(1.2, c.span / 20))
  const cosLat = Math.cos((c.lat * Math.PI) / 180)
  return capitals
    .filter(k => k.ccn3 !== current.value.ccn3)
    .map(k => {
      const f = featureFor(k)
      if (!f) return null
      const kc = featureCenter(f)
      const dLat = kc.lat - c.lat, dLng = (((kc.lng - c.lng + 540) % 360) - 180) * cosLat
      return { lat: kc.lat, lng: kc.lng, text: k.country, size, d: Math.hypot(dLat, dLng) - kc.span / 2 }
    })
    .filter(Boolean)
    .sort((a, b) => a.d - b.d)
    .slice(0, 12)
})

const prompt = computed(() => (round.value ? (gameMode.value === 'capital' ? round.value.capital.capital : round.value.capital.country) : ''))

const pins = computed(() => {
  if (playing.value) {
    const list = []
    const guess = revealed.value ? round.value.guess : pending.value
    if (guess) list.push({ kind: 'guess', ...guess })
    if (revealed.value) list.push({ kind: 'target', lat: round.value.capital.lat, lng: round.value.capital.lng })
    return list
  }
  if (exploring.value && selected.value?.capital) return [{ kind: 'capital', lat: selected.value.lat, lng: selected.value.lng }]
  if (learning.value && current.value && (shown.value || currentTiny.value)) return [{ kind: 'capital', lat: current.value.lat, lng: current.value.lng }]
  return []
})

const arc = computed(() => {
  if (!playing.value || !revealed.value) return null
  const r = round.value
  const to = gameMode.value === 'capital' ? r.capital : r.nearest
  if (!to) return null
  return { startLat: r.guess.lat, startLng: r.guess.lng, endLat: to.lat, endLng: to.lng }
})

const highlightId = computed(() => {
  if (playing.value && revealed.value) return round.value.capital.ccn3
  if (exploring.value && selected.value) return selected.value.ccn3
  if (learning.value && current.value) return current.value.ccn3
  return null
})

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return capitals.filter(c => c.country.toLowerCase().includes(q) || c.capital.toLowerCase().includes(q)).slice(0, 8)
})

function focusCountry(cap, minAlt = 0.4) {
  const feature = featureFor(cap)
  if (feature) {
    const c = featureCenter(feature)
    globeRef.value?.flyTo(c.lat, c.lng, Math.min(2.2, Math.max(minAlt, c.span / 30)))
  } else {
    globeRef.value?.flyTo(cap.lat, cap.lng, 0.6)
  }
}

function showNext() {
  shown.value = false
  typed.value = null
  answer.value = ''
  answerCursor.value = 0
  current.value = queue.value.shift() || null
  nextTick(() => {
    if (current.value) {
      focusCountry(current.value, 0.25)
      answerInput.value?.focus()
    } else globeRef.value?.resetView()
  })
}

function submitAnswer(pick) {
  if (!learning.value || !current.value || shown.value) return
  const choice = pick || answerHits.value[answerCursor.value] || answerHits.value[0]
  if (!choice) return
  typed.value = choice
  shown.value = true
}

function moveCursor(delta) {
  const n = answerHits.value.length
  if (!n) return
  answerCursor.value = (answerCursor.value + delta + n) % n
}

function exportProgress() {
  const blob = new Blob([exportCards()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `geodle-flashcards-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function importProgress(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    cards.value = importCards(await file.text())
    importError.value = ''
  } catch (err) {
    importError.value = err.message
  }
}

function beginLearn() {
  cards.value = loadCards()
  queue.value = buildQueue(cards.value, pool.value, newLimit.value)
  session.value = { reviewed: 0, again: 0 }
  screen.value = 'learn'
  showNext()
}

function reveal() {
  if (!learning.value || !current.value || shown.value) return
  shown.value = true
}

function rate(g) {
  if (!learning.value || !current.value || !shown.value) return
  cards.value = gradeCard(cards.value, current.value.ccn3, g, typed.value?.country ?? null)
  session.value.reviewed += 1
  if (g === 'again') {
    session.value.again += 1
    queue.value.splice(Math.min(3, queue.value.length), 0, current.value)
  }
  showNext()
}

function wipeCards() {
  if (window.confirm('Forget all flashcard progress?')) {
    resetCards()
    cards.value = {}
  }
}

function begin() {
  if (mode.value === 'learn') return beginLearn()
  if (mode.value === 'explore') {
    screen.value = 'explore'
    selected.value = null
    query.value = ''
    globeRef.value?.resetView()
    return
  }
  rounds.value = shuffle(pool.value).slice(0, ROUNDS).map(capital => ({ capital, guess: null, distanceKm: null, nearest: null }))
  index.value = 0
  pending.value = null
  revealed.value = false
  screen.value = 'play'
  globeRef.value?.resetView()
}

function onPick(coords) {
  if (!playing.value || revealed.value) return
  pending.value = coords
}

function score(r) {
  if (gameMode.value === 'capital') return { km: distanceKm(r.guess, r.capital), nearest: r.capital }
  const feature = featureFor(r.capital)
  if (!feature) {
    const km = distanceKm(r.guess, r.capital)
    return km <= POINT_COUNTRY_KM ? { km: 0, nearest: null } : { km, nearest: r.capital }
  }
  const res = distanceToFeature(r.guess, feature)
  return res.km <= BORDER_GRACE_KM ? { km: 0, nearest: null } : res
}

async function confirm() {
  if (!pending.value || revealed.value) return
  await loadDetailedWorld()
  const r = round.value
  r.guess = pending.value
  const { km, nearest } = score(r)
  r.distanceKm = km
  r.nearest = nearest
  revealed.value = true
  if (km === 0) {
    const c = featureCenter(featureFor(r.capital) || { geometry: null })
    const center = Number.isFinite(c.span) ? c : { lat: r.capital.lat, lng: r.capital.lng, span: 4 }
    globeRef.value?.flyTo(center.lat, center.lng, Math.min(2.2, Math.max(0.5, center.span / 30)))
  } else {
    globeRef.value?.flyBetween(r.guess, nearest, km)
  }
}

function next() {
  if (!revealed.value) return
  if (index.value + 1 >= rounds.value.length) {
    stats.value = recordGame(rounds.value)
    screen.value = 'summary'
    globeRef.value?.resetView()
    return
  }
  index.value += 1
  pending.value = null
  revealed.value = false
  globeRef.value?.resetView()
}

function select(cap) {
  selected.value = cap
  query.value = ''
  focusCountry(cap)
}

function onCountry(feature) {
  if (!exploring.value) return
  select(infoFor(feature))
}

function onKey(e) {
  if (e.key === 'Escape' && exploring.value) {
    selected.value = null
    return
  }
  if (learning.value) {
    if (e.target.tagName === 'INPUT') return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (shown.value && suggestedGrade.value) rate(suggestedGrade.value)
      else reveal()
    }
    const g = GRADES.find(x => x.key === e.key)
    if (g) rate(g.id)
    return
  }
  if (e.target.tagName === 'INPUT') return
  if (e.key !== 'Enter' && e.key !== ' ') return
  if (!playing.value) return
  e.preventDefault()
  revealed.value ? next() : confirm()
}

function wipeStats() {
  if (window.confirm('Erase your local GeoDle stats?')) stats.value = resetStats()
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  loadDetailedWorld()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app">
    <GlobeView
      ref="globeRef"
      :pins="pins"
      :arc="arc"
      :highlight-id="highlightId"
      :interactive="playing && !revealed"
      :labels="exploring || learning"
      :hide-label-id="learning ? current?.ccn3 : null"
      :text-labels="neighbourLabels"
      @pick="onPick"
      @country="onCountry"
    />

    <header class="top">
      <a class="brand" href="./" @click.prevent="screen = 'start'">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>GeoDle</span>
      </a>
      <div v-if="playing" class="hud">
        <span class="hud-mode">{{ gameMode === 'capital' ? 'Capitals' : 'Countries' }}</span>
        <span class="hud-sep"></span>
        <span class="hud-label">Round</span>
        <span class="hud-value">{{ index + 1 }} / {{ rounds.length }}</span>
        <span class="hud-sep"></span>
        <span class="hud-label">Total</span>
        <span class="hud-value">{{ formatKm(totalKm) }}</span>
      </div>
      <button v-if="exploring" class="ghost small" @click="screen = 'start'">Done exploring</button>
      <div v-if="learning" class="hud">
        <span class="hud-mode">Learn</span>
        <span class="hud-sep"></span>
        <span class="hud-label">Left</span>
        <span class="hud-value">{{ queue.length + (current ? 1 : 0) }}</span>
        <span class="hud-sep"></span>
        <span class="hud-label">Done</span>
        <span class="hud-value">{{ session.reviewed }}</span>
        <span class="hud-sep"></span>
        <button class="linkish" @click="screen = 'start'">Stop</button>
      </div>
    </header>

    <section v-if="screen === 'start'" class="modal start">
      <h1>Where in the world is…</h1>
      <div class="modes">
        <button v-for="m in MODES" :key="m.id" class="mode" :class="{ on: mode === m.id }" @click="mode = m.id">
          <strong>{{ m.name }}</strong>
        </button>
      </div>
      <div v-if="mode !== 'explore'" class="chips">
        <button v-for="r in REGIONS" :key="r" class="chip" :class="{ on: region === r }" @click="region = r">
          {{ r }} <small>{{ r === 'All' ? capitals.length : capitals.filter(c => c.region === r).length }}</small>
        </button>
      </div>
      <div v-if="mode === 'learn'" class="learn-meta">
        <div class="learn-counts">
          <span><b>{{ learnCounts.due }}</b> due</span>
          <span><b>{{ learnCounts.fresh }}</b> unseen</span>
          <span><b>{{ learnCounts.learned }}</b> learned</span>
        </div>
        <div class="chips tight">
          <span class="chips-label">New per session</span>
          <button v-for="n in NEW_LIMITS" :key="n" class="chip" :class="{ on: newLimit === n }" @click="newLimit = n">{{ n }}</button>
        </div>
      </div>
      <button class="primary" @click="begin">{{ mode === 'explore' ? 'Explore the globe' : mode === 'learn' ? 'Review' : `Start · ${ROUNDS} rounds` }}</button>
      <div v-if="mode === 'learn'" class="row small-row">
        <button class="ghost small" @click="exportProgress">Export progress</button>
        <button class="ghost small" @click="importInput.click()">Import</button>
        <input ref="importInput" type="file" accept="application/json,.json" hidden @change="importProgress" />
        <button v-if="learnCounts.learned + learnCounts.due" class="ghost small" @click="wipeCards">Forget all</button>
      </div>
      <p v-if="importError" class="err">{{ importError }}</p>
      <dl v-if="stats.games" class="stats">
        <div><dt>Games</dt><dd>{{ stats.games }}</dd></div>
        <div><dt>Avg / guess</dt><dd>{{ formatKm(avgKm) }}</dd></div>
        <div><dt>Best game</dt><dd>{{ formatKm(stats.bestGameKm) }}</dd></div>
        <div><dt>Best pin</dt><dd>{{ formatKm(stats.bestGuessKm) }}</dd></div>
      </dl>
      <button v-if="stats.games" class="ghost" @click="wipeStats">Reset stats</button>
    </section>

    <template v-if="playing">
      <div class="prompt">
        <span class="prompt-label">{{ gameMode === 'capital' ? 'Find the capital' : 'Find the country' }}</span>
        <strong class="prompt-city">{{ prompt }}</strong>
      </div>

      <div class="bottom">
        <template v-if="!revealed">
          <button class="primary" :disabled="!pending" @click="confirm">
            {{ pending ? 'Guess' : 'Drop a pin on the globe' }}
          </button>
        </template>
        <div v-else class="result">
          <div class="result-km" :class="{ hit: round.distanceKm === 0 }">{{ round.distanceKm === 0 ? 'Inside!' : formatKm(round.distanceKm) }}</div>
          <div class="result-verdict">{{ round.distanceKm === 0 ? 'You landed in the country' : gameMode === 'country' ? `${verdict(round.distanceKm)} · measured to the nearest border` : verdict(round.distanceKm) }}</div>
          <div class="result-answer">
            <span class="dot target"></span>
            <template v-if="gameMode === 'capital'">{{ round.capital.capital }} is the capital of <b>{{ round.capital.country }}</b></template>
            <template v-else><b>{{ round.capital.country }}</b> · capital {{ round.capital.capital }}</template>
          </div>
          <button class="primary" @click="next">{{ index + 1 >= rounds.length ? 'See results' : 'Next round' }}</button>
        </div>
      </div>
    </template>

    <template v-if="exploring">
      <div class="search">
        <input v-model="query" type="search" placeholder="Search a country or capital…" autocomplete="off" spellcheck="false" />
        <ul v-if="results.length" class="hits">
          <li v-for="c in results" :key="c.ccn3">
            <button @click="select(c)"><b>{{ c.country }}</b><span>{{ c.capital }}</span></button>
          </li>
        </ul>
      </div>
      <div v-if="selected" class="card">
        <button class="close" aria-label="Close" @click="selected = null">×</button>
        <span class="card-region">{{ selected.subregion || selected.region || 'Territory' }}</span>
        <strong class="card-country">{{ selected.country }}</strong>
        <div v-if="selected.capital" class="card-capital"><span class="dot capital"></span>Capital: <b>{{ selected.capital }}</b></div>
        <div v-else class="card-capital muted">Not an independent state; not in the quiz pool.</div>
      </div>
      <p v-else class="hint">Hover a country for its name. Click one, or search, to see its capital.</p>
    </template>

    <template v-if="learning">
      <template v-if="current">
        <div class="prompt">
          <span class="prompt-label">Which country is lit up?</span>
          <strong v-if="shown" class="prompt-city" :class="{ ok: correct, bad: typed && !correct }">{{ current.country }}</strong>
          <strong v-else class="prompt-city muted">?</strong>
        </div>
        <div class="bottom">
          <div v-if="!shown" class="answer">
            <input
              ref="answerInput"
              v-model="answer"
              type="text"
              placeholder="Type the country…"
              autocomplete="off"
              spellcheck="false"
              @input="answerCursor = 0"
              @keydown.enter.prevent="submitAnswer()"
              @keydown.down.prevent="moveCursor(1)"
              @keydown.up.prevent="moveCursor(-1)"
            />
            <ul v-if="answerHits.length" class="hits">
              <li v-for="(c, i) in answerHits" :key="c.ccn3">
                <button :class="{ cur: i === answerCursor }" @mousedown.prevent="submitAnswer(c)">
                  <b>{{ c.country }}</b><span>{{ c.subregion || c.region }}</span>
                </button>
              </li>
            </ul>
            <button class="ghost small" @click="reveal">I don't know</button>
          </div>
          <div v-else class="result">
            <div v-if="typed" class="result-verdict" :class="{ ok: correct, bad: !correct }">
              {{ correct ? 'Correct' : `You said ${typed.country}` }}
            </div>
            <div class="result-answer"><span class="dot capital"></span>Capital <b>{{ current.capital }}</b> · {{ current.subregion || current.region }}</div>
            <div class="grades">
              <button v-for="g in GRADES" :key="g.id" class="grade" :class="[g.id, { suggested: g.id === suggestedGrade }]" @click="rate(g.id)">
                <span>{{ g.label }}</span><small>{{ formatInterval(nextInterval(cards[current.ccn3], g.id)) }}</small>
              </button>
            </div>
            <span class="keys">keys 1–4{{ suggestedGrade ? ' · Enter accepts the highlighted one' : '' }}</span>
          </div>
        </div>
      </template>
      <section v-else class="modal">
        <h1>{{ session.reviewed ? 'Session done' : 'Nothing due' }}</h1>
        <p class="lead">
          <template v-if="session.reviewed">{{ session.reviewed }} cards reviewed, {{ session.again }} sent back. </template>
          <template v-if="learnNextDue">Next card due {{ formatInterval(learnNextDue - Date.now()) }} from now.</template>
          <template v-else-if="learnCounts.fresh">{{ learnCounts.fresh }} countries still unseen.</template>
        </p>
        <div class="row">
          <button v-if="learnCounts.fresh" class="primary" @click="beginLearn">Learn {{ Math.min(newLimit, learnCounts.fresh) }} new</button>
          <button class="ghost" @click="screen = 'start'">Back</button>
        </div>
      </section>
    </template>

    <section v-if="screen === 'summary'" class="modal summary">
      <h1>{{ formatKm(totalKm) }}</h1>
      <p class="lead">{{ gameMode === 'capital' ? 'Capitals' : 'Countries' }} · total over {{ rounds.length }} rounds · {{ formatKm(totalKm / rounds.length) }} per pin</p>
      <ol class="breakdown">
        <li v-for="r in rounds" :key="r.capital.cca2">
          <span class="bd-city" v-if="gameMode === 'capital'">{{ r.capital.capital }}<small>{{ r.capital.country }}</small></span>
          <span class="bd-city" v-else>{{ r.capital.country }}<small>{{ r.capital.capital }}</small></span>
          <span class="bd-km" :class="{ good: r.distanceKm < 500 }">{{ r.distanceKm === 0 ? 'Inside' : formatKm(r.distanceKm) }}</span>
        </li>
      </ol>
      <div class="row">
        <button class="primary" @click="begin">Play again</button>
        <button class="ghost" @click="screen = 'start'">Change mode</button>
      </div>
    </section>

    <footer class="foot">
      <a href="https://hugobourretdesmarais.github.io/">🏠 Home</a>
      · also play <a href="https://hugobourretdesmarais.github.io/onepiecedle/">OnePieceDle</a>,
      <a href="https://hugobourretdesmarais.github.io/avatardle/">AvatarDle</a> and
      <a href="https://hugobourretdesmarais.github.io/chdle/">CHdle</a>
    </footer>
  </div>
</template>

<style scoped>
.app { position: relative; height: 100%; }
.top { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; pointer-events: none; }
.top > * { pointer-events: auto; }
.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); font-family: var(--font-display); font-weight: 800; font-size: 22px; letter-spacing: .5px; }
.hud { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 999px; background: var(--panel); border: 1px solid var(--panel-border); backdrop-filter: blur(8px); font-size: 14px; }
.hud-mode { font-family: var(--font-display); font-weight: 700; color: var(--accent-2); }
.hud-label { color: var(--muted); }
.hud-value { font-family: var(--font-display); font-weight: 700; font-variant-numeric: tabular-nums; }
.hud-sep { width: 1px; height: 16px; background: var(--panel-border); }
.linkish { border: 0; background: transparent; color: var(--muted); font-weight: 600; padding: 0; }
.linkish:hover { color: var(--text); }
.prompt-city.muted { color: var(--muted); }
.learn-meta { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.learn-counts { display: flex; gap: 18px; color: var(--muted); font-size: 14px; }
.learn-counts b { color: var(--text); font-family: var(--font-display); font-size: 16px; }
.chips.tight { gap: 6px; }
.chips-label { align-self: center; color: var(--muted); font-size: 13px; margin-right: 4px; }
.grades { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: 100%; margin-top: 6px; }
.grade { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 6px; border-radius: 12px; border: 1px solid var(--panel-border); background: rgba(255, 255, 255, .05); color: var(--text); font-weight: 700; font-family: var(--font-display); }
.grade small { font-family: var(--font-body); font-weight: 500; color: var(--muted); font-size: 12px; }
.grade:hover { border-color: rgba(255, 255, 255, .3); }
.grade.again { color: #ff7b7b; } .grade.hard { color: #ffb35c; } .grade.good { color: var(--accent-2); } .grade.easy { color: #4f9cff; }
.keys { margin-top: 6px; color: var(--muted); font-size: 12px; }
.grade.suggested { border-color: currentColor; background: rgba(255, 255, 255, .1); box-shadow: 0 0 0 1px currentColor inset; }
.prompt-city.ok, .result-verdict.ok { color: var(--good); }
.prompt-city.bad, .result-verdict.bad { color: #ff7b7b; }
.answer { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.answer input { width: 100%; padding: 14px 20px; border-radius: 999px; border: 1px solid var(--panel-border); background: var(--panel); color: var(--text); font: inherit; font-size: 17px; backdrop-filter: blur(8px); outline: none; text-align: center; }
.answer input:focus { border-color: var(--accent-2); }
.answer .hits { width: 100%; margin: 0; }
.hits button.cur { background: rgba(124, 242, 196, .16); }
.small-row { gap: 8px; }
.err { margin: 0; color: #ff7b7b; font-size: 13px; }

.prompt { position: absolute; top: 70px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 28px; border-radius: 16px; background: var(--panel); border: 1px solid var(--panel-border); backdrop-filter: blur(8px); box-shadow: 0 12px 30px rgba(0, 0, 0, .35); pointer-events: none; max-width: 92vw; }
.prompt-label { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: var(--muted); }
.prompt-city { font-family: var(--font-display); font-size: clamp(26px, 5vw, 40px); font-weight: 800; text-align: center; }

.bottom { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%); display: flex; justify-content: center; width: min(92vw, 460px); }
.primary { padding: 14px 32px; border: 0; border-radius: 999px; font-family: var(--font-display); font-weight: 700; font-size: 17px; color: #14110f; background: linear-gradient(135deg, #ffb35c, var(--accent)); box-shadow: 0 10px 26px rgba(255, 107, 53, .35); transition: transform .12s, box-shadow .12s, opacity .12s; }
.primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(255, 107, 53, .45); }
.primary:disabled { opacity: .55; cursor: default; box-shadow: none; }
.ghost { padding: 12px 22px; border-radius: 999px; border: 1px solid var(--panel-border); background: var(--panel); color: var(--muted); font-weight: 600; }
.ghost:hover { color: var(--text); border-color: rgba(255, 255, 255, .25); }
.ghost.small { padding: 8px 16px; font-size: 14px; }

.result { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 22px 20px; border-radius: 20px; background: var(--panel); border: 1px solid var(--panel-border); backdrop-filter: blur(10px); box-shadow: 0 16px 40px rgba(0, 0, 0, .45); animation: rise .3s ease-out; }
.result-km { font-family: var(--font-display); font-size: 44px; font-weight: 800; color: var(--accent-2); line-height: 1; }
.result-km.hit { color: var(--good); }
.result-verdict { color: var(--muted); font-weight: 600; text-align: center; }
.result-answer { margin: 6px 0 10px; text-align: center; font-size: 15px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; vertical-align: 1px; }
.dot.target { background: var(--good); }
.dot.capital { background: #4f9cff; }
@keyframes rise { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }

.modal { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(92vw, 560px); max-height: calc(100vh - 140px); overflow: auto; padding: 30px 30px 26px; border-radius: 24px; background: var(--panel); border: 1px solid var(--panel-border); backdrop-filter: blur(14px); box-shadow: 0 24px 60px rgba(0, 0, 0, .55); text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.modal h1 { margin: 0; font-family: var(--font-display); font-size: clamp(30px, 6vw, 44px); font-weight: 800; letter-spacing: -.5px; }
.lead { margin: 0; color: var(--muted); line-height: 1.5; max-width: 42ch; }
.modes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; width: 100%; }
.mode { display: flex; justify-content: center; padding: 14px 10px; border-radius: 14px; border: 1px solid var(--panel-border); background: rgba(255, 255, 255, .04); color: var(--text); transition: border-color .12s, background .12s; }
.mode strong { font-family: var(--font-display); font-size: 17px; }
.mode:hover { border-color: rgba(255, 255, 255, .25); }
.mode.on { background: rgba(124, 242, 196, .12); border-color: var(--accent-2); }
.mode.on strong { color: var(--accent-2); }
.chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 2px 0; }
.chip { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--panel-border); background: rgba(255, 255, 255, .04); color: var(--text); font-weight: 600; font-size: 14px; }
.chip small { color: var(--muted); margin-left: 4px; font-weight: 500; }
.chip.on { background: var(--accent-2); color: #08261c; border-color: transparent; }
.chip.on small { color: #08261c; opacity: .7; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; width: 100%; margin: 8px 0 0; }
.stats div { padding: 10px 6px; border-radius: 12px; background: rgba(255, 255, 255, .04); }
.stats dt { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); }
.stats dd { margin: 4px 0 0; font-family: var(--font-display); font-weight: 700; font-size: 16px; }
.breakdown { list-style: none; margin: 0; padding: 0; width: 100%; display: flex; flex-direction: column; gap: 6px; }
.breakdown li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-radius: 12px; background: rgba(255, 255, 255, .04); text-align: left; }
.bd-city { display: flex; flex-direction: column; font-weight: 600; }
.bd-city small { color: var(--muted); font-weight: 500; font-size: 12.5px; }
.bd-km { font-family: var(--font-display); font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
.bd-km.good { color: var(--good); }
.row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }

.search { position: absolute; top: 70px; left: 50%; transform: translateX(-50%); width: min(92vw, 420px); }
.search input { width: 100%; padding: 12px 18px; border-radius: 999px; border: 1px solid var(--panel-border); background: var(--panel); color: var(--text); font: inherit; font-size: 16px; backdrop-filter: blur(8px); outline: none; }
.search input:focus { border-color: var(--accent-2); }
.hits { list-style: none; margin: 8px 0 0; padding: 6px; border-radius: 16px; background: var(--panel); border: 1px solid var(--panel-border); backdrop-filter: blur(10px); box-shadow: 0 16px 40px rgba(0, 0, 0, .45); }
.hits button { width: 100%; display: flex; justify-content: space-between; gap: 12px; padding: 10px 14px; border: 0; border-radius: 10px; background: transparent; color: var(--text); text-align: left; }
.hits button:hover { background: rgba(255, 255, 255, .07); }
.hits span { color: var(--muted); }
.card { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%); width: min(92vw, 380px); display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 18px 24px 20px; border-radius: 20px; background: var(--panel); border: 1px solid var(--panel-border); backdrop-filter: blur(10px); box-shadow: 0 16px 40px rgba(0, 0, 0, .45); animation: rise .3s ease-out; }
.card .close { position: absolute; top: 8px; right: 12px; border: 0; background: transparent; color: var(--muted); font-size: 22px; line-height: 1; }
.card-region { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: var(--muted); }
.card-country { font-family: var(--font-display); font-size: 30px; font-weight: 800; text-align: center; }
.card-capital { font-size: 15px; }
.card-capital.muted { color: var(--muted); font-size: 13.5px; }
.hint { position: absolute; left: 50%; bottom: 60px; transform: translateX(-50%); margin: 0; padding: 10px 18px; border-radius: 999px; background: var(--panel); border: 1px solid var(--panel-border); color: var(--muted); font-size: 14px; text-align: center; pointer-events: none; max-width: 92vw; }

.foot { position: absolute; left: 0; right: 0; bottom: 12px; text-align: center; font-size: 12.5px; color: var(--muted); pointer-events: none; }
.foot a { pointer-events: auto; color: var(--muted); text-decoration: underline dotted; }
.foot a:hover { color: var(--text); }

@media (max-width: 600px) {
  .prompt { top: 64px; padding: 10px 18px; }
  .bottom, .card { bottom: 48px; }
  .modes { grid-template-columns: repeat(2, 1fr); }
  .grades { grid-template-columns: repeat(2, 1fr); }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .hud { font-size: 13px; padding: 6px 10px; }
  .hud-mode { display: none; }
}
</style>
