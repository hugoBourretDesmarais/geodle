"""Build src/data/capitals.json: mledoze/countries (which states are independent, capital names)
joined with Natural Earth 10m populated places (capital coordinates)."""
import json, os, unicodedata, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(HERE, "..", "src", "data", "capitals.json")
SOURCES = {
    "countries.json": "https://raw.githubusercontent.com/mledoze/countries/master/countries.json",
    "ne_places.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson",
}
# capitals Natural Earth names differently or lacks; name -> (lat, lng)
# Natural Earth has no record for these capitals: cca2 -> (lat, lng)
PATCH = {
    "NR": (-0.5477, 166.9209),  # Yaren, Nauru
    "BI": (-3.4271, 29.9246),   # Gitega, Burundi (NE still points at Bujumbura)
    "PW": (7.5006, 134.6242),   # Ngerulmud, Palau (NE has Melekeok)
}
RENAME = {"Ulan Bator": "Ulaanbaatar"}

os.makedirs(CACHE, exist_ok=True)
for fname, url in SOURCES.items():
    path = os.path.join(CACHE, fname)
    if not os.path.exists(path):
        print("fetching", url)
        urllib.request.urlretrieve(url, path)

def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return "".join(ch for ch in s.lower() if ch.isalnum())

countries = json.load(open(os.path.join(CACHE, "countries.json"), encoding="utf-8"))
places = json.load(open(os.path.join(CACHE, "ne_places.geojson"), encoding="utf-8"))["features"]
caps_by_iso = {}
for f in places:
    p = f["properties"]
    if not str(p.get("featurecla", "")).startswith("Admin-0 capital"):
        continue
    caps_by_iso.setdefault(p["iso_a2"], []).append(p)
    caps_by_iso.setdefault(p["adm0_a3"], []).append(p)

rows, missing = [], []
for c in countries:
    if not c.get("independent"):
        continue
    caps = c.get("capital") or []
    if not caps:
        missing.append((c["cca2"], c["name"]["common"], "no capital"))
        continue
    cap = RENAME.get(caps[0], caps[0])
    cands = caps_by_iso.get(c["cca2"]) or caps_by_iso.get(c["cca3"]) or []
    hit = None
    for p in cands:
        names = {norm(p["name"]), norm(p.get("nameascii") or ""), norm(p.get("namealt") or "")}
        if norm(cap) in names or any(n and (n in norm(cap) or norm(cap) in n) for n in names):
            hit = p
            break
    if hit is None and len(cands) == 1:
        hit = cands[0]
    if hit is None:
        primary = [p for p in cands if p.get("adm0cap") == 1]
        if len(primary) == 1:
            hit = primary[0]
    if c["cca2"] in PATCH:
        lat, lng = PATCH[c["cca2"]]
        hit = {"name": cap, "latitude": lat, "longitude": lng}
    if hit is None:
        missing.append((c["cca2"], c["name"]["common"], cap, [p["name"] for p in cands]))
        continue
    if norm(hit["name"]) != norm(cap):
        print(f"fuzzy  {c['cca2']} {cap!r:34} <- NE {hit['name']!r}")
    rows.append({
        "capital": cap,
        "country": c["name"]["common"],
        "cca2": c["cca2"],
        "ccn3": c["ccn3"],
        "region": c["region"],
        "subregion": c.get("subregion", ""),
        "lat": round(hit["latitude"], 4),
        "lng": round(hit["longitude"], 4),
    })

rows.sort(key=lambda r: r["country"])
json.dump(rows, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(rows), "capitals ->", OUT)
for m in missing:
    print("MISSING", m)
