"""VHF/UHF tropospheric propagation (ducting) forecast computed from FMI HARMONIE model levels.

Source: FMI open data, producer `harmonie_scandinavia_hybrid` (CC BY 4.0): temperature, relative
humidity, pressure and height above ground on the lowest 26 model levels (65 = ~12 m … 40 = ~1.6 km).

Per model column:
  N  = 77.6 / T · (p + 4810 · e / T)          radio refractivity (ITU-R P.453), p and e in hPa
  M  = N + 0.157 · h                            modified refractivity, h in metres
  g  = min dN/dh over the layers               steepest refractivity gradient, N-units per km
  dM = max over levels of (max M below) − M    "M-deficit": > 0 means a trapping layer (duct)

and a 0–10 tropo index for the map:
  no duct:  0 … 5 as g goes from the standard atmosphere (−40 N/km) to the trapping limit (−157 N/km)
  duct:     5 … 10 as dM goes from 0 to 20 M-units

Frames are resampled onto the map extent's 5 km grid and packed into PNGs:
  R  index · 25          (0..250, 255 = no data)
  G  duct top height / 10 m   (0 = no duct, 1..255 = 10 m .. 2550 m)
  B  unused (0)

The index is smoothed over 3×3 model cells (~15 km) first: single valleys and thin surface layers
make it speckly, and the map is about regional conditions.
"""

import io
import logging
import re
from datetime import datetime, timedelta, timezone

import numpy as np
from PIL import Image

from .. import net, proj
from ..netcdf3 import Dataset
from .fmi import _fmt, _wfs

log = logging.getLogger(__name__)

DOWNLOAD = "https://opendata.fmi.fi/download"
PRODUCER = "harmonie_scandinavia_hybrid"
PARAMS = "Temperature,Humidity,Pressure,GeomHeight"
LEVELS = list(range(40, 66))  # 40 = ~1.6 km … 65 = ~12 m above ground
MISSING = 32700.0
STEP_M = 5000.0
# native lat/lon grid of the download, ~5 km (0.1° lon × 0.05° lat)
DLON, DLAT = 0.1, 0.05

STANDARD_G = -40.0  # N/km, standard atmosphere
TRAPPING_G = -157.0  # N/km, dM/dh = 0


def latest_origin() -> datetime:
    """Newest HARMONIE run with model-level data available."""
    t = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    xml = _wfs(
        "fmi::forecast::harmonie::hybrid::grid",
        parameters="Temperature",
        bbox="24,60,25,61",
        starttime=_fmt(t),
        endtime=_fmt(t),
    ).decode("utf-8", "replace")
    found = re.findall(r"origintime=(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)", xml)
    if not found:
        raise RuntimeError("no HARMONIE hybrid runs listed")
    return datetime.fromisoformat(max(found).replace("Z", "+00:00"))


def latlon_bbox(extent: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    """Smallest lat/lon box (lon0, lat0, lon1, lat1) containing the projected extent, with a margin."""
    x0, y0, x1, y1 = extent
    pts = [(x0 + i * (x1 - x0) / 40, y) for i in range(41) for y in (y0, y1)]
    pts += [(x, y0 + i * (y1 - y0) / 40) for i in range(41) for x in (x0, x1)]
    ll = [proj.inverse(x, y) for x, y in pts]
    lats = [a for a, _ in ll]
    lons = [b for _, b in ll]
    return (
        round(min(lons) - 0.2, 1),
        round(min(lats) - 0.1, 2),
        round(max(lons) + 0.2, 1),
        round(max(lats) + 0.1, 2),
    )


def download(origin: datetime, valid: datetime, bbox: tuple[float, float, float, float]) -> bytes:
    lon0, lat0, lon1, lat1 = bbox
    nx = int(round((lon1 - lon0) / DLON)) + 1
    ny = int(round((lat1 - lat0) / DLAT)) + 1
    return net.get_bytes(
        DOWNLOAD,
        {
            "producer": PRODUCER,
            "param": PARAMS,
            "bbox": f"{lon0},{lat0},{lon1},{lat1}",
            "origintime": _fmt(origin),
            "starttime": _fmt(valid),
            "endtime": _fmt(valid),
            "levels": ",".join(map(str, LEVELS)),
            "format": "netcdf",
            "projection": "EPSG:4326",
            "gridsize": f"{nx},{ny}",
        },
    )


# ---------------------------------------------------------------------------------------- physics


def saturation_vapour_pressure(tc: np.ndarray) -> np.ndarray:
    """hPa over water (Magnus, Alduchov & Eskridge 1996)."""
    return 6.1094 * np.exp(17.625 * tc / (tc + 243.04))


def refractivity(t_k: np.ndarray, rh: np.ndarray, p_pa: np.ndarray) -> np.ndarray:
    e = np.clip(rh, 0.0, 1.0) * saturation_vapour_pressure(t_k - 273.15)
    return 77.6 / t_k * (p_pa / 100.0 + 4810.0 * e / t_k)


def column_metrics(t_k: np.ndarray, rh: np.ndarray, p_pa: np.ndarray, z_m: np.ndarray) -> dict[str, np.ndarray]:
    """Arrays shaped (levels, ...) with the lowest level first. Returns per-column g, dM, duct top, index."""
    n = refractivity(t_k, rh, p_pa)
    m = n + 0.157 * z_m
    dz = np.diff(z_m, axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        g = np.where(dz > 1.0, np.diff(n, axis=0) / dz * 1000.0, np.nan)
    valid = ~np.isnan(m).any(axis=0)
    g_min = np.where(valid, np.nanmin(np.where(np.isnan(g), np.inf, g), axis=0), np.nan)
    # M-deficit: how far M drops below the largest value found lower down
    running_max = np.maximum.accumulate(np.where(np.isnan(m), -np.inf, m), axis=0)
    deficit = running_max - m
    d_m = np.where(valid, np.nanmax(np.where(np.isnan(deficit), -np.inf, deficit), axis=0), np.nan)
    top_i = np.argmax(np.where(np.isnan(deficit), -np.inf, deficit), axis=0)
    duct_top = np.where(valid & (d_m > 0), np.take_along_axis(z_m, top_i[None], axis=0)[0], 0.0)
    idx = np.where(
        d_m > 0,
        5.0 + np.clip(d_m / 4.0, 0.0, 5.0),
        np.clip((STANDARD_G - g_min) / (STANDARD_G - TRAPPING_G) * 5.0, 0.0, 5.0),
    )
    idx = np.where(valid, idx, np.nan)
    return {"g": g_min, "dm": d_m, "top": duct_top, "index": idx}


# ---------------------------------------------------------------------------------------- grids


def _var(ds: Dataset, prefix: str, shape: tuple[int, ...]) -> np.ndarray:
    for name, v in ds.variables.items():
        if name.startswith(prefix):
            a = np.frombuffer(v.values(), dtype=np.float32).astype(np.float64).reshape(shape)
            a[a == MISSING] = np.nan
            return a
    raise RuntimeError(f"no {prefix}* variable in download")


def metrics_from_netcdf(nc: bytes) -> tuple[np.ndarray, np.ndarray, dict[str, np.ndarray]]:
    """(lats, lons, metrics) on the download's lat/lon grid."""
    ds = Dataset(nc)
    lv = np.array(ds.variables["hybrid"].values())
    lats = np.array(ds.variables["lat"].values(), dtype=np.float64)
    lons = np.array(ds.variables["lon"].values(), dtype=np.float64)
    shape = (len(lv), len(lats), len(lons))
    order = np.argsort(-lv)  # highest level number = lowest in the atmosphere first
    t = _var(ds, "air_temperature", shape)[order]
    rh = _var(ds, "relative_humidity", shape)[order]
    p = _var(ds, "air_pressure", shape)[order]  # labelled "at sea level" but is the level pressure
    z = _var(ds, "geometrical_height", shape)[order]
    return lats, lons, column_metrics(t, rh, p, z)


class Resampler:
    """Bilinear lookup from a regular lat/lon grid onto the cell centres of a projected extent."""

    def __init__(self, extent: tuple[float, float, float, float], step_m: float = STEP_M):
        x0, y0, x1, y1 = extent
        self.extent = extent
        self.step = step_m
        self.nx = int(round((x1 - x0) / step_m))
        self.ny = int(round((y1 - y0) / step_m))
        lat = np.empty((self.ny, self.nx))
        lon = np.empty((self.ny, self.nx))
        for j in range(self.ny):
            y = y1 - (j + 0.5) * step_m  # north row first (image order)
            for i in range(self.nx):
                lat[j, i], lon[j, i] = proj.inverse(x0 + (i + 0.5) * step_m, y)
        self.lat, self.lon = lat, lon
        self._axes: tuple | None = None

    def sample(self, lats: np.ndarray, lons: np.ndarray, field: np.ndarray) -> np.ndarray:
        def axis(src: np.ndarray, dst: np.ndarray):
            asc = src[-1] > src[0]
            s = src if asc else src[::-1]
            g = (dst - s[0]) / (s[1] - s[0])
            inside = (g >= 0) & (g <= len(s) - 1)
            i = np.clip(np.floor(g).astype(int), 0, len(s) - 2)
            f = np.clip(g - i, 0.0, 1.0)
            if not asc:
                # index into the original (descending) order
                i, f = len(s) - 2 - i, 1.0 - f
            return i, f, inside

        if self._axes is None or self._axes[0] is not lats or self._axes[1] is not lons:
            self._axes = (lats, lons, axis(lats, self.lat), axis(lons, self.lon))
        _, _, (jy, fy, iny), (ix, fx, inx) = self._axes
        a = field[jy, ix]
        b = field[jy, ix + 1]
        c = field[jy + 1, ix]
        d = field[jy + 1, ix + 1]
        out = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
        return np.where(iny & inx, out, np.nan)  # NaN in any corner propagates


def smooth3(a: np.ndarray) -> np.ndarray:
    """NaN-aware 3×3 mean; cells that are NaN stay NaN."""
    v = np.nan_to_num(a)
    w = (~np.isnan(a)).astype(np.float64)
    pv = np.pad(v, 1)
    pw = np.pad(w, 1)
    ny, nx = a.shape
    sv = sum(pv[dj : dj + ny, di : di + nx] for dj in range(3) for di in range(3))
    sw = sum(pw[dj : dj + ny, di : di + nx] for dj in range(3) for di in range(3))
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(np.isnan(a), np.nan, sv / sw)


def pack_png(index: np.ndarray, top: np.ndarray) -> bytes:
    nan = np.isnan(index)
    r = np.where(nan, 255, np.clip(np.round(np.nan_to_num(index) * 25), 0, 250))
    gg = np.where(nan | (np.nan_to_num(top) <= 0), 0, np.clip(np.round(np.nan_to_num(top) / 10), 1, 255))
    rgb = np.stack([r, gg, np.zeros_like(r)], axis=-1).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgb, "RGB").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def frame(origin: datetime, valid: datetime, rs: Resampler) -> tuple[bytes, dict]:
    """Download, compute and pack one forecast time. Returns (png, summary)."""
    nc = download(origin, valid, latlon_bbox(rs.extent))
    lats, lons, m = metrics_from_netcdf(nc)
    idx = rs.sample(lats, lons, smooth3(m["index"]))
    # nearest-ish: a duct top is a property of one column, averaging it with "no duct" (0) is meaningless
    top = rs.sample(lats, lons, np.where(m["top"] > 0, m["top"], np.nan))
    ok = ~np.isnan(idx)
    summary = {
        "bytes": len(nc),
        "max": round(float(np.nanmax(idx)), 1) if ok.any() else None,
        "duct_share": round(float(np.mean(idx[ok] > 5)), 3) if ok.any() else 0.0,
    }
    return pack_png(idx, top), summary


def meta(rs: Resampler) -> dict:
    return {
        "extent": list(rs.extent),
        "step": rs.step,
        "nx": rs.nx,
        "ny": rs.ny,
        "order": "row-major, north row first (image order); cell centres",
        "encoding": {
            "index": "R: 0..250 = tropo index 0..10 (×25), 255 = no data",
            "top": "G: duct top height / 10 m, 0 = no duct",
            "smoothing": "index: 3x3 model cells",
        },
    }
