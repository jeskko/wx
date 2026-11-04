#!/usr/bin/env python3
"""Build compact SVG basemaps (EPSG:3067) from Natural Earth 10m GeoJSON (public domain).

Usage:
  python3 tools/build_basemap.py <dir with ne_10m_*.geojson> [out dir]

Needs (from https://github.com/nvkelso/natural-earth-vector/tree/master/geojson):
  ne_10m_admin_0_countries.geojson, ne_10m_lakes.geojson, ne_10m_admin_0_boundary_lines_land.geojson

Writes frontend/src/map/basemap-<extent>.json with SVG path strings in kilometres, origin at the
extent's top-left corner (y down), so a <svg viewBox="0 0 W H"> draws it directly.
"""

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from wx import proj  # noqa: E402

TOLERANCE = {"fi": 1200.0, "nordic": 3000.0}  # Douglas-Peucker, metres


# ------------------------------------------------------------------ geometry helpers


def clip_ring(ring, xmin, ymin, xmax, ymax):
    """Sutherland-Hodgman: clip a closed ring [(x,y)...] to a rectangle."""

    def clip(pts, inside, inter):
        out = []
        for i, cur in enumerate(pts):
            prev = pts[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(inter(prev, cur))
        return out

    def ix(a, b, x):
        t = (x - a[0]) / (b[0] - a[0])
        return (x, a[1] + t * (b[1] - a[1]))

    def iy(a, b, y):
        t = (y - a[1]) / (b[1] - a[1])
        return (a[0] + t * (b[0] - a[0]), y)

    pts = ring
    for inside, inter in (
        (lambda p: p[0] >= xmin, lambda a, b: ix(a, b, xmin)),
        (lambda p: p[0] <= xmax, lambda a, b: ix(a, b, xmax)),
        (lambda p: p[1] >= ymin, lambda a, b: iy(a, b, ymin)),
        (lambda p: p[1] <= ymax, lambda a, b: iy(a, b, ymax)),
    ):
        if not pts:
            break
        pts = clip(pts, inside, inter)
    return pts


def clip_line(line, xmin, ymin, xmax, ymax):
    """Split a polyline into the pieces inside the rectangle (Liang-Barsky per segment)."""
    pieces, cur = [], []
    for a, b in zip(line, line[1:]):
        x0, y0 = a
        dx, dy = b[0] - x0, b[1] - y0
        t0, t1 = 0.0, 1.0
        ok = True
        for p, q in ((-dx, x0 - xmin), (dx, xmax - x0), (-dy, y0 - ymin), (dy, ymax - y0)):
            if p == 0:
                if q < 0:
                    ok = False
                    break
            else:
                r = q / p
                if p < 0:
                    t0 = max(t0, r)
                else:
                    t1 = min(t1, r)
        if not ok or t0 > t1:
            if cur:
                pieces.append(cur)
                cur = []
            continue
        pa = (x0 + t0 * dx, y0 + t0 * dy)
        pb = (x0 + t1 * dx, y0 + t1 * dy)
        if not cur:
            cur = [pa]
        cur.append(pb)
        if t1 < 1.0:
            pieces.append(cur)
            cur = []
    if cur:
        pieces.append(cur)
    return pieces


def dp(points, tol):
    """Douglas-Peucker simplification (iterative)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = points[i]
        bx, by = points[j]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-9
        best, idx = -1.0, -1
        for k in range(i + 1, j):
            px, py = points[k]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if d > best:
                best, idx = d, k
        if best > tol:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(points, keep) if k]


def dp_ring(ring, tol):
    """Simplify a closed ring (no repeated end point): split at the farthest vertex from the
    first one, simplify both halves (a zero-length chord would collapse the ring otherwise)."""
    if len(ring) < 4:
        return ring
    fx, fy = ring[0]
    far = max(range(len(ring)), key=lambda i: (ring[i][0] - fx) ** 2 + (ring[i][1] - fy) ** 2)
    a = dp(ring[: far + 1], tol)
    b = dp(ring[far:] + [ring[0]], tol)
    return a[:-1] + b[:-1]


def ring_area(r):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]))) / 2


# ------------------------------------------------------------------ build


def lonlat_box(extent, margin=4.0):
    x0, y0, x1, y1 = extent
    pts = []
    for i in range(21):
        f = i / 20
        for e, n in ((x0 + f * (x1 - x0), y0), (x0 + f * (x1 - x0), y1), (x0, y0 + f * (y1 - y0)), (x1, y0 + f * (y1 - y0))):
            pts.append(proj.inverse(e, n))
    lats = [p[0] for p in pts]
    lons = [p[1] for p in pts]
    return min(lons) - margin, min(lats) - margin, max(lons) + margin, min(89.0, max(lats) + margin)


def polygons(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def lines(geom):
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def build(ne_dir: Path, extent_name: str) -> dict:
    extent = proj.EXTENTS[extent_name]
    x0, y0, x1, y1 = extent
    pad = 20000
    rect = (x0 - pad, y0 - pad, x1 + pad, y1 + pad)
    lbox = lonlat_box(extent)
    tol = TOLERANCE[extent_name]

    def to_svg(pts):
        return [(round((x - x0) / 1000, 1), round((y1 - y) / 1000, 1)) for x, y in pts]

    def project_ring(ring):
        r = clip_ring([(lo, la) for lo, la in ring], *lbox)  # lon/lat pre-clip keeps TM well-behaved
        if len(r) < 3:
            return None
        r = [proj.forward(la, lo) for lo, la in r]
        r = clip_ring(r, *rect)
        if len(r) < 3:
            return None
        r = dp_ring(r, tol)
        if len(r) < 3 or ring_area(r) < (tol * 3) ** 2:
            return None
        return to_svg(r)

    def path_rings(rings):
        out = []
        for r in rings:
            out.append("M" + "L".join(f"{x:g} {y:g}" for x, y in r) + "Z")
        return "".join(out)

    def poly_layer(fname, keep=lambda props: True):
        data = json.loads((ne_dir / fname).read_text())
        rings = []
        for f in data["features"]:
            if not keep(f["properties"]):
                continue
            for poly in polygons(f["geometry"]):
                for ring in poly:  # outer + holes; even-odd fill handles holes
                    r = project_ring(ring)
                    if r:
                        rings.append(r)
        return path_rings(rings), len(rings)

    def line_layer(fname):
        data = json.loads((ne_dir / fname).read_text())
        out = []
        for f in data["features"]:
            for ln in lines(f["geometry"]):
                ll = [(lo, la) for lo, la in ln if lbox[0] <= lo <= lbox[2] and lbox[1] <= la <= lbox[3]]
                if len(ll) < 2:
                    continue
                pts = [proj.forward(la, lo) for lo, la in ll]
                for piece in clip_line(pts, *rect):
                    piece = dp(piece, tol)
                    if len(piece) >= 2:
                        out.append("M" + "L".join(f"{x:g} {y:g}" for x, y in to_svg(piece)))
        return "".join(out), len(out)

    land, n_land = poly_layer("ne_10m_admin_0_countries.geojson")
    lakes, n_lakes = poly_layer("ne_10m_lakes.geojson")
    borders, n_b = line_layer("ne_10m_admin_0_boundary_lines_land.geojson")
    print(f"{extent_name}: land {n_land} rings, lakes {n_lakes}, borders {n_b}", file=sys.stderr)
    return {
        "extent": list(extent),
        "width": round((x1 - x0) / 1000, 1),
        "height": round((y1 - y0) / 1000, 1),
        "source": "Natural Earth (public domain), projected to EPSG:3067",
        "land": land,
        "lakes": lakes,
        "borders": borders,
    }


def main():
    ne_dir = Path(sys.argv[1])
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "frontend" / "src" / "map"
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in TOLERANCE:
        data = build(ne_dir, name)
        p = out_dir / f"basemap-{name}.json"
        p.write_text(json.dumps(data, separators=(",", ":")))
        print(f"wrote {p} ({p.stat().st_size // 1024} KiB)", file=sys.stderr)


if __name__ == "__main__":
    main()
