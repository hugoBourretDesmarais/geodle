import { shallowRef } from 'vue'
import * as topojson from 'topojson-client'
import coarse from 'world-atlas/countries-110m.json'
import capitals from '../data/capitals.json'
import { featureBounds } from './geo.js'

// world-atlas reuses an id for dependencies (Australia + Ashmore and Cartier Is.): keep the largest.
function index(topology) {
  const countries = topojson.feature(topology, topology.objects.countries).features
  const byId = new Map()
  for (const f of countries) {
    const prev = byId.get(f.id)
    if (!prev || featureBounds(f).area > featureBounds(prev).area) byId.set(f.id, f)
  }
  return { countries, byId, detailed: topology !== coarse }
}

// Coarse shapes ship in the bundle so the globe paints at once; the detailed set streams in after.
export const world = shallowRef(index(coarse))

let loading = null
export function loadDetailedWorld() {
  if (world.value.detailed) return Promise.resolve(world.value)
  loading ??= fetch(`${import.meta.env.BASE_URL}world-50m.json`)
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
    .then(t => (world.value = index(t)))
    .catch(() => world.value)
  return loading
}

export const capitalById = new Map(capitals.map(c => [c.ccn3, c]))

export function featureFor(capital) {
  return world.value.byId.get(capital.ccn3) || null
}

export function infoFor(feature) {
  const cap = capitalById.get(feature.id)
  return cap || { country: feature.properties?.name || 'Unknown', capital: null, ccn3: feature.id, region: '', subregion: '' }
}

export { capitals }
