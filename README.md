# GeoDle

Learn the world map GeoGuessr-style on a 3D globe. Three modes:

- **Countries** — read a country name, pin it. Landing inside scores 0 km; otherwise the distance
  to its nearest border.
- **Capitals** — read a capital, pin the city, scored by straight-line distance.
- **Learn** — Anki-style flashcards. A country lights up on the globe, you name it, flip, and grade
  yourself Again / Hard / Good / Easy (keys 1–4). SM-2 scheduling in `src/game/srs.js`, progress in
  `localStorage` under `geodle.srs`. New cards arrive largest-country-first, 5/10/20 per session.
- **Explore** — free roam: hover for country and capital names, click or search to fly to one.

Five rounds per game, raw kilometres, no daily limit, optional continent filter (also scopes Learn). Country borders
are drawn, names are not. Stats live in `localStorage`; there is no backend.

Live at https://hugobourretdesmarais.github.io/geodle/ (Home: https://hugobourretdesmarais.github.io/).

## Stack

Vue 3 + Vite. The globe is [globe.gl](https://github.com/vasturiano/globe.gl) (three.js) rendering
Natural Earth 1:50m country polygons from `world-atlas` (Tuvalu is the only state without one; it is
scored as a 30 km point). Point-in-polygon and nearest-border maths live in `src/game/geo.js`, with
antimeridian-crossing rings (Russia, Fiji) unwrapped first. No map tiles or textures are fetched.

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
