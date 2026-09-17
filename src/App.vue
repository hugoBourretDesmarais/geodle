<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import GlobeView from './components/GlobeView.vue'
import capitals from './data/capitals.json'
import { distanceKm, formatKm, verdict, shuffle } from './game/geo.js'
import { loadStats, recordGame, resetStats } from './game/stats.js'

const ROUNDS = 5
const REGIONS = ['All', 'Africa', 'Americas', 'Asia', 'Europe', 'Oceania']

const screen = ref('start')
const region = ref('All')
const rounds = ref([])
const index = ref(0)
const pending = ref(null)
const revealed = ref(false)
const stats = ref(loadStats())
const globeRef = ref(null)

const round = computed(() => rounds.value[index.value])
const totalKm = computed(() => rounds.value.reduce((s, r) => s + (r.distanceKm ?? 0), 0))
const pool = computed(() => (region.value === 'All' ? capitals : capitals.filter(c => c.region === region.value)))
const avgKm = computed(() => (stats.value.guesses ? stats.value.totalKm / stats.value.guesses : null))

function start() {
  rounds.value = shuffle(pool.value).slice(0, ROUNDS).map(capital => ({ capital, guess: null, distanceKm: null }))
  index.value = 0
  pending.value = null
  revealed.value = false
  screen.value = 'play'
  globeRef.value?.resetView()
}

function onPick(coords) {
  if (revealed.value) return
  pending.value = coords
}

function confirm() {
  if (!pending.value || revealed.value) return
  const r = round.value
  r.guess = pending.value
  r.distanceKm = distanceKm(r.guess, r.capital)
  revealed.value = true
  globeRef.value?.flyToReveal(r.distanceKm)
}

function next() {
  if (!revealed.value) return
  if (index.value + 1 >= rounds.value.length) {
    stats.value = recordGame(rounds.value)
    screen.value = 'summary'
    return
  }
  index.value += 1
  pending.value = null
  revealed.value = false
  globeRef.value?.resetView()
}

function onKey(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return
  if (screen.value !== 'play') return
  e.preventDefault()
  revealed.value ? next() : confirm()
}

function wipeStats() {
  if (window.confirm('Erase your local GeoDle stats?')) stats.value = resetStats()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app">
    <GlobeView
      ref="globeRef"
      :guess="screen === 'play' ? (revealed ? round.guess : pending) : null"
      :target="screen === 'play' ? round.capital : null"
      :revealed="screen === 'play' && revealed"
      :interactive="screen === 'play' && !revealed"
      @pick="onPick"
    />

    <header class="top">
      <a class="brand" href="./" @click.prevent="screen = 'start'">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>GeoDle</span>
      </a>
      <div v-if="screen === 'play'" class="hud">
        <span class="hud-label">Round</span>
        <span class="hud-value">{{ index + 1 }} / {{ rounds.length }}</span>
        <span class="hud-sep"></span>
        <span class="hud-label">Total</span>
        <span class="hud-value">{{ formatKm(totalKm) }}</span>
      </div>
    </header>

    <section v-if="screen === 'start'" class="modal start">
      <h1>Where in the world is…</h1>
      <p class="lead">Read the capital, spin the globe, drop a pin. The closer you land, the fewer kilometres you rack up over {{ ROUNDS }} rounds.</p>
      <div class="chips">
        <button v-for="r in REGIONS" :key="r" class="chip" :class="{ on: region === r }" @click="region = r">
          {{ r }} <small>{{ r === 'All' ? capitals.length : capitals.filter(c => c.region === r).length }}</small>
        </button>
      </div>
      <button class="primary" @click="start">Start</button>
      <dl v-if="stats.games" class="stats">
        <div><dt>Games</dt><dd>{{ stats.games }}</dd></div>
        <div><dt>Avg / guess</dt><dd>{{ formatKm(avgKm) }}</dd></div>
        <div><dt>Best game</dt><dd>{{ formatKm(stats.bestGameKm) }}</dd></div>
        <div><dt>Best pin</dt><dd>{{ formatKm(stats.bestGuessKm) }}</dd></div>
      </dl>
      <button v-if="stats.games" class="ghost" @click="wipeStats">Reset stats</button>
    </section>

    <template v-if="screen === 'play'">
      <div class="prompt">
        <span class="prompt-label">Find the capital</span>
        <strong class="prompt-city">{{ round.capital.capital }}</strong>
      </div>

      <div class="bottom">
        <template v-if="!revealed">
          <button class="primary" :disabled="!pending" @click="confirm">
            {{ pending ? 'Guess' : 'Drop a pin on the globe' }}
          </button>
        </template>
        <div v-else class="result">
          <div class="result-km">{{ formatKm(round.distanceKm) }}</div>
          <div class="result-verdict">{{ verdict(round.distanceKm) }}</div>
          <div class="result-answer">
            <span class="dot target"></span>{{ round.capital.capital }} is the capital of <b>{{ round.capital.country }}</b>
          </div>
          <button class="primary" @click="next">{{ index + 1 >= rounds.length ? 'See results' : 'Next round' }}</button>
        </div>
      </div>
    </template>

    <section v-if="screen === 'summary'" class="modal summary">
      <h1>{{ formatKm(totalKm) }}</h1>
      <p class="lead">total over {{ rounds.length }} rounds · {{ formatKm(totalKm / rounds.length) }} per pin</p>
      <ol class="breakdown">
        <li v-for="r in rounds" :key="r.capital.cca2">
          <span class="bd-city">{{ r.capital.capital }}<small>{{ r.capital.country }}</small></span>
          <span class="bd-km" :class="{ good: r.distanceKm < 500 }">{{ formatKm(r.distanceKm) }}</span>
        </li>
      </ol>
      <div class="row">
        <button class="primary" @click="start">Play again</button>
        <button class="ghost" @click="screen = 'start'">Change region</button>
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
.hud-label { color: var(--muted); }
.hud-value { font-family: var(--font-display); font-weight: 700; font-variant-numeric: tabular-nums; }
.hud-sep { width: 1px; height: 16px; background: var(--panel-border); }

.prompt { position: absolute; top: 70px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 28px; border-radius: 16px; background: var(--panel); border: 1px solid var(--panel-border); backdrop-filter: blur(8px); box-shadow: 0 12px 30px rgba(0, 0, 0, .35); pointer-events: none; }
.prompt-label { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: var(--muted); }
.prompt-city { font-family: var(--font-display); font-size: clamp(26px, 5vw, 40px); font-weight: 800; }

.bottom { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%); display: flex; justify-content: center; width: min(92vw, 460px); }
.primary { padding: 14px 32px; border: 0; border-radius: 999px; font-family: var(--font-display); font-weight: 700; font-size: 17px; color: #14110f; background: linear-gradient(135deg, #ffb35c, var(--accent)); box-shadow: 0 10px 26px rgba(255, 107, 53, .35); transition: transform .12s, box-shadow .12s, opacity .12s; }
.primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(255, 107, 53, .45); }
.primary:disabled { opacity: .55; cursor: default; box-shadow: none; }
.ghost { padding: 12px 22px; border-radius: 999px; border: 1px solid var(--panel-border); background: transparent; color: var(--muted); font-weight: 600; }
.ghost:hover { color: var(--text); border-color: rgba(255, 255, 255, .25); }

.result { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 22px 20px; border-radius: 20px; background: var(--panel); border: 1px solid var(--panel-border); backdrop-filter: blur(10px); box-shadow: 0 16px 40px rgba(0, 0, 0, .45); animation: rise .3s ease-out; }
.result-km { font-family: var(--font-display); font-size: 44px; font-weight: 800; color: var(--accent-2); line-height: 1; }
.result-verdict { color: var(--muted); font-weight: 600; }
.result-answer { margin: 6px 0 10px; text-align: center; font-size: 15px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; vertical-align: 1px; }
.dot.target { background: var(--good); }
@keyframes rise { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }

.modal { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(92vw, 520px); max-height: calc(100vh - 140px); overflow: auto; padding: 32px 30px 28px; border-radius: 24px; background: var(--panel); border: 1px solid var(--panel-border); backdrop-filter: blur(14px); box-shadow: 0 24px 60px rgba(0, 0, 0, .55); text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.modal h1 { margin: 0; font-family: var(--font-display); font-size: clamp(30px, 6vw, 44px); font-weight: 800; letter-spacing: -.5px; }
.lead { margin: 0; color: var(--muted); line-height: 1.5; max-width: 42ch; }
.chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 4px 0 6px; }
.chip { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--panel-border); background: rgba(255, 255, 255, .04); color: var(--text); font-weight: 600; font-size: 14px; }
.chip small { color: var(--muted); margin-left: 4px; font-weight: 500; }
.chip.on { background: var(--accent-2); color: #08261c; border-color: transparent; }
.chip.on small { color: #08261c; opacity: .7; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; width: 100%; margin: 10px 0 0; }
.stats div { padding: 10px 6px; border-radius: 12px; background: rgba(255, 255, 255, .04); }
.stats dt { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); }
.stats dd { margin: 4px 0 0; font-family: var(--font-display); font-weight: 700; font-size: 16px; }
.breakdown { list-style: none; margin: 0; padding: 0; width: 100%; display: flex; flex-direction: column; gap: 6px; counter-reset: r; }
.breakdown li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-radius: 12px; background: rgba(255, 255, 255, .04); text-align: left; }
.bd-city { display: flex; flex-direction: column; font-weight: 600; }
.bd-city small { color: var(--muted); font-weight: 500; font-size: 12.5px; }
.bd-km { font-family: var(--font-display); font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
.bd-km.good { color: var(--good); }
.row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }

.foot { position: absolute; left: 0; right: 0; bottom: 12px; text-align: center; font-size: 12.5px; color: var(--muted); pointer-events: none; }
.foot a { pointer-events: auto; color: var(--muted); text-decoration: underline dotted; }
.foot a:hover { color: var(--text); }

@media (max-width: 600px) {
  .prompt { top: 64px; padding: 10px 18px; }
  .bottom { bottom: 48px; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .hud { font-size: 13px; padding: 6px 10px; }
}
</style>
