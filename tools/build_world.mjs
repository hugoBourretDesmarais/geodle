// Simplify Natural Earth 50m country shapes so the globe tessellates and raycasts fast on phones.
import { readFileSync, writeFileSync } from 'node:fs'
import { presimplify, simplify, quantile } from 'topojson-simplify'
import { feature, quantize } from 'topojson-client'

const src = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url)))
const keep = Number(process.argv[2] || 0.45)
const pre = presimplify(src)
const out = quantize(simplify(pre, quantile(pre, 1 - keep)), 1e5)
const before = src.arcs.reduce((s, a) => s + a.length, 0)
const after = out.arcs.reduce((s, a) => s + a.length, 0)
const feats = feature(out, out.objects.countries).features
const empty = feats.filter(f => !f.geometry || !f.geometry.coordinates?.length)
writeFileSync(new URL('../public/world-50m.json', import.meta.url), JSON.stringify(out))
console.log(`points ${before} -> ${after}, features ${feats.length}, empty ${empty.length}`)
