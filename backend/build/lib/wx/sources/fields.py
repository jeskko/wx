"""High-resolution model fields (HARMONIE, ~2.5 km) as hourly PNG rasters for the map slides.

FMI's download service returns the model grid reprojected to EPSG:3067 as NetCDF. We resample
it onto a fixed 5 km grid covering a map extent and pack three fields into the RGB channels
of one PNG per hour:

  R  cloud cover      0..250 = 0..100 %   (255 = no data)
  G  precipitation    sqrt(mm/h) * 50     (0 = dry, 255 = 26 mm/h)
  B  temperature      (°C + 50) * 2       (-50 .. +77.5 °C)

The client decodes these with a canvas; see frontend/src/map/raster.ts.
"""

import io
import logging
import math
import re
from array import array
from datetime import datetime, timedelta, timezone

from PIL import Image

from .. import net, proj
from ..netcdf3 import Dataset
from ..store import iso
from .fmi import _fmt, _wfs

log = logging.getLogger(__name__)

DOWNLOAD = "https://opendata.fmi.fi/download"
PRODUCER = "harmonie_scandinavia_surface"
PARAMS = "TotalCloudCover,Precipitation1h,Temperature"
STEP_M = 5000
# lat/lon box whose EPSG:3067 projection covers EXTENTS["fi"] with a margin
LATLON_BBOX = {"fi": "12.5,58.2,38.5,71.5"}
FETCH_GRID = (330, 330)  # ~4.5 km source cells for the box above
MISSING = 32700.0


def latest_origin() -> datetime:
    """Newest HARMONIE run that has data available (from the WFS grid query's download links)."""
    t = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    xml = _wfs(
        "fmi::forecast::harmonie::surface::grid",
        parameters="Temperature",
        bbox="24,60,25,61",
        starttime=_fmt(t),
        endtime=_fmt(t),
    ).decode("utf-8", "replace")
    found = re.findall(r"origintime=(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)", xml)
    if not found:
        raise RuntimeError("no HARMONIE runs listed")
    return datetime.fromisoformat(max(found).replace("Z", "+00:00"))


def download(origin: datetime, start: datetime, hours: int, extent: str = "fi") -> bytes:
    return net.get_bytes(
        DOWNLOAD,
        {
            "producer": PRODUCER,
            "param": PARAMS,
            "bbox": LATLON_BBOX[extent],
            "origintime": _fmt(origin),
            "starttime": _fmt(start),
            "endtime": _fmt(start + timedelta(hours=hours)),
            "timestep": "60",
            "levels": "0",
            "format": "netcdf",
            "projection": "EPSG:3067",
            "gridsize": f"{FETCH_GRID[0]},{FETCH_GRID[1]}",
        },
    )


def _axis_weights(src: list[float], dst: list[float]) -> list[tuple[int, float]]:
    """For each dst coordinate: (index i, weight of i+1) into an ascending src axis; i=-1 = outside."""
    out = []
    n = len(src)
    step = (src[-1] - src[0]) / (n - 1)
    for c in dst:
        g = (c - src[0]) / step
        if g < 0 or g > n - 1:
            out.append((-1, 0.0))
        else:
            i = min(n - 2, int(g))
            out.append((i, g - i))
    return out


def _times(ds: Dataset, var: str) -> list[datetime]:
    v = ds.variables[var]
    units = v.attrs.get("units", "")
    m = re.match(r"hours since (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)", units)
    if not m:
        raise RuntimeError(f"unexpected time units {units!r}")
    base = datetime.fromisoformat(m.group(1)).replace(tzinfo=timezone.utc)
    return [base + timedelta(hours=int(h)) for h in v.values()]


def _find(ds: Dataset, prefix: str) -> str:
    for name in ds.variables:
        if name.startswith(prefix):
            return name
    raise RuntimeError(f"no {prefix}* variable in download")


def rasters(nc: bytes, extent: str = "fi", step_m: float = STEP_M) -> tuple[dict, list[tuple[datetime, bytes]]]:
    """Resample a downloaded NetCDF onto the extent's 5 km grid; return (meta, [(time, png)])."""
    ds = Dataset(nc)
    xs = list(ds.variables["x"].values())
    ys = list(ds.variables["y"].values())
    sx, sy = len(xs), len(ys)
    x0, y0, x1, y1 = proj.EXTENTS[extent]
    nx = int(round((x1 - x0) / step_m))
    ny = int(round((y1 - y0) / step_m))
    cx = [x0 + (i + 0.5) * step_m for i in range(nx)]
    cy = [y1 - (j + 0.5) * step_m for j in range(ny)]  # north row first (image order)
    wx = _axis_weights(xs, cx)
    wy = _axis_weights(ys, cy)

    cloud_v = ds.variables[_find(ds, "cloud_area_fraction")]
    pr_v = ds.variables[_find(ds, "precipitation_amount")]
    t_v = ds.variables[_find(ds, "air_temperature")]
    t_times = _times(ds, cloud_v.dims[0])
    p_times = _times(ds, pr_v.dims[0])
    cloud, pr, temp = cloud_v.values(), pr_v.values(), t_v.values()
    plane = sx * sy

    def sample(arr: array, k: int, i: int, fx: float, j: int, fy: float) -> float:
        o = k * plane + j * sx + i
        a, b, c, d = arr[o], arr[o + 1], arr[o + sx], arr[o + sx + 1]
        if a >= MISSING or b >= MISSING or c >= MISSING or d >= MISSING:
            return math.nan
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

    out = []
    for k, t in enumerate(t_times):
        kp = p_times.index(t) if t in p_times else -1
        rgb = bytearray(nx * ny * 3)
        o = 0
        for j, fy in wy:
            for i, fx in wx:
                if i < 0 or j < 0:
                    rgb[o : o + 3] = b"\xff\x00\x00"
                else:
                    cl = sample(cloud, k, i, fx, j, fy)
                    tc = sample(temp, k, i, fx, j, fy)
                    p = sample(pr, kp, i, fx, j, fy) * 3600 if kp >= 0 else 0.0
                    if math.isnan(cl):
                        rgb[o : o + 3] = b"\xff\x00\x00"
                    else:
                        rgb[o] = max(0, min(250, round(cl * 250)))
                        rgb[o + 1] = 0 if math.isnan(p) or p < 0.02 else max(1, min(255, round(math.sqrt(p) * 50)))
                        rgb[o + 2] = 0 if math.isnan(tc) else max(0, min(255, round((tc - 273.15 + 50) * 2)))
                o += 3
        img = Image.frombytes("RGB", (nx, ny), bytes(rgb))
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        out.append((t, buf.getvalue()))

    meta = {
        "extent": [x0, y0, x1, y1],
        "step": step_m,
        "nx": nx,
        "ny": ny,
        "order": "row-major, north row first (image order); cell centres",
        "encoding": {
            "cloud": "R: 0..250 = 0..100 %, 255 = no data",
            "pr": "G: sqrt(mm/h) * 50",
            "t": "B: (degC + 50) * 2",
        },
    }
    return meta, out


def fetch(extent: str = "fi", hours: int = 24) -> tuple[datetime, dict, list[tuple[datetime, bytes]]]:
    origin = latest_origin()
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    nc = download(origin, start, hours, extent)
    meta, frames = rasters(nc, extent)
    return origin, meta, frames


__all__ = ["fetch", "latest_origin", "rasters", "iso"]
