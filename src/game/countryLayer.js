import { BufferGeometry, BufferAttribute, Color, Group, LineBasicMaterial, LineSegments, Mesh, MeshLambertMaterial } from 'three'

const GLOBE_RADIUS = 100

// All countries in one mesh and one line set: a handful of draw calls instead of thousands.
export class CountryLayer {
  constructor(scene, { land, border, resolution = 8, altitude = 0.006 } = {}) {
    this.scene = scene
    this.land = new Color(land)
    this.border = border
    this.resolution = resolution
    this.capRadius = GLOBE_RADIUS * (1 + altitude)
    this.lineRadius = GLOBE_RADIUS * (1 + altitude + 0.002)
    this.group = null
    this.ranges = new Map()
    this.colors = null
    this.paintMap = new Map()
    this.job = 0
    this.worker = new Worker(new URL('./mesh.worker.js', import.meta.url), { type: 'module' })
    this.worker.onmessage = e => this.receive(e.data)
  }

  setFeatures(features) {
    this.job += 1
    this.worker.postMessage({ id: this.job, features, capRadius: this.capRadius, lineRadius: this.lineRadius, resolution: this.resolution })
  }

  receive({ id, ranges, capPos, capIdx, linePos, lineIdx }) {
    if (id !== this.job) return
    const n = capPos.length / 3
    const normals = new Float32Array(capPos.length)
    for (let i = 0; i < capPos.length; i += 3) {
      const x = capPos[i], y = capPos[i + 1], z = capPos[i + 2]
      const l = Math.hypot(x, y, z) || 1
      normals[i] = x / l
      normals[i + 1] = y / l
      normals[i + 2] = z / l
    }
    const colors = new Float32Array(capPos.length)
    const caps = new BufferGeometry()
    caps.setAttribute('position', new BufferAttribute(capPos, 3))
    caps.setAttribute('normal', new BufferAttribute(normals, 3))
    caps.setAttribute('color', new BufferAttribute(colors, 3))
    caps.setIndex(new BufferAttribute(capIdx, 1))
    const lines = new BufferGeometry()
    lines.setAttribute('position', new BufferAttribute(linePos, 3))
    lines.setIndex(new BufferAttribute(lineIdx, 1))

    const group = new Group()
    group.add(new Mesh(caps, new MeshLambertMaterial({ vertexColors: true })))
    group.add(new LineSegments(lines, new LineBasicMaterial({ color: this.border, transparent: true, opacity: 0.9 })))

    this.dispose()
    this.group = group
    this.colors = caps.attributes.color
    this.ranges = new Map(ranges.map(r => [r.id, r]))
    this.vertexCount = n
    this.scene.add(group)
    this.repaint()
  }

  // ids -> css colour; everything else is land.
  paint(map) {
    this.paintMap = map
    this.repaint()
  }

  repaint() {
    if (!this.colors) return
    const a = this.colors.array
    const { r, g, b } = this.land
    for (let i = 0; i < a.length; i += 3) {
      a[i] = r
      a[i + 1] = g
      a[i + 2] = b
    }
    const c = new Color()
    for (const [id, css] of this.paintMap) {
      const range = this.ranges.get(id)
      if (!range) continue
      c.set(css)
      for (let i = range.start * 3, end = (range.start + range.count) * 3; i < end; i += 3) {
        a[i] = c.r
        a[i + 1] = c.g
        a[i + 2] = c.b
      }
    }
    this.colors.needsUpdate = true
  }

  dispose() {
    if (!this.group) return
    this.scene.remove(this.group)
    this.group.traverse(o => {
      o.geometry?.dispose()
      o.material?.dispose()
    })
    this.group = null
    this.colors = null
  }

  destroy() {
    this.dispose()
    this.worker.terminate()
  }
}
