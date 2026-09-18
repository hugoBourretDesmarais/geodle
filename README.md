# GeoDle

Learn the world map GeoGuessr-style on a 3D globe. Three modes:

- **Countries** — read a country name, pin it. Landing inside scores 0 km; otherwise the distance
  to its nearest border.
- **Capitals** — read a capital, pin the city, scored by straight-line distance.
- **Learn** — Anki-style flashcards. A country lights up, the camera flies to it and its neighbours
  are labelled. Type the name (autocomplete, Enter picks the highlighted match) or say "I don't know";
  a right answer pre-selects Good, a wrong one Again, and Enter accepts. Grade with 1–4. SM-2
  scheduling in `src/game/srs.js`; per-card ease, interval, due time and a log of the last 50 reviews
  (with what you typed) live in `localStorage` under `geodle.srs`, per browser. Export / Import on the
  start screen moves that JSON between browsers. New cards arrive largest-country-first, 5/10/20 per
  session.
- **Explore** — free roam: hover for country and capital names, click or search to fly to one.

Five rounds per game, raw kilometres, no daily limit, optional continent filter (also scopes Learn). Country borders
are drawn, names are not. Stats live in `localStorage`; there is no backend.

Live at https://hugobourretdesmarais.github.io/geodle/ (Home: https://hugobourretdesmarais.github.io/).

## Stack

Vue 3 + Vite. The globe is [globe.gl](https://github.com/vasturiano/globe.gl) (three.js) for the
sphere, atmosphere, camera, arcs and HTML pins. Countries are not globe.gl polygons: those cost one
mesh per ring (about 3,200 objects and 6,000 draw calls for the world). Instead `src/game/countryLayer.js`
draws every country in one vertex-coloured mesh plus one line set (4 draw calls). The tessellation
runs in a Web Worker (`src/game/mesh.worker.js`) so the main thread never stalls; hover and click
hit-testing is our own point-in-polygon with cached bounds (`src/game/geo.js`).

Loading is staged for slow devices: the start screen and coarse 1:110m shapes ship in the first
~85 KB (gzipped) of JS, the three.js chunk loads lazily, and the simplified 1:50m shapes stream in
from `public/world-50m.json` (160 KB gzipped) and swap in once the worker has built them. Scoring
waits for the detailed shapes. Pixel ratio is capped and antialiasing is dropped on low-end devices.

## Data

`src/data/capitals.json` holds 194 independent states (per mledoze/countries) with capital
coordinates from Natural Earth 1:10m populated places. Rebuild it with:

```bash
npm run data
```

Sources are cached under `tools/cache/`; delete it to refetch. Hand fixes (Nauru, Gitega, Ngerulmud,
Ulaanbaatar) live in `tools/build_capitals.py`.

## Develop

```bash
npm install
npm run dev -- --port 5195
```

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via `.github/workflows/deploy.yml`.
Enable it once under **Settings → Pages → Source: GitHub Actions**.
