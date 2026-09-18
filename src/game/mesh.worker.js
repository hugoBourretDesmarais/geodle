import './three-shim.js'
import ConicPolygonGeometry from 'three-conic-polygon-geometry'
import GeoJsonGeometry from 'three-geojson-geometry'

function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  return []
}

function concat(chunks, Type) {
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Type(total)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

self.onmessage = ({ data }) => {
  const { id, features, capRadius, lineRadius, resolution } = data
  const capPos = [], capIdx = [], linePos = [], lineIdx = [], ranges = []
  let v = 0, lv = 0
  for (const f of features) {
    const start = v
    for (const poly of polygonsOf(f.geometry)) {
      const g = new ConicPolygonGeometry(poly, 0, capRadius, false, true, false, resolution)
      const pos = g.attributes.position.array
      const idx = g.index.array
      capPos.push(pos)
      const shifted = new Uint32Array(idx.length)
      for (let i = 0; i < idx.length; i++) shifted[i] = idx[i] + v
      capIdx.push(shifted)
      v += pos.length / 3
    }
    ranges.push({ id: f.id, start, count: v - start })
    const lg = new GeoJsonGeometry(f.geometry, lineRadius, 2)
    const lp = lg.attributes.position.array
    linePos.push(lp)
    if (lg.index) {
      const li = lg.index.array
      const shifted = new Uint32Array(li.length)
      for (let i = 0; i < li.length; i++) shifted[i] = li[i] + lv
      lineIdx.push(shifted)
    } else {
      const n = lp.length / 3
      const seq = new Uint32Array(n)
      for (let i = 0; i < n; i++) seq[i] = lv + i
      lineIdx.push(seq)
    }
    lv += lp.length / 3
  }
  const out = { id, ranges, capPos: concat(capPos, Float32Array), capIdx: concat(capIdx, Uint32Array), linePos: concat(linePos, Float32Array), lineIdx: concat(lineIdx, Uint32Array) }
  self.postMessage(out, [out.capPos.buffer, out.capIdx.buffer, out.linePos.buffer, out.lineIdx.buffer])
}
