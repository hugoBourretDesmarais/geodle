<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import Globe from 'globe.gl'
import * as topojson from 'topojson-client'
import world from 'world-atlas/countries-110m.json'
import { midpoint } from '../game/geo.js'

const props = defineProps({
  guess: { type: Object, default: null },
  target: { type: Object, default: null },
  revealed: { type: Boolean, default: false },
  interactive: { type: Boolean, default: true },
})
const emit = defineEmits(['pick'])

const el = ref(null)
let globe = null
let hovered = null

const OCEAN = '#0c2340'
const LAND = '#2c6e55'
const LAND_HOVER = '#3d8a6b'
const BORDER = 'rgba(8, 18, 34, 0.9)'

const countries = topojson.feature(world, world.objects.countries).features

function pinElement(d) {
  const wrap = document.createElement('div')
  wrap.className = `pin ${d.kind}`
  wrap.innerHTML = `<svg viewBox="0 0 32 44" width="32" height="44"><path d="M16 1C8 1 2 7 2 15c0 10 14 28 14 28s14-18 14-28C30 7 24 1 16 1z"/><circle cx="16" cy="15" r="5.5"/></svg>`
  return wrap
}

function markers() {
  const list = []
  if (props.guess) list.push({ kind: 'guess', ...props.guess })
  if (props.revealed && props.target) list.push({ kind: 'target', lat: props.target.lat, lng: props.target.lng })
  return list
}

function arcs() {
  if (!props.revealed || !props.guess || !props.target) return []
  return [{ startLat: props.guess.lat, startLng: props.guess.lng, endLat: props.target.lat, endLng: props.target.lng }]
}

function sync() {
  if (!globe) return
  globe.htmlElementsData(markers())
  globe.arcsData(arcs())
}

function flyToReveal(distanceKm) {
  if (!globe || !props.guess || !props.target) return
  const mid = midpoint(props.guess, props.target)
  const altitude = Math.min(2.6, Math.max(0.45, distanceKm / 5500))
  globe.pointOfView({ ...mid, altitude }, 1100)
}

function resize() {
  if (!globe || !el.value) return
  globe.width(el.value.clientWidth).height(el.value.clientHeight)
}

function pick({ lat, lng }) {
  if (!props.interactive) return
  emit('pick', { lat, lng })
}

onMounted(() => {
  globe = Globe()(el.value)
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor('#4f9cff')
    .atmosphereAltitude(0.16)
    .polygonsData(countries)
    .polygonAltitude(d => (d === hovered ? 0.012 : 0.006))
    .polygonCapColor(d => (d === hovered ? LAND_HOVER : LAND))
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => BORDER)
    .polygonsTransitionDuration(150)
    .onPolygonHover(d => {
      hovered = d
      globe.polygonCapColor(globe.polygonCapColor()).polygonAltitude(globe.polygonAltitude())
    })
    .onPolygonClick((_, __, coords) => pick(coords))
    .onGlobeClick(coords => pick(coords))
    .htmlElementsData([])
    .htmlElement(pinElement)
    .htmlAltitude(0.012)
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
  controls.minDistance = 130
  controls.maxDistance = 520
  controls.zoomSpeed = 0.7
  controls.rotateSpeed = 0.6

  globe.pointOfView({ lat: 25, lng: 10, altitude: 2.3 }, 0)
  resize()
  window.addEventListener('resize', resize)
  sync()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  globe?._destructor?.()
  globe = null
})

watch(() => [props.guess, props.target, props.revealed], sync, { deep: true })

defineExpose({ flyToReveal, resetView: () => globe?.pointOfView({ lat: 25, lng: 10, altitude: 2.3 }, 900) })
</script>

<template>
  <div ref="el" class="globe" :class="{ locked: !interactive }"></div>
</template>

<style>
.globe { position: absolute; inset: 0; }
.globe canvas { display: block; cursor: crosshair; }
.globe.locked canvas { cursor: grab; }
.pin { width: 32px; height: 44px; transform: translateY(-50%); pointer-events: none; filter: drop-shadow(0 6px 10px rgba(0, 0, 0, .55)); }
.pin svg path { stroke: #fff; stroke-width: 2; }
.pin svg circle { fill: #fff; }
.pin.guess svg path { fill: #ff6b35; }
.pin.target svg path { fill: #22c55e; }
.pin.guess { animation: drop .35s cubic-bezier(.2, .9, .3, 1.3); }
@keyframes drop { from { transform: translateY(-90%); opacity: 0; } to { transform: translateY(-50%); opacity: 1; } }
</style>
