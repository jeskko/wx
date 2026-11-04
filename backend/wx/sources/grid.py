"""Forecast fields on a regular grid in map coordinates (EPSG:3067), for map animations.

Grid nodes are laid out in map space, inverse-projected to lat/lon and sampled from FMI's
HARMONIE point forecast (the edited forecast does not cover the eastern edge). Wind is
rotated from true north to grid north so the client can advect particles in map space.
Fields are quantised and base64-packed to keep the file small.
"""

import base64
import logging
import math
from array import array
from datetime import datetime, timedelta, timezone

from .. import proj
from ..geo import haversine_km
from ..store import iso
from .fmi import _fmt, _wfs
from .fmi_xml import parse_multipointcoverage

log = logging.getLogger(__name__)

QUERY = "fmi::forecast::harmonie::surface::point::multipointcoverage"
PARAMS = "WindSpeedMS,WindDirection,TotalCloudCover,Precipitation1h,Temperature"
MAX_POINTS = 90  # FMI accepts at most 99 latlon parameters per request

# field -> (array typecode, scale): stored = round(value / scale), clamped to the type range
ENCODING = {
    "u": ("b", 0.5),  # m/s, grid-east component
    "v": ("b", 0.5),  # m/s, grid-north component
    "cloud": ("B", 1.0),  # %
    "pr": ("B", 0.1),  # mm/h
    "t": ("b", 0.5),  # °C
}
_RANGE = {"b": (-127, 127), "B": (0, 255)}


def nodes(extent: str, step_m: float) -> tuple[int, int, list[tuple[float, float]]]:
    x0, y0, x1, y1 = proj.EXTENTS[extent]
    nx = int(round((x1 - x0) / step_m)) + 1
    ny = int(round((y1 - y0) / step_m)) + 1
    pts = [proj.inverse(x0 + i * step_m, y0 + j * step_m) for j in range(ny) for i in range(nx)]
    return nx, ny, pts


def grid_north_bearing(lat: float, lon: float) -> float:
    """Bearing (radians, clockwise from grid north) of true north at a point."""
    e1, n1 = proj.forward(lat, lon)
    e2, n2 = proj.forward(lat + 0.01, lon)
    return math.atan2(e2 - e1, n2 - n1)


def _pack(code: str, scale: float, values: list[float | None]) -> str:
    lo, hi = _RANGE[code]
    arr = array(code, (0 if v is None else max(lo, min(hi, round(v / scale))) for v in values))
    return base64.b64encode(arr.tobytes()).decode()


def fields(extent: str = "fi", step_m: float = 50000, hours: int = 24) -> dict:
    nx, ny, pts = nodes(extent, step_m)
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    end = start + timedelta(hours=hours)

    # sample all nodes; map each requested point to the returned series by proximity
    per_node: list[dict] = [None] * len(pts)  # type: ignore[list-item]
    for k in range(0, len(pts), MAX_POINTS):
        chunk = pts[k : k + MAX_POINTS]
        xml = _wfs(
            QUERY,
            latlon=[f"{la:.4f},{lo:.4f}" for la, lo in chunk],
            starttime=_fmt(start),
            endtime=_fmt(end),
            timestep="60",
            parameters=PARAMS,
        )
        series = parse_multipointcoverage(xml)
        for i, (la, lo) in enumerate(chunk):
            best = min(series, key=lambda s: haversine_km(la, lo, s.lat, s.lon))
            per_node[k + i] = {ts: vals for ts, vals in best.rows}

    times = sorted({ts for d in per_node if d for ts in d})
    rot = [grid_north_bearing(la, lo) for la, lo in pts]
    out: dict[str, list[str]] = {f: [] for f in ENCODING}
    for ts in times:
        cols: dict[str, list[float | None]] = {f: [] for f in ENCODING}
        for n, d in enumerate(per_node):
            v = (d or {}).get(ts, {})
            ws, wd = v.get("WindSpeedMS"), v.get("WindDirection")
            if ws is None or wd is None:
                cols["u"].append(None)
                cols["v"].append(None)
            else:
                # direction the wind blows TO, in grid coordinates
                to = math.radians(wd) + math.pi + rot[n]
                cols["u"].append(ws * math.sin(to))
                cols["v"].append(ws * math.cos(to))
            cols["cloud"].append(v.get("TotalCloudCover"))
            cols["pr"].append(v.get("Precipitation1h"))
            cols["t"].append(v.get("Temperature"))
        for f, (code, scale) in ENCODING.items():
            out[f].append(_pack(code, scale, cols[f]))

    x0, y0, x1, y1 = proj.EXTENTS[extent]
    return {
        "updated": iso(datetime.now(timezone.utc)),
        "source": "fmi-harmonie",
        "extent": [x0, y0, x1, y1],
        "step": step_m,
        "nx": nx,
        "ny": ny,
        "order": "row-major, south row first",
        "times": [iso(t) for t in times],
        "encoding": {f: {"type": "int8" if c == "b" else "uint8", "scale": s} for f, (c, s) in ENCODING.items()},
        "fields": out,
    }
