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
