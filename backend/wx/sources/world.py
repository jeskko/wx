"""World map views: ECMWF (via FMI open data) fields resampled into per-view LAEA rasters.

Views are the regions and capitals of wx/world.json. For each view we download the ECMWF
0.25° lat/lon field covering it (NetCDF from FMI's download service), resample onto the
view's own grid and write one RGB PNG per forecast step:

The image is 2 * ny rows high. Top half (rows 0..ny-1, north row first):
  R  temperature   (°C + 60) * 2      (-60 .. +67 °C; 255 = no data)
  G  precipitation sqrt(mm/h) * 50    (0 = dry)
  B  0
Bottom half (same layout), wind rotated to the view's grid axes:
  R  u (grid east)  (m/s + 64) * 2
  G  v (grid north) (m/s + 64) * 2
  B  0
(FMI's ECMWF set has no usable sea-level pressure or cloud cover.)
"""

import io
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from PIL import Image

from .. import net
from ..laea import Laea
from ..netcdf3 import Dataset
from .fmi import _fmt, _wfs

log = logging.getLogger(__name__)

WORLD = json.loads((Path(__file__).resolve().parents[1] / "world.json").read_text())
DOWNLOAD = "https://opendata.fmi.fi/download"
PARAMS = "Temperature,Precipitation1h,WindUMS,WindVMS"
STEP_H = 6
HOURS = 60
MISSING = 32700.0


def views() -> list[dict]:
    """All map views: regions + one per capital (centred on it)."""
    out = [{**r, "kind": "region"} for r in WORLD["regions"]]
    cv = WORLD["capital_view"]
    for c in WORLD["capitals"]:
        out.append({"id": f"cap-{c['id']}", "kind": "capital", "lat0": c["lat"], "lon0": c["lon"], **cv})
    return out


def polar_views() -> list[dict]:
    """Hemisphere views centred on the poles (aurora); basemaps only, no model rasters."""
    return [{**v, "kind": "region"} for v in WORLD.get("polar", [])]


def extent(v: dict) -> tuple[float, float, float, float]:
    return (-v["hw"] * 1000.0, -v["hh"] * 1000.0, v["hw"] * 1000.0, v["hh"] * 1000.0)


def latlon_box(v: dict, margin: float = 1.0) -> tuple[float, float, float, float]:
    """(lon0, lat0, lon1, lat1) covering the view; raises if it would cross the antimeridian."""
    p = Laea(v["lat0"], v["lon0"])
    x0, y0, x1, y1 = extent(v)
    lats, lons = [], []
    for i in range(41):
        f = i / 40
        for x, y in ((x0 + f * (x1 - x0), y0), (x0 + f * (x1 - x0), y1), (x0, y0 + f * (y1 - y0)), (x1, y0 + f * (y1 - y0))):
            la, lo = p.inverse(x, y)
            lats.append(la)
            # unwrap around the centre meridian
            lons.append(v["lon0"] + ((lo - v["lon0"] + 540) % 360 - 180))
    lo0, lo1 = min(lons) - margin, max(lons) + margin
    la0, la1 = max(-90.0, min(lats) - margin), min(90.0, max(lats) + margin)
    # a pole inside the view: all longitudes needed
    if p.inverse(0, 0)[0] + v["hh"] / 111 > 89 or lo1 - lo0 > 300:
        lo0, lo1 = -180.0, 180.0
    # ... and that pole's latitude (only the pole on the view's side: the antipode is degenerate)
    pole = 90.0 if v["lat0"] >= 0 else -90.0
    x, y = p.forward(pole, v["lon0"])
    if x0 <= x <= x1 and y0 <= y <= y1:
        la0, la1 = (la0, 90.0) if pole > 0 else (-90.0, la1)
    return lo0, la0, lo1, la1  # may extend past ±180 (see download)


def latest_origin() -> datetime:
    t = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) + timedelta(hours=6)
    xml = _wfs(
        "ecmwf::forecast::surface::grid",
        parameters="Temperature",
        bbox="24,60,25,61",
        starttime=_fmt(t),
        endtime=_fmt(t),
    ).decode("utf-8", "replace")
    found = re.findall(r"origintime=(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)", xml)
    if not found:
        raise RuntimeError("no ECMWF runs listed")
    return datetime.fromisoformat(max(found).replace("Z", "+00:00"))


def first_step(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now.replace(hour=now.hour - now.hour % STEP_H, minute=0, second=0, microsecond=0)


def _download_box(lo0: float, la0: float, lo1: float, la1: float, origin: datetime, start: datetime) -> bytes:
    return net.get_bytes(
        DOWNLOAD,
        {
            "producer": "ecmwf",
            "param": PARAMS,
            "bbox": f"{lo0:.2f},{la0:.2f},{lo1:.2f},{la1:.2f}",
            "origintime": _fmt(origin),
            "starttime": _fmt(start),
            "endtime": _fmt(start + timedelta(hours=HOURS)),
            "timestep": str(STEP_H * 60),
            "levels": "0",
            "format": "netcdf",
            "projection": "EPSG:4326",
        },
    )


def download(v: dict, origin: datetime, start: datetime) -> list[bytes]:
    """One NetCDF, or two when the view crosses the antimeridian (west part first)."""
    lo0, la0, lo1, la1 = latlon_box(v)
    if lo1 > 180:
        return [_download_box(lo0, la0, 180, la1, origin, start), _download_box(-180, la0, lo1 - 360, la1, origin, start)]
    if lo0 < -180:
        return [_download_box(lo0 + 360, la0, 180, la1, origin, start), _download_box(-180, la0, lo1, la1, origin, start)]
    return [_download_box(lo0, la0, lo1, la1, origin, start)]


def _times(ds: Dataset, name: str) -> list[datetime]:
    var = ds.variables[name]
    m = re.match(r"hours since (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)", var.attrs.get("units", ""))
    if not m:
        raise RuntimeError(f"unexpected time units in {name}")
    base = datetime.fromisoformat(m.group(1)).replace(tzinfo=timezone.utc)
    return [base + timedelta(hours=int(h)) for h in var.values()]


def _var(ds: Dataset, prefix: str):
    for name, var in ds.variables.items():
        if name.startswith(prefix):
            return var
    raise RuntimeError(f"no {prefix}* in download")


def _cube(var) -> np.ndarray:
    a = np.asarray(var.values(), dtype=np.float32).reshape(var.shape)
    a[a >= MISSING] = np.nan
    return a


def _load(nc: bytes):
    ds = Dataset(nc)
    lat = np.asarray(ds.variables["lat"].values(), dtype=np.float64)
    lon = np.asarray(ds.variables["lon"].values(), dtype=np.float64)
    t_v, pr_v = _var(ds, "air_temperature"), _var(ds, "precipitation_amount")
    uv = (_cube(_var(ds, "eastward_wind")), _cube(_var(ds, "northward_wind")))
    return lat, lon, _cube(t_v), uv, _cube(pr_v), _times(ds, t_v.dims[0]), _times(ds, pr_v.dims[0])


def rasters(parts: list[bytes], v: dict) -> tuple[dict, list[tuple[datetime, bytes]]]:
    lat, lon, temp, wind, prec, t_times, pr_times = _load(parts[0])
    if len(parts) == 2:
        # second part lies east of the antimeridian: continue its longitudes past 180
        lat2, lon2, t2, p2, r2, _, _ = _load(parts[1])
        if len(lat2) != len(lat):
            raise RuntimeError("antimeridian parts have different latitude axes")
        lon2 = lon2 + 360
        keep = lon2 > lon[-1] + 1e-6
        lon = np.concatenate([lon, lon2[keep]])
        temp = np.concatenate([temp, t2[..., keep]], axis=-1)
        wind = (np.concatenate([wind[0], p2[0][..., keep]], axis=-1), np.concatenate([wind[1], p2[1][..., keep]], axis=-1))
        prec = np.concatenate([prec, r2[..., keep]], axis=-1)
    # express longitudes relative to the view centre so they increase monotonically across ±180
    if lon[0] - v["lon0"] > 180:
        lon = lon - 360

    # flip to ascending axes
    if lat[0] > lat[-1]:
        lat = lat[::-1]
        temp, prec = temp[:, ::-1], prec[:, ::-1]
        wind = (wind[0][:, ::-1], wind[1][:, ::-1])

    step = v["step"] * 1000.0
    x0, y0, x1, y1 = extent(v)
    nx, ny = int(round((x1 - x0) / step)), int(round((y1 - y0) / step))
    cx = x0 + (np.arange(nx) + 0.5) * step
    cy = y1 - (np.arange(ny) + 0.5) * step  # north row first
    X, Y = np.meshgrid(cx, cy)
    proj = Laea(v["lat0"], v["lon0"])
    la, lo = proj.inverse_np(X, Y)
    # angle of true north from grid north at each cell, to rotate wind into grid axes
    xn, yn = proj.forward_np(np.minimum(la + 0.05, 89.99), lo)
    rot = np.arctan2(xn - X, yn - Y)
    cr, sr = np.cos(rot), np.sin(rot)
    lo = v["lon0"] + ((lo - v["lon0"] + 540) % 360 - 180)
    if lon[-1] > 180:
        lo = np.where(lo < lon[0], lo + 360, lo)
    # fractional source indices
    gi = (lo - lon[0]) / (lon[1] - lon[0])
    gj = (la - lat[0]) / (lat[1] - lat[0])
    inside = (gi >= 0) & (gi <= len(lon) - 1) & (gj >= 0) & (gj <= len(lat) - 1)
    i0 = np.clip(np.floor(gi).astype(int), 0, len(lon) - 2)
    j0 = np.clip(np.floor(gj).astype(int), 0, len(lat) - 2)
    fx = np.clip(gi - i0, 0, 1)
    fy = np.clip(gj - j0, 0, 1)

    def sample(plane: np.ndarray) -> np.ndarray:
        a = plane[j0, i0]
        b = plane[j0, i0 + 1]
        c = plane[j0 + 1, i0]
        d = plane[j0 + 1, i0 + 1]
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

    frames = []
    for k, t in enumerate(t_times):
        tc = sample(temp[k]) - 273.15
        ue, vn = sample(wind[0][k]), sample(wind[1][k])
        gu = ue * cr + vn * sr  # true (east, north) -> grid (x, y)
        gv = -ue * sr + vn * cr
        kp = pr_times.index(t) if t in pr_times else -1
        mm = sample(prec[kp]) * 3600 if kp >= 0 else np.zeros_like(tc)
        bad = ~inside | np.isnan(tc)
        r = np.clip(np.round((tc + 60) * 2), 0, 254)
        g = np.where(np.nan_to_num(mm) < 0.02, 0, np.clip(np.round(np.sqrt(np.clip(np.nan_to_num(mm), 0, None)) * 50), 1, 255))
        r = np.where(bad, 255, r)
        zero = np.zeros_like(r)
        top = np.stack([r, np.where(bad, 0, g), zero], axis=-1)
        enc = lambda w: np.clip(np.round((np.nan_to_num(w) + 64) * 2), 0, 255)  # noqa: E731
        bottom = np.stack([enc(gu), enc(gv), zero], axis=-1)
        rgb = np.concatenate([top, bottom], axis=0).astype(np.uint8)
        buf = io.BytesIO()
        Image.fromarray(rgb, "RGB").save(buf, format="PNG", optimize=True)
        frames.append((t, buf.getvalue()))
    meta = {
        "proj": {"type": "laea", "lat0": v["lat0"], "lon0": v["lon0"]},
        "extent": list(extent(v)),
        "step": step,
        "nx": nx,
        "ny": ny,
    }
    return meta, frames
