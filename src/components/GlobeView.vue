<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import Globe from 'globe.gl'
import { countries, infoFor } from '../game/world.js'
import { midpoint } from '../game/geo.js'

const props = defineProps({
  pins: { type: Array, default: () => [] },
  arc: { type: Object, default: null },
  highlightId: { type: String, default: null },
  interactive: { type: Boolean, default: true },
  labels: { type: Boolean, default: false },
})
const emit = defineEmits(['pick', 'country'])

const el = ref(null)
let globe = null
let hovered = null

const HOME = { lat: 25, lng: 10, altitude: 2.3 }
const OCEAN = '#0c2340'
const LAND = '#2c6e55'
const LAND_HOVER = '#3d8a6b'
const LAND_HIT = '#ffb35c'
const BORDER = 'rgba(8, 18, 34, 0.9)'

function pinElement(d) {
  const wrap = document.createElement('div')
  wrap.className = `pin ${d.kind}`
  wrap.innerHTML = `<svg viewBox="0 0 32 44" width="32" height="44"><path d="M16 1C8 1 2 7 2 15c0 10 14 28 14 28s14-18 14-28C30 7 24 1 16 1z"/><circle cx="16" cy="15" r="5.5"/></svg>`
  return wrap
}

function capColor(d) {
  if (d.id === props.highlightId) return LAND_HIT
  return d === hovered ? LAND_HOVER : LAND
}

function altitude(d) {
  return d.id === props.highlightId ? 0.016 : d === hovered ? 0.011 : 0.006
}

function refreshPolygons() {
  globe?.polygonCapColor(capColor).polygonAltitude(altitude)
}

function label(d) {
  if (!props.labels) return ''
  const info = infoFor(d)
  return `<div class="tip"><b>${info.country}</b>${info.capital ? `<span>${info.capital}</span>` : ''}</div>`
}

function sync() {
  if (!globe) return
  globe.htmlElementsData(props.pins.map(p => ({ ...p })))
  globe.arcsData(props.arc ? [{ ...props.arc }] : [])
  refreshPolygons()
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

function onPolygonClick(d, _, coords) {
  emit('country', d, coords)
  if (props.interactive) emit('pick', { lat: coords.lat, lng: coords.lng })
}

onMounted(() => {
  globe = Globe()(el.value)
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor('#4f9cff')
    .atmosphereAltitude(0.16)
    .polygonsData(countries)
    .polygonAltitude(altitude)
    .polygonCapColor(capColor)
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => BORDER)
    .polygonCapCurvatureResolution(4)
    .polygonsTransitionDuration(150)
    .polygonLabel(label)
    .onPolygonHover(d => {
      hovered = d
      refreshPolygons()
    })
    .onPolygonClick(onPolygonClick)
    .onGlobeClick(coords => props.interactive && emit('pick', coords))
    .htmlElementsData([])
    .htmlElement(pinElement)
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

  globe.globeMaterial().color.set(OCEAN)
  globe.globeMaterial().emissive.set('#05101f')
  globe.globeMaterial().shininess = 12

  const controls = globe.controls()
  controls.autoRotate = false
  controls.enablePan = false
  controls.minDistance = 115
  controls.maxDistance = 520
  controls.zoomSpeed = 0.7
  controls.rotateSpeed = 0.6

  globe.pointOfView(HOME, 0)
  resize()
  window.addEventListener('resize', resize)
  sync()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  globe?._destructor?.()
  globe = null
})

watch(() => [props.pins, props.arc, props.highlightId, props.labels], sync, { deep: true })

defineExpose({ flyBetween, flyTo, resetView: () => globe?.pointOfView(HOME, 900) })
</script>

<template>
  <div ref="el" class="globe" :class="{ locked: !interactive }"></div>
</template>

<style>
.globe { position: absolute; inset: 0; }
.globe canvas { display: block; cursor: crosshair; }
.globe.locked canvas { cursor: grab; }
.globe .scene-tooltip { font-family: var(--font-body); }
.tip { display: flex; flex-direction: column; padding: 8px 12px; border-radius: 10px; background: rgba(13, 20, 38, .92); border: 1px solid rgba(255, 255, 255, .1); color: #eef2ff; font-size: 14px; line-height: 1.3; box-shadow: 0 8px 20px rgba(0, 0, 0, .4); }
.tip span { color: #9aa5c4; font-size: 12.5px; }
.pin { width: 32px; height: 44px; transform: translateY(-50%); pointer-events: none; filter: drop-shadow(0 6px 10px rgba(0, 0, 0, .55)); }
.pin svg path { stroke: #fff; stroke-width: 2; }
.pin svg circle { fill: #fff; }
.pin.guess svg path { fill: #ff6b35; }
.pin.target svg path { fill: #22c55e; }
.pin.capital svg path { fill: #4f9cff; }
.pin.guess { animation: drop .35s cubic-bezier(.2, .9, .3, 1.3); }
@keyframes drop { from { transform: translateY(-90%); opacity: 0; } to { transform: translateY(-50%); opacity: 1; } }
</style>
