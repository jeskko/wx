"""NOAA SWPC space weather: Kp (observed + forecast), OVATION aurora, solar wind."""

from datetime import datetime, timedelta, timezone

from .. import net

BASE = "https://services.swpc.noaa.gov"

# Nordic window for the OVATION grid we ship to clients
OV_LAT = (50, 80)
OV_LON = (-30, 50)


def _t(s: str) -> str:
    # SWPC uses "2026-10-28T00:00:00" or "2026-10-28 00:00:00.000", always UTC
    s = s.replace(" ", "T").split(".")[0]
    return s + "Z" if not s.endswith("Z") else s


def parse_kp(rows) -> list[dict]:
    out = []
    for r in rows:
        if isinstance(r, dict):
            kp = r.get("Kp", r.get("kp"))
            out.append({"time": _t(r["time_tag"]), "kp": kp, "kind": r.get("observed", "observed")})
        elif isinstance(r, list) and r and r[0] != "time_tag":  # legacy array format
            out.append({"time": _t(r[0]), "kp": float(r[1]), "kind": r[2] if len(r) > 2 else "observed"})
    return out


def parse_ovation(d: dict) -> dict:
    """Return Nordic-window grid: rows of lat (south->north), cols of lon (west->east), values 0-100."""
    lat0, lat1 = OV_LAT
    lon0, lon1 = OV_LON
    nlat, nlon = lat1 - lat0 + 1, lon1 - lon0 + 1
    grid = [[0] * nlon for _ in range(nlat)]
    for lon, lat, v in d["coordinates"]:
        lo = lon - 360 if lon > 180 else lon
        if lat0 <= lat <= lat1 and lon0 <= lo <= lon1:
            grid[int(lat) - lat0][int(lo) - lon0] = int(v)
    return {
        "observed": _t(d.get("Observation Time", "")),
        "forecast": _t(d.get("Forecast Time", "")),
        "lat0": lat0,
        "lon0": lon0,
        "step": 1,
        "grid": grid,
    }


def ovation_at(ov: dict, lat: float, lon: float) -> int | None:
    i, j = round(lat) - ov["lat0"], round(lon) - ov["lon0"]
    if 0 <= i < len(ov["grid"]) and 0 <= j < len(ov["grid"][0]):
        return ov["grid"][i][j]
    return None


def kp() -> dict:
    observed = parse_kp(net.get_json(f"{BASE}/products/noaa-planetary-k-index.json"))
    forecast = parse_kp(net.get_json(f"{BASE}/products/noaa-planetary-k-index-forecast.json"))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "observed": [r for r in observed if r["time"] >= cutoff],
        "forecast": [r for r in forecast if r["kind"] in ("predicted", "estimated") or r["time"] >= cutoff],
    }


def ovation() -> dict:
    return parse_ovation(net.get_json(f"{BASE}/json/ovation_aurora_latest.json"))


def solar_wind() -> dict | None:
    """Latest real-time solar wind summary (Bz, Bt, speed). Tiny endpoints, ~60 bytes each."""
    mag = (net.get_json(f"{BASE}/products/summary/solar-wind-mag-field.json") or [{}])[0]
    speed = (net.get_json(f"{BASE}/products/summary/solar-wind-speed.json") or [{}])[0]
    if not mag and not speed:
        return None
    f = lambda v: None if v in (None, "") else round(float(v), 1)  # noqa: E731
    return {
        "time": _t(mag.get("time_tag") or speed.get("time_tag")),
        "bz": f(mag.get("bz_gsm")),
        "bt": f(mag.get("bt")),
        "speed": f(speed.get("proton_speed")),
    }
