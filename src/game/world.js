import * as topojson from 'topojson-client'
import world from 'world-atlas/countries-50m.json'
import capitals from '../data/capitals.json'

export const countries = topojson.feature(world, world.objects.countries).features
export const featureById = new Map(countries.map(f => [f.id, f]))
export const capitalById = new Map(capitals.map(c => [c.ccn3, c]))

export function featureFor(capital) {
  return featureById.get(capital.ccn3) || null
}

export function infoFor(feature) {
  const cap = capitalById.get(feature.id)
  return cap || { country: feature.properties?.name || 'Unknown', capital: null, ccn3: feature.id, region: '', subregion: '' }
}

export { capitals }
