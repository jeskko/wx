"""HF propagation forecast: VOACAP (vendored DVOACAP-Python) from central Finland to a few world regions.

For each of the next 24 hours, region and amateur band the best mode the path supports at 50 %
reliability: 3 = SSB voice, 2 = CW, 1 = FT8, 0 = closed.

Validated against genuine VOACAP Online output (Philadelphia–London, Nov, SSN 81, 80 W, 3° minimum
angle — the settings used here): identical MUFs; SNR median error +2.3 dB, |error| median 7 dB; the
SSB/CW/FT8/closed category identical in 74 % of hour×band cells, off by more than one step in 4 %.
(With a 0.1° minimum angle the port's loss above the MUF runs 20–40 dB high, so keep the default 3°.) The engine reports SNR per 1 Hz (dB-Hz),
so the required SNRs below are in dB-Hz (SSB 44 ≈ +10 dB in 2.7 kHz, CW 24, FT8 13 ≈ −21 dB in 2.5 kHz).

Inputs from NOAA SWPC (public domain): the predicted smoothed sunspot number for the month (what
VOACAP is driven by) and the D-RAP absorption product, reported only when an X-ray / proton event
is under way (normal daytime D-layer absorption is already part of VOACAP).
"""

import logging
import math
import re
from datetime import datetime, timedelta, timezone

import numpy as np

from .. import net
from ..store import iso
from ..vendor.dvoacap.path_geometry import GeoPoint
from ..vendor.dvoacap.prediction_engine import PredictionEngine

log = logging.getLogger(__name__)

SWPC = "https://services.swpc.noaa.gov"

TX = (62.0, 25.7)  # central Finland
TX_POWER_W = 100.0
MAN_MADE_NOISE = 145.0  # dBW at 3 MHz, "residential"

# 160 m (1.84 MHz) is just below VOACAP's specified 2–30 MHz range; the engine behaves sensibly there
# (night-only, weaker than 80 m, fully absorbed by day), but treat it as an extrapolation.
BANDS = [("160m", 1.84), ("80m", 3.6), ("40m", 7.1), ("30m", 10.12), ("20m", 14.15), ("17m", 18.1), ("15m", 21.2), ("12m", 24.94), ("10m", 28.5)]

# dB-Hz; checked from the best mode down
MODES = [(3, 44.0), (2, 24.0), (1, 13.0)]

# (id, fi, en, lat, lon) — all within ~10 000 km: the port's long-path model (> 7000 km) is a stub
REGIONS = [
    ("nordic", "Pohjoismaat", "Nordics", 59.91, 10.75),
    ("eu-c", "Keski-Eurooppa", "Central Europe", 50.11, 8.68),
    ("eu-s", "Etelä-Eurooppa", "Southern Europe", 40.42, -3.70),
    ("in", "Intia", "India", 28.61, 77.21),
    ("jp", "Japani", "Japan", 35.68, 139.69),
    ("na-e", "Pohjois-Amerikka, itä", "North America, east", 40.71, -74.01),
    ("na-w", "Pohjois-Amerikka, länsi", "North America, west", 34.05, -118.24),
    ("af-s", "Etelä-Afrikka", "South Africa", -26.20, 28.05),
]

NORM_DECILE = 1.28


def km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def reliability(snr: float, snr10: float, snr90: float, required: float) -> float:
    """VOACAP circuit reliability for a required SNR (same formula as the engine's _calc_reliability)."""
    z = required - snr
    spread = snr10 if z <= 0 else snr90
    if not spread or not math.isfinite(spread) or not math.isfinite(snr):
        return 0.0
    z = z / (spread / NORM_DECILE)
    return 1.0 - 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def mode_level(snr: float, snr10: float, snr90: float) -> int:
    for level, req in MODES:
        if reliability(snr, snr10, snr90, req) >= 0.5:
            return level
    return 0


def band_signals(eng: PredictionEngine, rx: GeoPoint, utc_frac: float, freqs: list[float]) -> tuple[float | None, list[tuple[float, float, float]]]:
    """(circuit MUF, [(snr, snr10, snr90) per band])."""
    eng.predict(rx, utc_frac, list(freqs))
    muf = eng.circuit_muf.muf if eng.circuit_muf else None
    out = [(float(p.signal.snr_db), float(p.signal.snr10), float(p.signal.snr90)) for p in eng.predictions]
    return (float(muf) if muf is not None and np.isfinite(muf) else None), out


def smoothed_ssn(now: datetime, predicted: list[dict], observed: list[dict]) -> tuple[float, str]:
    """SWPC predicted smoothed SSN for this month; else the mean of the last 6 observed months."""
    tag = now.strftime("%Y-%m")
    for row in predicted:
        if row.get("time-tag") == tag and isinstance(row.get("predicted_ssn"), (int, float)):
            return float(row["predicted_ssn"]), "swpc-predicted"
    vals = [r["ssn"] for r in observed[-6:] if isinstance(r.get("ssn"), (int, float)) and r["ssn"] >= 0]
    if vals:
        return float(sum(vals) / len(vals)), "swpc-observed-6mo"
    raise RuntimeError("no sunspot number")


def parse_drap(text: str, lat: float, lon: float) -> dict:
    """D-RAP header messages and the value (MHz, highest frequency with 1 dB absorption) nearest lat/lon."""
    def header(name: str) -> str:
        m = re.search(rf"#\s*{name}\s*:\s*(.*)", text)
        return m.group(1).strip() if m else ""

    lons: list[int] = []
    best = None
    for line in text.splitlines():
        if not lons and re.match(r"^\s+-?\d+(\s+-?\d+){10,}\s*$", line):
            lons = [int(x) for x in line.split()]
            continue
        m = re.match(r"^\s*(-?\d+)\s*\|\s*(.*)$", line)
        if lons and m:
            la = int(m.group(1))
            vals = [float(x) for x in m.group(2).split()]
            for lo, v in zip(lons, vals):
                d = abs(la - lat) + abs(((lo - lon + 180) % 360) - 180) / 2
                if best is None or d < best[0]:
                    best = (d, v)
    valid = re.search(r"Valid At\s*:\s*(\d{4}-\d\d-\d\d \d\d:\d\d) UTC", text)
    xray = header("X-RAY Message")
    proton = header("Proton Message")
    return {
        "valid": valid.group(1).replace(" ", "T") + ":00Z" if valid else None,
        "xray": xray,
        "proton": proton,
        "event": bool(xray and not xray.lower().startswith("normal")) or bool(proton and not proton.lower().startswith("normal")),
        "mhz": best[1] if best else None,
    }


def predict(ssn: float, start: datetime, hours: int = 24) -> dict:
    eng = PredictionEngine()
    eng.params.tx_location = GeoPoint(lat=math.radians(TX[0]), lon=math.radians(TX[1]))
    eng.params.ssn = ssn
    eng.params.tx_power = TX_POWER_W
    eng.params.man_made_noise_at_3mhz = MAN_MADE_NOISE
    freqs = [f for _, f in BANDS]
    times = [start + timedelta(hours=h) for h in range(hours)]
    regions = []
    for rid, fi, en, lat, lon in REGIONS:
        muf: list[float | None] = []
        levels: list[str] = []
        for t in times:
            eng.params.month = t.month
            m, sig = band_signals(eng, GeoPoint(lat=math.radians(lat), lon=math.radians(lon)), (t.hour + t.minute / 60) / 24, freqs)
            muf.append(round(m, 1) if m is not None else None)
            levels.append("".join(str(mode_level(*x)) for x in sig))
        regions.append({"id": rid, "name": {"fi": fi, "en": en}, "lat": lat, "lon": lon, "km": round(km(*TX, lat, lon)), "muf": muf, "levels": levels})
    return {"times": [iso(t) for t in times], "regions": regions}


def fetch() -> dict:
    now = datetime.now(timezone.utc)
    predicted = net.get_json(f"{SWPC}/json/solar-cycle/predicted-solar-cycle.json") or []
    observed = net.get_json(f"{SWPC}/json/solar-cycle/observed-solar-cycle-indices.json") or []
    ssn, ssn_src = smoothed_ssn(now, predicted, observed)
    try:
        drap = parse_drap(net.get_bytes(f"{SWPC}/text/drap_global_frequencies.txt").decode("utf-8", "replace"), *TX)
    except Exception as e:  # absorption is an extra; the forecast stands without it
        log.warning("hf: D-RAP failed: %s", e)
        drap = None
    start = now.replace(minute=0, second=0, microsecond=0)
    out = predict(ssn, start)
    return {
        "updated": iso(now),
        "source": "voacap (dvoacap-python)",
        "ssn": round(ssn, 1),
        "ssn_source": ssn_src,
        "tx": {"lat": TX[0], "lon": TX[1], "power_w": TX_POWER_W},
        "bands": [{"id": b, "mhz": f} for b, f in BANDS],
        "modes": {"3": "SSB", "2": "CW", "1": "FT8", "0": "closed"},
        "drap": drap,
        **out,
    }
