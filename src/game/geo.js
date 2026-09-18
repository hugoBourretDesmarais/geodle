const R = 6371

const rad = d => (d * Math.PI) / 180
const deg = r => (r * 180) / Math.PI

export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function midpoint(a, b) {
  const φ1 = rad(a.lat), φ2 = rad(b.lat), λ1 = rad(a.lng), dλ = rad(b.lng - a.lng)
  const bx = Math.cos(φ2) * Math.cos(dλ)
  const by = Math.cos(φ2) * Math.sin(dλ)
  const lat = Math.atan2(Math.sin(φ1) + Math.sin(φ2), Math.sqrt((Math.cos(φ1) + bx) ** 2 + by ** 2))
  const lng = λ1 + Math.atan2(by, Math.cos(φ1) + bx)
  return { lat: deg(lat), lng: ((deg(lng) + 540) % 360) - 180 }
}

export function formatKm(km) {
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km).toLocaleString('en-US')} km`
}

export function verdict(km) {
  if (km < 25) return 'Bullseye'
  if (km < 150) return 'Right on the doorstep'
  if (km < 500) return 'Very close'
  if (km < 1500) return 'Same neighbourhood'
  if (km < 4000) return 'Right continent, wrong corner'
  if (km < 9000) return 'Way off'
  return 'Other side of the world'
}

export function shuffle(list) {
  const a = list.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function normalizeLng(lng) {
  return ((lng + 540) % 360) - 180
}

// Rings that cross the antimeridian (Russia, Fiji) jump 360° between neighbours; unwrap them
// into a continuous strip and test the point at each 360° image.
const unwrapped = new WeakMap()

function unwrap(ring) {
  const hit = unwrapped.get(ring)
  if (hit) return hit
  const out = [ring[0]]
  for (let i = 1; i < ring.length; i++) {
    const prev = out[i - 1][0]
    let x = ring[i][0]
    while (x - prev > 180) x -= 360
    while (x - prev < -180) x += 360
    out.push([x, ring[i][1]])
  }
  unwrapped.set(ring, out)
  return out
}

// Per-feature lat range and unwrapped lng ranges, for cheap rejection before the ray cast.
const extents = new WeakMap()

function extentOf(feature) {
  let e = extents.get(feature)
  if (e) return e
  e = { minLat: 90, maxLat: -90, lng: [] }
  for (const poly of polygons(feature.geometry)) {
    let minLng = Infinity, maxLng = -Infinity
    for (const [lng, lat] of unwrap(poly[0])) {
      if (lat < e.minLat) e.minLat = lat
      if (lat > e.maxLat) e.maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
    }
    e.lng.push([minLng, maxLng])
  }
  extents.set(feature, e)
  return e
}

function mayContain(feature, p) {
  const e = extentOf(feature)
  if (p.lat < e.minLat || p.lat > e.maxLat) return false
  return e.lng.some(([a, b]) => (p.lng >= a && p.lng <= b) || (p.lng + 360 >= a && p.lng + 360 <= b) || (p.lng - 360 >= a && p.lng - 360 <= b))
}

export function hitTest(features, p) {
  for (const f of features) if (mayContain(f, p) && pointInFeature(p, f)) return f
  return null
}

function rayCast(ring, lng, lat) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function ringContains(ring, p) {
  const r = unwrap(ring)
  return rayCast(r, p.lng, p.lat) || rayCast(r, p.lng + 360, p.lat) || rayCast(r, p.lng - 360, p.lat)
}

function polygons(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  return []
}

export function pointInFeature(p, feature) {
  return polygons(feature?.geometry).some(poly => poly.reduce((acc, ring) => acc !== ringContains(ring, p), false))
}

// Nearest boundary point of the feature, computed on a local flat projection around p.
function nearestOnBoundary(p, feature) {
  const kx = Math.cos(rad(p.lat)) * 111.32, ky = 110.57
  let best = null
  for (const poly of polygons(feature.geometry)) {
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = normalizeLng(ring[j][0] - p.lng) * kx, ay = (ring[j][1] - p.lat) * ky
        const bx = normalizeLng(ring[i][0] - p.lng) * kx, by = (ring[i][1] - p.lat) * ky
        const dx = bx - ax, dy = by - ay
        const len2 = dx * dx + dy * dy
        const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0
        const qx = ax + t * dx, qy = ay + t * dy
        const d2 = qx * qx + qy * qy
        if (!best || d2 < best.d2) best = { d2, lat: p.lat + qy / ky, lng: normalizeLng(p.lng + qx / kx) }
      }
    }
  }
  return best
}

export function distanceToFeature(p, feature) {
  if (pointInFeature(p, feature)) return { km: 0, nearest: null }
  const q = nearestOnBoundary(p, feature)
  return { km: distanceKm(p, q), nearest: { lat: q.lat, lng: q.lng } }
}

// Bounds of the largest outer ring, longitudes unwrapped so Russia and Fiji don't centre on 0°.
export function featureBounds(feature) {
  let best = null
  for (const poly of polygons(feature.geometry)) {
    const ring = unwrap(poly[0])
    let minLat = 90, maxLat = -90, minLng = Infinity, maxLng = -Infinity
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
    }
    const area = (maxLat - minLat) * (maxLng - minLng) * Math.cos(rad((minLat + maxLat) / 2))
    if (!best || area > best.area) best = { minLat, maxLat, minLng, maxLng, area }
  }
  return best || { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0, area: 0 }
}

const centers = new WeakMap()

export function featureCenter(feature) {
  if (centers.has(feature)) return centers.get(feature)
  const c = computeCenter(feature)
  centers.set(feature, c)
  return c
}

function computeCenter(feature) {
  const b = featureBounds(feature)
  const span = Math.max(b.maxLat - b.minLat, (b.maxLng - b.minLng) * Math.cos(rad((b.minLat + b.maxLat) / 2)))
  return { lat: (b.minLat + b.maxLat) / 2, lng: normalizeLng((b.minLng + b.maxLng) / 2), span }
}
