import * as topojson from 'topojson-client'
import world from 'world-atlas/countries-50m.json'
import capitals from '../data/capitals.json'
import { featureBounds } from './geo.js'

export const countries = topojson.feature(world, world.objects.countries).features

// world-atlas reuses an id for dependencies (Australia + Ashmore and Cartier Is.): keep the largest.
export const featureById = new Map()
for (const f of countries) {
  const prev = featureById.get(f.id)
  if (!prev || featureBounds(f).area > featureBounds(prev).area) featureById.set(f.id, f)
}
export const capitalById = new Map(capitals.map(c => [c.ccn3, c]))

export function featureFor(capital) {
  return featureById.get(capital.ccn3) || null
}

export function infoFor(feature) {
  const cap = capitalById.get(feature.id)
  return cap || { country: feature.properties?.name || 'Unknown', capital: null, ccn3: feature.id, region: '', subregion: '' }
}

export { capitals }
