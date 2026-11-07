"""Space weather beyond aurora: the Sun (SDO images + NOAA active regions), sunspot number,
solar cycle, flares (GOES X-rays), protons and the NOAA R/S/G scales.

Sources: NASA SDO quick-look images (free to use with credit), NOAA SWPC JSON (public domain).
"""

import io
import math
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import numpy as np

from .. import net

SWPC = "https://services.swpc.noaa.gov"
SDO = "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_{}.jpg"

# Output images: square, Sun centred, disk radius = DISK_R × size
IMG_SIZE = 720
DISK_R = 0.40
# The quick-look JPEGs carry a caption at the bottom; rows from here down are blanked
CAPTION_Y = 972
# AIA quick-look plate scale (arcsec per pixel at 1024 px)
AIA_SCALE = 2.4


def _t(s: str | None) -> str | None:
    if not s:
        return None
    s = s.replace(" ", "T").split(".")[0]
    return s if s.endswith("Z") else s + "Z"


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# --- solar geometry -------------------------------------------------------------------------

def _jd(t: datetime) -> float:
    return t.timestamp() / 86400.0 + 2440587.5


def sun_geometry(t: datetime) -> tuple[float, float]:
    """(B0 in degrees, apparent radius in arcsec) — low-precision (Meeus), plenty for labels."""
    d = _jd(t) - 2451545.0
    g = math.radians((357.529 + 0.98560028 * d) % 360)
    q = (280.459 + 0.98564736 * d) % 360
    lam = q + 1.915 * math.sin(g) + 0.020 * math.sin(2 * g)
    dist = 1.00014 - 0.01671 * math.cos(g) - 0.00014 * math.cos(2 * g)
    omega = 73.6667 + 1.3958333 * (_jd(t) - 2396758.0) / 36525.0
    b0 = math.degrees(math.asin(math.sin(math.radians(lam - omega)) * math.sin(math.radians(7.25))))
    return b0, 959.63 / dist


def disk_xy(lat: float, lon: float, b0: float) -> tuple[float, float, bool]:
    """Heliographic lat / central-meridian distance (deg, west +) -> disk (x right, y up) in radii."""
    la, lo, b = map(math.radians, (lat, lon, b0))
    x = math.cos(la) * math.sin(lo)
    y = math.sin(la) * math.cos(b) - math.cos(la) * math.cos(lo) * math.sin(b)
    z = math.sin(la) * math.sin(b) + math.cos(la) * math.cos(lo) * math.cos(b)
    return x, y, z > 0


def rotation_deg_per_day(lat: float) -> float:
    """Synodic differential rotation (Snodgrass sidereal rate minus Earth's orbital motion)."""
    s2 = math.sin(math.radians(lat)) ** 2
    return 14.713 - 2.396 * s2 - 1.787 * s2 * s2 - 0.9856


# --- images ---------------------------------------------------------------------------------

def _limb(a: np.ndarray, thresh: float) -> tuple[float, float, float]:
    """Centre and radius of a bright disk (pixels): width from the widest extent above the
    threshold, centre row from the top edge (the bottom may run into the caption)."""
    m = a[:CAPTION_Y] > thresh
    xs = np.nonzero(m.any(axis=0))[0]
    ys = np.nonzero(m.any(axis=1))[0]
    r = (xs[-1] - xs[0] + 1) / 2
    return float((xs[0] + xs[-1]) / 2), float(ys[0] + r - 0.5), float(r)


def _blank_caption(arr: np.ndarray, cx: float, cy: float, r: float) -> np.ndarray:
    """Black out the caption rows, but only outside the disk."""
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[CAPTION_Y:h, 0:w]
    out = arr.copy()
    out[CAPTION_Y:][np.hypot(xx - cx, yy - cy) > r * 1.01] = 0
    return out


def recentre(img, cx: float, cy: float, r: float):
    """Crop/pad so the disk is centred with radius DISK_R × IMG_SIZE (black outside the source)."""
    from PIL import Image

    half = r / DISK_R / 2
    box = (cx - half, cy - half, cx + half, cy + half)
    return img.transform((IMG_SIZE, IMG_SIZE), Image.Transform.EXTENT, box, Image.Resampling.BICUBIC, fillcolor=(0, 0, 0))


def find_spots(lum: np.ndarray, cx: float, cy: float, r: float, block: int = 4) -> list[dict]:
    """Dark sunspot clusters on a continuum image. Brightness is normalised by the
    limb-darkening profile (median per radius), spots are pixels below 82 % of it, and
    blocks of spot pixels are grouped by 8-connectivity with a 3-block gap allowance."""
    h, w = lum.shape
    yy, xx = np.mgrid[0:h, 0:w]
    rho = np.hypot(xx - cx, yy - cy) / r
    inside = rho < 0.96
    bins = np.minimum((rho * 100).astype(int), 99)
    prof = np.zeros(100)
    for b in range(96):
        sel = inside & (bins == b)
        if sel.any():
            prof[b] = np.median(lum[sel])
    ratio = np.where(inside, lum / np.maximum(prof[bins], 1), 1)
    dark = ratio < 0.82
    # downsample to blocks
    hb, wb = h // block, w // block
    db = dark[: hb * block, : wb * block].reshape(hb, block, wb, block).sum(axis=(1, 3))
    pts = list(zip(*np.nonzero(db)))
    if not pts:
        return []
    # union-find over blocks within 3 blocks of each other (group spots of one region)
    parent = list(range(len(pts)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    idx = {p: i for i, p in enumerate(pts)}
    for i, (py, px) in enumerate(pts):
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                j = idx.get((py + dy, px + dx))
                if j is not None:
                    a, b = find(i), find(j)
                    if a != b:
                        parent[a] = b
    groups: dict[int, list[tuple[int, int, int]]] = {}
    for i, (py, px) in enumerate(pts):
        groups.setdefault(find(i), []).append((py, px, int(db[py, px])))
    out = []
    for g in groups.values():
        n = sum(c for _, _, c in g)
        if n < 4:  # a few stray pixels: noise
            continue
        gy = sum((py + 0.5) * block * c for py, _, c in g) / n
        gx = sum((px + 0.5) * block * c for _, px, c in g) / n
        out.append({"x": (gx - cx) / r, "y": -(gy - cy) / r, "px": n})
    out.sort(key=lambda s: -s["px"])
    return out


def _fetch_sdo(code: str) -> tuple[bytes, datetime]:
    r = net.get(SDO.format(code))
    lm = r.headers.get("last-modified")
    t = parsedate_to_datetime(lm) if lm else datetime.now(timezone.utc)
    return r.content, t


def sun_images() -> dict:
    """{'hmi': (jpeg bytes, meta), 'aia193': (...)}, recentred to a common geometry, plus spots."""
    from PIL import Image

    out = {}
    raw, t = _fetch_sdo("HMIIC")
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    a = np.asarray(img).astype(np.float32)
    lum = a.mean(axis=2)
    cx, cy, r = _limb(lum, 40)
    spots = find_spots(lum, cx, cy, r)
    arr = _blank_caption(np.asarray(img), cx, cy, r)
    out["hmi"] = (_jpeg(recentre(Image.fromarray(arr), cx, cy, r)), {"time": t, "spots": spots})

    raw, t = _fetch_sdo("0193")
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    _, rsec = sun_geometry(t)
    acx, acy, ar = img.width / 2, img.height / 2, rsec / AIA_SCALE
    arr = _blank_caption(np.asarray(img), acx, acy, ar)
    out["aia193"] = (_jpeg(recentre(Image.fromarray(arr), acx, acy, ar)), {"time": t})
    return out


def _jpeg(img) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=84, optimize=True, progressive=True)
    return buf.getvalue()


# --- active regions -------------------------------------------------------------------------

def parse_regions(rows: list[dict]) -> tuple[str | None, list[dict]]:
    """Latest day's NOAA active regions."""
    if not rows:
        return None, []
    day = max(r["observed_date"] for r in rows)
    out = []
    for r in rows:
        if r["observed_date"] != day or r.get("latitude") is None or r.get("longitude") is None:
            continue
        out.append({
            "num": r["region"],
            "lat": r["latitude"],
            # SWPC gives east as +; we use west +
            "lon": -r["longitude"],
            "area": r.get("area") or 0,
            "spots": r.get("number_spots") or 0,
            "cls": r.get("spot_class"),
            "mag": r.get("mag_class"),
            "c": r.get("c_flare_probability"),
            "m": r.get("m_flare_probability"),
            "x": r.get("x_flare_probability"),
            "flares": {"c": r.get("c_xray_events") or 0, "m": r.get("m_xray_events") or 0, "x": r.get("x_xray_events") or 0},
        })
    out.sort(key=lambda r: -r["area"])
    return day, out


def place_regions(regions: list[dict], day: str, t: datetime, spots: list[dict]) -> list[dict]:
    """Rotate region positions to the image time and snap them to detected spot groups.

    The daily region list gives positions valid at the end of its date (~00 UT next day, judging
    by the daily drift against the images), so rotate by (t − that)."""
    valid = datetime.fromisoformat(day).replace(tzinfo=timezone.utc) + timedelta(days=1)
    dt_days = (t - valid).total_seconds() / 86400
    b0, _ = sun_geometry(t)
    free = list(spots)
    out = []
    for r in regions:
        lon = r["lon"] + rotation_deg_per_day(r["lat"]) * dt_days
        x, y, front = disk_xy(r["lat"], lon, b0)
        if not front or math.hypot(x, y) > 0.995:
            continue
        snapped = False
        if r["spots"] and free:
            best = min(free, key=lambda s: math.hypot(s["x"] - x, s["y"] - y))
            if math.hypot(best["x"] - x, best["y"] - y) < 0.2:
                x, y, snapped = best["x"], best["y"], True
                free.remove(best)
        out.append({**r, "dx": round(x, 4), "dy": round(y, 4), "snapped": snapped})
    return out


# --- indices --------------------------------------------------------------------------------

def daily_ssn() -> dict | None:
    rows = net.get_json(f"{SWPC}/json/solar-cycle/swpc_observed_ssn.json")
    if not rows:
        return None
    last = max(rows, key=lambda r: r["Obsdate"])
    return {"date": last["Obsdate"][:10], "ssn": last["swpc_ssn"]}


def f107() -> dict | None:
    rows = net.get_json(f"{SWPC}/json/f107_cm_flux.json")
    rows = [r for r in rows if r.get("frequency") == 2800 and r.get("flux") is not None]
    if not rows:
        return None
    last = max(rows, key=lambda r: r["time_tag"])
    mean = next((r["ninety_day_mean"] for r in sorted(rows, key=lambda r: r["time_tag"], reverse=True) if r.get("ninety_day_mean")), None)
    return {"time": _t(last["time_tag"]), "flux": last["flux"], "mean90": mean}


def parse_cycle(observed: list[dict], predicted: list[dict], since: str = "2008-01") -> dict:
    """Monthly sunspot numbers since the start of cycle 24 + SWPC's prediction."""
    obs = [[r["time-tag"], r["ssn"], r["smoothed_ssn"] if r["smoothed_ssn"] >= 0 else None] for r in observed if r["time-tag"] >= since and r["ssn"] >= 0]
    pred = [[r["time-tag"], r["predicted_ssn"], r["low_ssn"], r["high_ssn"]] for r in predicted]
    return {"observed": obs, "predicted": pred}


def cycle() -> dict:
    return parse_cycle(
        net.get_json(f"{SWPC}/json/solar-cycle/observed-solar-cycle-indices.json"),
        net.get_json(f"{SWPC}/json/solar-cycle/predicted-solar-cycle.json"),
    )


def probabilities() -> dict | None:
    rows = net.get_json(f"{SWPC}/json/solar_probabilities.json")
    if not rows:
        return None
    r = max(rows, key=lambda r: r["date"])
    return {
        "date": r["date"][:10],
        "c": [r[f"c_class_{d}_day"] for d in (1, 2, 3)],
        "m": [r[f"m_class_{d}_day"] for d in (1, 2, 3)],
        "x": [r[f"x_class_{d}_day"] for d in (1, 2, 3)],
        "proton": [r[f"10mev_protons_{d}_day"] for d in (1, 2, 3)],
    }


def series(rows: list[dict], key: str, value: str, step_min: int = 5) -> dict | None:
    """Max per step of a 1-min GOES series (keeps flare peaks), as log10 values."""
    pts = [(r["time_tag"], r.get(value)) for r in rows if r.get(key[0]) == key[1]]
    pts = [(_dt(_t(t)), v) for t, v in pts if v is not None and v > 0]
    if not pts:
        return None
    pts.sort()
    t0 = pts[0][0].replace(second=0, microsecond=0)
    t0 -= timedelta(minutes=t0.minute % step_min)
    n = int((pts[-1][0] - t0).total_seconds() // (step_min * 60)) + 1
    vals: list[float | None] = [None] * n
    for t, v in pts:
        i = int((t - t0).total_seconds() // (step_min * 60))
        vals[i] = v if vals[i] is None else max(vals[i], v)
    return {"start": t0.strftime("%Y-%m-%dT%H:%M:%SZ"), "step": step_min, "log": [None if v is None else round(math.log10(v), 3) for v in vals]}


def xray() -> dict | None:
    rows = net.get_json(f"{SWPC}/json/goes/primary/xrays-1-day.json")
    return series(rows, ("energy", "0.1-0.8nm"), "flux")


def protons() -> dict | None:
    rows = net.get_json(f"{SWPC}/json/goes/primary/integral-protons-1-day.json")
    return series(rows, ("energy", ">=10 MeV"), "flux")


def flare_class_value(c: str | None) -> float:
    """'M2.4' -> W/m² peak flux."""
    if not c:
        return 0.0
    base = {"A": 1e-8, "B": 1e-7, "C": 1e-6, "M": 1e-5, "X": 1e-4}.get(c[0].upper())
    try:
        return base * float(c[1:]) if base else 0.0
    except ValueError:
        return base or 0.0


def flares(rows: list[dict], now: datetime, days: int = 7) -> list[dict]:
    """C-class and bigger flares of the last week, newest first."""
    cutoff = now - timedelta(days=days)
    out = []
    for r in rows:
        c = r.get("max_class")
        if not c or c[0] not in "CMX" or not r.get("max_time"):
            continue
        t = _dt(_t(r["max_time"]))
        if t < cutoff:
            continue
        out.append({"begin": _t(r.get("begin_time")), "max": _t(r["max_time"]), "end": _t(r.get("end_time")), "cls": c})
    out.sort(key=lambda f: f["max"], reverse=True)
    return out


def parse_scales(d: dict) -> dict:
    """NOAA scales: '-1' = yesterday's max, '0' = now, '1'..'3' = forecast for today, tomorrow, day after."""

    def num(v):
        return None if v in (None, "") else int(v)

    def day(k: str) -> dict:
        x = d.get(k) or {}
        return {
            "date": x.get("DateStamp"),
            "r": num((x.get("R") or {}).get("Scale")),
            "s": num((x.get("S") or {}).get("Scale")),
            "g": num((x.get("G") or {}).get("Scale")),
            "rMinor": num((x.get("R") or {}).get("MinorProb")),
            "rMajor": num((x.get("R") or {}).get("MajorProb")),
            "sProb": num((x.get("S") or {}).get("Prob")),
        }

    return {"yesterday": day("-1"), "now": day("0"), "forecast": [day(k) for k in ("1", "2", "3")]}


def scales() -> dict:
    return parse_scales(net.get_json(f"{SWPC}/products/noaa-scales.json"))
