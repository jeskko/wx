#!/usr/bin/env python3
"""Build basemaps for the world map views in backend/wx/world.json (Natural Earth, public domain).

Usage:
  python3 tools/build_world.py <dir with ne_10m_* and ne_50m_* geojson> [view id ...]

Regions use the 50m data, capital views the 10m data. Each view is projected with its own
spherical Lambert azimuthal equal-area projection. Writes frontend/src/map/world/<view>.json
and copies world.json to frontend/src/map/world.json for the frontend.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "tools"))
from build_basemap import clip_line, clip_ring, dp, dp_ring, lines, polygons, ring_area  # noqa: E402
from wx.laea import Laea  # noqa: E402
from wx.sources import world  # noqa: E402

OUT = ROOT / "frontend" / "src" / "map" / "world"


def shift_lons(coords, lo0: float, lo1: float):
    """Move a ring/line by ±360° when the view's lon box extends past the antimeridian."""
    lons = [c[0] for c in coords]
    if lo1 > 180 and max(lons) <= lo1 - 360:
        return [(c[0] + 360, c[1]) for c in coords]
    if lo0 < -180 and min(lons) >= lo0 + 360:
        return [(c[0] - 360, c[1]) for c in coords]
    return [(c[0], c[1]) for c in coords]


def build(v: dict, ne_dir: Path, cache: dict) -> dict:
    res = "50m" if v["kind"] == "region" else "10m"
    p = Laea(v["lat0"], v["lon0"])
    x0, y0, x1, y1 = world.extent(v)
    pad = (x1 - x0) * 0.01
    rect = (x0 - pad, y0 - pad, x1 + pad, y1 + pad)
    lo0, la0, lo1, la1 = world.latlon_box(v, margin=3.0)
    lbox = (lo0, max(-89.9, la0), lo1, min(89.9, la1))
    tol = float(v["tol"])

    def load(name):
        key = f"{res}_{name}"
        if key not in cache:
            cache[key] = json.loads((ne_dir / f"ne_{key}.geojson").read_text())
        return cache[key]

    def to_svg(pts):
        return [(round((x - x0) / 1000, 1), round((y1 - y) / 1000, 1)) for x, y in pts]

    def project_ring(ring):
        ring = shift_lons(ring, lo0, lo1)
        xs = [c[0] for c in ring]
        ys = [c[1] for c in ring]
        if max(xs) < lbox[0] or min(xs) > lbox[2] or max(ys) < lbox[1] or min(ys) > lbox[3]:
            return None
        r = clip_ring(ring, *lbox)
        if len(r) < 3:
            return None
        r = [p.forward(la, lo) for lo, la in r]
        r = clip_ring(r, *rect)
        if len(r) < 3:
            return None
        r = dp_ring(r, tol)
        if len(r) < 3 or ring_area(r) < (tol * 3) ** 2:
            return None
        return to_svg(r)

    def poly_layer(name):
        rings = []
        for f in load(name)["features"]:
            for poly in polygons(f["geometry"]):
                for ring in poly:
                    r = project_ring(ring)
                    if r:
                        rings.append("M" + "L".join(f"{x:g} {y:g}" for x, y in r) + "Z")
        return "".join(rings)

    def line_layer(name):
        out = []
        for f in load(name)["features"]:
            for ln in lines(f["geometry"]):
                ln = shift_lons(ln, lo0, lo1)
                ll = [(lo, la) for lo, la in ln if lbox[0] <= lo <= lbox[2] and lbox[1] <= la <= lbox[3]]
                if len(ll) < 2:
                    continue
                pts = [p.forward(la, lo) for lo, la in ll]
                for piece in clip_line(pts, *rect):
                    piece = dp(piece, tol)
                    if len(piece) >= 2:
                        out.append("M" + "L".join(f"{x:g} {y:g}" for x, y in to_svg(piece)))
        return "".join(out)

    return {
        "extent": [x0, y0, x1, y1],
        "width": round((x1 - x0) / 1000, 1),
        "height": round((y1 - y0) / 1000, 1),
        "proj": {"type": "laea", "lat0": v["lat0"], "lon0": v["lon0"]},
        "source": f"Natural Earth {res} (public domain), Lambert azimuthal equal-area",
        "land": poly_layer("admin_0_countries"),
        "lakes": poly_layer("lakes"),
        "borders": line_layer("admin_0_boundary_lines_land"),
    }


def main():
    ne_dir = Path(sys.argv[1])
    only = set(sys.argv[2:])
    OUT.mkdir(parents=True, exist_ok=True)
    cache: dict = {}
    for v in world.views():
        if only and v["id"] not in only:
            continue
        data = build(v, ne_dir, cache)
        path = OUT / f"{v['id']}.json"
        path.write_text(json.dumps(data, separators=(",", ":")))
        print(f"{v['id']}: {path.stat().st_size // 1024} KiB", file=sys.stderr)
    src = ROOT / "backend" / "wx" / "world.json"
    (ROOT / "frontend" / "src" / "map" / "world.json").write_text(src.read_text())


if __name__ == "__main__":
    main()
