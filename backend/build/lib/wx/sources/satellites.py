"""Visible passes of the space stations over the sky slide's site (central Finland).

Orbital elements: CelesTrak GP data (TLE), cached for 12 h in STATE_DIR (CelesTrak asks
clients not to refetch unchanged data more often than every couple of hours). Positions:
SGP4 (`sgp4` package). A pass point is visible when the satellite is at least 10° up, the
observer's sun is at least 6° below the horizon and the satellite is outside Earth's
shadow (cylindrical shadow model). Brightness is estimated from a standard magnitude
(at 1000 km, 50 % illuminated) with a diffuse-sphere phase function, as Heavens-Above does.
"""

import logging
import math
from datetime import datetime, timedelta, timezone

import numpy as np

from .. import net, settings
from ..store import iso

log = logging.getLogger(__name__)

SITE = (63.5, 26.0)  # same as SKY_SITE in frontend/src/lib/sky.ts
# NORAD id -> (Finnish name, English name, standard magnitude)
SATS = {
    25544: ("ISS", "ISS", -1.8),
    48274: ("Tiangong", "Tiangong", -0.5),
}
STEP_S = 20
DAYS = 21
MIN_ALT = 10.0
MAX_SUN = -6.0
RE = 6378.137
E2 = 0.00669437999014
TLE_URL = "https://celestrak.org/NORAD/elements/gp.php"


# ---------------------------------------------------------------- elements


def _cache_path(norad: int):
    return settings.STATE_DIR / f"tle_{norad}.txt"


def tle(norad: int, max_age_h: float = 12) -> tuple[str, str]:
    p = _cache_path(norad)
    try:
        if p.exists() and datetime.now().timestamp() - p.stat().st_mtime < max_age_h * 3600:
            return parse_tle(p.read_text())
    except (OSError, ValueError):
        pass
    try:
        text = net.get(TLE_URL, {"CATNR": norad, "FORMAT": "TLE"}).text
        lines = parse_tle(text)
    except Exception:
        if p.exists():  # stale elements are still fine for a few days
            log.warning("tle %s: fetch failed, using cached elements", norad)
            return parse_tle(p.read_text())
        raise
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)
    return lines


def parse_tle(text: str) -> tuple[str, str]:
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    l1 = next(ln for ln in lines if ln.startswith("1 "))
    l2 = next(ln for ln in lines if ln.startswith("2 "))
    return l1, l2


# ---------------------------------------------------------------- geometry


def gmst(jd: np.ndarray) -> np.ndarray:
    """Greenwich mean sidereal time (rad), IAU 1982 (same as SGP4's gstime)."""
    t = (jd - 2451545.0) / 36525.0
    s = -6.2e-6 * t**3 + 0.093104 * t**2 + (876600.0 * 3600 + 8640184.812866) * t + 67310.54841
    return np.mod(np.radians(s / 240.0), 2 * np.pi)


def sun_dir(jd: np.ndarray) -> np.ndarray:
    """Unit vector to the sun in the equatorial frame (low-precision almanac formula), shape (n, 3)."""
    n = jd - 2451545.0
    L = np.radians(280.460 + 0.9856474 * n)
    g = np.radians(357.528 + 0.9856003 * n)
    lam = L + np.radians(1.915) * np.sin(g) + np.radians(0.020) * np.sin(2 * g)
    eps = np.radians(23.439 - 0.0000004 * n)
    return np.stack([np.cos(lam), np.cos(eps) * np.sin(lam), np.sin(eps) * np.sin(lam)], axis=1)


def observer(lat: float, lon: float, jd: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Observer position (km, equatorial frame) and local sidereal angle theta, per time."""
    phi = math.radians(lat)
    N = RE / math.sqrt(1 - E2 * math.sin(phi) ** 2)
    theta = gmst(jd) + math.radians(lon)
    xy = N * math.cos(phi)
    pos = np.stack([xy * np.cos(theta), xy * np.sin(theta), np.full_like(theta, N * (1 - E2) * math.sin(phi))], axis=1)
    return pos, theta


def topocentric(vec: np.ndarray, lat: float, theta: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Altitude and azimuth (degrees, azimuth from north) of direction vectors (n, 3)."""
    phi = math.radians(lat)
    sp, cp = math.sin(phi), math.cos(phi)
    ct, st = np.cos(theta), np.sin(theta)
    x, y, z = vec[:, 0], vec[:, 1], vec[:, 2]
    s = sp * ct * x + sp * st * y - cp * z
    e = -st * x + ct * y
    zz = cp * ct * x + cp * st * y + sp * z
    r = np.sqrt(s * s + e * e + zz * zz)
    alt = np.degrees(np.arcsin(np.clip(zz / r, -1, 1)))
    az = np.mod(np.degrees(np.arctan2(e, -s)), 360)
    return alt, az


def magnitude(std: float, rng_km: np.ndarray, phase: np.ndarray) -> np.ndarray:
    """Diffuse sphere: std magnitude is at 1000 km and phase angle 90° (half lit)."""
    f = np.sin(phase) + (np.pi - phase) * np.cos(phase)
    return std + 5 * np.log10(rng_km / 1000.0) - 2.5 * np.log10(np.maximum(f, 1e-3))


# ---------------------------------------------------------------- passes


def passes(l1: str, l2: str, std_mag: float, start: datetime, days: float = DAYS, site=SITE) -> list[dict]:
    from sgp4.api import Satrec

    sat = Satrec.twoline2rv(l1, l2)
    n = int(days * 86400 / STEP_S)
    t0 = start.timestamp()
    ts = t0 + np.arange(n) * STEP_S
    jd_all = ts / 86400.0 + 2440587.5
    jd = np.floor(jd_all - 0.5) + 0.5
    fr = jd_all - jd
    err, pos, _ = sat.sgp4_array(jd, fr)
    ok = err == 0
    lat, lon = site
    obs, theta = observer(lat, lon, jd_all)
    rel = pos - obs
    alt, az = topocentric(rel, lat, theta)
    sun = sun_dir(jd_all)
    sun_alt, _ = topocentric(sun, lat, theta)
    along = np.einsum("ij,ij->i", pos, sun)
    perp = np.linalg.norm(pos - along[:, None] * sun, axis=1)
    lit = (along > 0) | (perp > RE)
    vis = ok & (alt >= MIN_ALT) & lit & (sun_alt <= MAX_SUN)
    rng = np.linalg.norm(rel, axis=1)
    to_sun = sun * 1.496e8 - pos
    to_obs = -rel
    cosb = np.einsum("ij,ij->i", to_sun, to_obs) / (np.linalg.norm(to_sun, axis=1) * rng)
    mag = magnitude(std_mag, rng, np.arccos(np.clip(cosb, -1, 1)))

    out = []
    idx = np.flatnonzero(vis)
    if not len(idx):
        return out
    breaks = np.flatnonzero(np.diff(idx) > 1)
    for seg in np.split(idx, breaks + 1):
        if len(seg) < 3:  # under a minute: not worth listing
            continue
        a, b = seg[0], seg[-1]
        k = seg[np.argmax(alt[seg])]
        nxt = b + 1
        fades = bool(nxt < n and alt[nxt] >= MIN_ALT and not lit[nxt])
        step = max(1, len(seg) // 24)
        track = [[round(float(alt[i]), 1), round(float(az[i]), 1)] for i in seg[::step]]
        if track[-1] != [round(float(alt[b]), 1), round(float(az[b]), 1)]:
            track.append([round(float(alt[b]), 1), round(float(az[b]), 1)])
        when = lambda i: iso(datetime.fromtimestamp(float(ts[i]), timezone.utc))  # noqa: E731
        out.append(
            {
                "start": when(a),
                "end": when(b),
                "startAz": round(float(az[a])),
                "startAlt": round(float(alt[a])),
                "endAz": round(float(az[b])),
                "endAlt": round(float(alt[b])),
                "max": when(k),
                "maxAlt": round(float(alt[k])),
                "maxAz": round(float(az[k])),
                "mag": round(float(np.min(mag[seg])), 1),
                "fades": fades,
                "track": track,
            }
        )
    return out


def all_passes(sites: dict[str, tuple[float, float]], now: datetime | None = None) -> dict:
    """Visible passes for each site (id -> (lat, lon)); visibility depends strongly on latitude
    (the ISS barely clears 10° north of ~64° N), so every site gets its own list."""
    now = (now or datetime.now(timezone.utc)).replace(microsecond=0)
    start = now - timedelta(minutes=15)  # keep a pass that is under way
    elements = {}
    for norad in SATS:
        try:
            elements[norad] = tle(norad)
        except Exception as e:
            log.warning("tle %s failed: %s", norad, e)
    if not elements:
        raise RuntimeError("no orbital elements")
    out: dict[str, list[dict]] = {}
    for sid, site in sites.items():
        lst = []
        for norad, (l1, l2) in elements.items():
            fi, en, std = SATS[norad]
            lst += [{"id": norad, "name": {"fi": fi, "en": en}, **p} for p in passes(l1, l2, std, start, site=site)]
        lst.sort(key=lambda p: p["start"])
        out[sid] = lst
    return {"updated": iso(now), "days": DAYS, "minAlt": MIN_ALT, "sites": out}
