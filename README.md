# GeoDle

Practice the world's capitals GeoGuessr-style: read a capital's name, drop a pin on a 3D globe,
get told how far off you were. Five rounds per game, raw kilometres, no daily limit. Country
borders are drawn, names are not. Stats live in `localStorage`; there is no backend.

Live at https://hugobourretdesmarais.github.io/geodle/ (Home: https://hugobourretdesmarais.github.io/).

## Stack

Vue 3 + Vite. The globe is [globe.gl](https://github.com/vasturiano/globe.gl) (three.js) rendering
Natural Earth 1:110m country polygons from `world-atlas`; no map tiles or textures are fetched.

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
