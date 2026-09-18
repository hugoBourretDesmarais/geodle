<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import Globe from 'globe.gl'
import { world, infoFor } from '../game/world.js'
import { midpoint, hitTest } from '../game/geo.js'
import { CountryLayer } from '../game/countryLayer.js'

const props = defineProps({
  pins: { type: Array, default: () => [] },
  arc: { type: Object, default: null },
  highlightId: { type: String, default: null },
  interactive: { type: Boolean, default: true },
  labels: { type: Boolean, default: false },
  hideLabelId: { type: String, default: null },
  textLabels: { type: Array, default: () => [] },
})
const emit = defineEmits(['pick', 'country'])

const el = ref(null)
const canvasEl = ref(null)
const tip = ref(null)
const pointer = ref(null)
let globe = null
let layer = null
let hovered = null
let hoverQueued = false

const HOME = { lat: 25, lng: 10, altitude: 2.3 }
const OCEAN = '#0c2340'
const LAND = '#2c6e55'
const LAND_HOVER = '#3d8a6b'
const LAND_HIT = '#ffb35c'
const BORDER = '#08122a'
const PIN_SVG = `<svg viewBox="0 0 32 44" width="32" height="44"><path d="M16 1C8 1 2 7 2 15c0 10 14 28 14 28s14-18 14-28C30 7 24 1 16 1z"/><circle cx="16" cy="15" r="5.5"/></svg>`

function htmlElement(d) {
  const wrap = document.createElement('div')
  if (d.text != null) {
    wrap.className = 'glabel'
    wrap.style.fontSize = `${Math.round(11 + d.size * 5)}px`
    wrap.textContent = d.text
  } else {
    wrap.className = `pin ${d.kind}`
    wrap.innerHTML = PIN_SVG
  }
  return wrap
}

function repaint() {
  if (!layer) return
  const map = new Map()
  if (hovered && hovered.id !== props.highlightId) map.set(hovered.id, LAND_HOVER)
  if (props.highlightId) map.set(props.highlightId, LAND_HIT)
  layer.paint(map)
}

function setHovered(f) {
  if (f === hovered) return
  hovered = f
  repaint()
  if (f && props.labels && f.id !== props.hideLabelId) {
    const info = infoFor(f)
    tip.value = { country: info.country, capital: info.capital }
  } else tip.value = null
}

function countryAt(x, y) {
  const coords = globe?.toGlobeCoords(x, y)
  return coords ? { coords, feature: hitTest(world.value.countries, coords) } : { coords: null, feature: null }
}

function onPointerMove(e) {
  if (e.pointerType === 'touch') return
  const rect = el.value.getBoundingClientRect()
  pointer.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  if (hoverQueued) return
  hoverQueued = true
  setTimeout(() => {
    hoverQueued = false
    if (!pointer.value || !globe) return
    setHovered(countryAt(pointer.value.x, pointer.value.y).feature)
  }, 32)
}

function onPointerLeave() {
  pointer.value = null
  setHovered(null)
}

function onGlobeClick(coords, event) {
  const feature = hitTest(world.value.countries, coords)
  if (feature) emit('country', feature, coords)
  if (props.interactive) emit('pick', { lat: coords.lat, lng: coords.lng })
}

function sync() {
  if (!globe) return
  globe.htmlElementsData([...props.pins.map(p => ({ ...p })), ...props.textLabels.map(l => ({ ...l }))])
  globe.arcsData(props.arc ? [{ ...props.arc }] : [])
  repaint()
}

function flyBetween(a, b, distanceKm) {
  const mid = midpoint(a, b)
  globe?.pointOfView({ ...mid, altitude: Math.min(2.6, Math.max(0.45, distanceKm / 5500)) }, 1100)
}

function flyTo(lat, lng, altitude = 1) {
  globe?.pointOfView({ lat, lng, altitude }, 1000)
}

function resize() {
  if (!globe || !el.value) return
  globe.width(el.value.clientWidth).height(el.value.clientHeight)
}

onMounted(() => {
  const dpr = window.devicePixelRatio || 1
  const lowEnd = (navigator.hardwareConcurrency || 4) <= 4 || dpr >= 2.5
  globe = Globe({ animateIn: false, rendererConfig: { antialias: true, alpha: true, powerPreference: 'high-performance' } })(canvasEl.value)
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor('#4f9cff')
    .atmosphereAltitude(0.16)
    .onGlobeClick(onGlobeClick)
    .htmlElementsData([])
    .htmlElement(htmlElement)
    .htmlAltitude(0.018)
    .htmlTransitionDuration(0)
    .arcsData([])
    .arcColor(() => ['#ff6b35', '#7cf2c4'])
    .arcStroke(0.55)
    .arcAltitudeAutoScale(0.35)
    .arcDashLength(0.6)
    .arcDashGap(0.25)
    .arcDashAnimateTime(1400)
    .arcsTransitionDuration(0)

  globe.renderer().setPixelRatio(Math.min(dpr, lowEnd ? 1.75 : 2))
  globe.globeMaterial().color.set(OCEAN)
  globe.globeMaterial().emissive.set('#05101f')
  globe.globeMaterial().shininess = 12

  layer = new CountryLayer(globe.scene(), { land: LAND, border: BORDER, resolution: lowEnd ? 10 : 8 })
  layer.setFeatures(world.value.countries)

  const controls = globe.controls()
  controls.autoRotate = false
  controls.enablePan = false
  controls.minDistance = 115
  controls.maxDistance = 520
  controls.zoomSpeed = 0.7
  controls.rotateSpeed = 0.6

  el.value.addEventListener('pointermove', onPointerMove)
  el.value.addEventListener('pointerleave', onPointerLeave)

  globe.pointOfView(HOME, 0)
  if (import.meta.env.DEV) window.__geodle = { globe, layer, pov: () => globe.pointOfView(), detailed: () => world.value.detailed }
  resize()
  window.addEventListener('resize', resize)
  sync()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  layer?.destroy()
  layer = null
  globe?._destructor?.()
  globe = null
})

watch(world, w => {
  hovered = null
  layer?.setFeatures(w.countries)
})
watch(() => [props.pins, props.arc, props.highlightId, props.textLabels], sync, { deep: true })
watch(() => [props.labels, props.hideLabelId], () => setHovered(null))

defineExpose({ flyBetween, flyTo, resetView: () => globe?.pointOfView(HOME, 900) })
</script>

<template>
  <div ref="el" class="globe" :class="{ locked: !interactive }">
    <div ref="canvasEl" class="globe-canvas"></div>
    <div v-if="tip && pointer" class="tip" :style="{ left: pointer.x + 14 + 'px', top: pointer.y + 14 + 'px' }">
      <b>{{ tip.country }}</b><span v-if="tip.capital">{{ tip.capital }}</span>
    </div>
  </div>
</template>

<style>
.globe { position: absolute; inset: 0; z-index: 0; }
.globe-canvas { position: absolute; inset: 0; }
.globe canvas { display: block; cursor: crosshair; }
.globe.locked canvas { cursor: grab; }
.tip { position: absolute; z-index: 3; display: flex; flex-direction: column; padding: 8px 12px; border-radius: 10px; background: rgba(13, 20, 38, .92); border: 1px solid rgba(255, 255, 255, .1); color: #eef2ff; font-size: 14px; line-height: 1.3; box-shadow: 0 8px 20px rgba(0, 0, 0, .4); pointer-events: none; white-space: nowrap; }
.tip span { color: #9aa5c4; font-size: 12.5px; }
.pin { width: 32px; height: 44px; transform: translateY(-50%); pointer-events: none; filter: drop-shadow(0 6px 10px rgba(0, 0, 0, .55)); }
.pin svg path { stroke: #fff; stroke-width: 2; }
.pin svg circle { fill: #fff; }
.pin.guess svg path { fill: #ff6b35; }
.pin.target svg path { fill: #22c55e; }
.pin.capital svg path { fill: #4f9cff; }
.pin.guess { animation: drop .35s cubic-bezier(.2, .9, .3, 1.3); }
@keyframes drop { from { transform: translateY(-90%); opacity: 0; } to { transform: translateY(-50%); opacity: 1; } }
.glabel { transform: translate(-50%, -50%); pointer-events: none; white-space: nowrap; font-family: var(--font-body); font-weight: 600; color: rgba(255, 255, 255, .9); text-shadow: 0 1px 2px rgba(0, 0, 0, .9), 0 0 6px rgba(0, 0, 0, .7); letter-spacing: .2px; }
</style>
