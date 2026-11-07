"""FMI open data: observations, edited point forecast, magnetometer."""

import logging
from datetime import datetime, timedelta, timezone

import httpx

from .. import net, symbols
from ..store import iso
from .fmi_xml import FmiError, Series, parse_multipointcoverage, parse_simple

log = logging.getLogger(__name__)

WFS = "https://opendata.fmi.fi/wfs"
FI_BBOX = "19,59.5,32,70.2"

# FMI obs param -> our short key
OBS_PARAMS = {
    "t2m": "t",
    "ws_10min": "ws",
    "wg_10min": "wg",
    "wd_10min": "wd",
    "rh": "rh",
    "td": "td",
    "r_1h": "r1h",
    "ri_10min": "ri",
    "snow_aws": "snow",
    "p_sea": "p",
    "vis": "vis",
    "n_man": "n",
    "wawa": "wawa",
}

# Edited forecast param -> our short key
FC_PARAMS = {
    "Temperature": "t",
    "FeelsLike": "feels",
    "WindSpeedMS": "ws",
    "HourlyMaximumGust": "wg",  # "WindGust" exists but is always NaN in the edited forecast
    "WindDirection": "wd",
    "Humidity": "rh",
    "Precipitation1h": "pr",
    "PoP": "pop",
    "TotalCloudCover": "cloud",
    "WeatherSymbol3": "ws3",
    "Pressure": "p",
}


def _wfs(query: str, **params) -> bytes:
    p = {"service": "WFS", "version": "2.0.0", "request": "getFeature", "storedquery_id": query}
    p.update(params)
    return net.get_bytes(WFS, p)


def _fmt(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z")


# ---------------------------------------------------------------- observations


def fetch_obs_xml(hours: float = 3.2) -> bytes:
    start = datetime.now(timezone.utc) - timedelta(hours=hours)
    return _wfs(
        "fmi::observations::weather::multipointcoverage",
        bbox=FI_BBOX,
        starttime=_fmt(start),
        parameters=",".join(OBS_PARAMS),
    )


def _r(v: float | None, nd: int = 1) -> float | None:
    return None if v is None else round(v, nd)


def summarize_station(s: Series, max_age: timedelta = timedelta(minutes=70)) -> dict | None:
    """Latest non-null value per field + 3h pressure tendency."""
    if not s.rows:
        return None
    newest = s.rows[-1][0]
    latest: dict[str, float] = {}
    latest_t: dict[str, datetime] = {}
    for ts, vals in reversed(s.rows):
        if newest - ts > max_age:
            break
        for k, v in vals.items():
            if v is not None and k not in latest:
                latest[k] = v
                latest_t[k] = ts
    if "t2m" not in latest:
        return None
    out = {
        "id": s.fmisid,
        "name": s.name,
        "region": s.region,
        "lat": s.lat,
        "lon": s.lon,
        "time": iso(latest_t["t2m"]),
    }
    for src, dst in OBS_PARAMS.items():
        v = latest.get(src)
        out[dst] = None if v is None else (int(v) if dst in ("wd", "n", "wawa", "vis") else _r(v))
    # pressure tendency over ~3h
    out["ptend"] = None
    if "p_sea" in latest:
        target = latest_t["p_sea"] - timedelta(hours=3)
        for ts, vals in s.rows:
            if abs((ts - target).total_seconds()) <= 15 * 60 and vals.get("p_sea") is not None:
                out["ptend"] = _r(latest["p_sea"] - vals["p_sea"])
                break
    return out


def observations() -> dict:
    series = parse_multipointcoverage(fetch_obs_xml())
    stations = [x for x in (summarize_station(s) for s in series) if x]
    stations.sort(key=lambda x: (-x["lat"]))
    return {"source": "fmi", "updated": iso(datetime.now(timezone.utc)), "stations": stations}


# ---------------------------------------------------------------- forecast


def fetch_forecast_xml(latlons: list[tuple[float, float]], days: int = 10) -> bytes:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    return _wfs(
        "fmi::forecast::edited::weather::scandinavia::point::multipointcoverage",
        latlon=[f"{la:.4f},{lo:.4f}" for la, lo in latlons],
        starttime=_fmt(now),
        endtime=_fmt(now + timedelta(days=days)),
        timestep="60",
        parameters=",".join(FC_PARAMS),
    )


def series_to_hourly(s: Series) -> list[dict]:
    hourly = []
    for ts, vals in s.rows:
        if vals.get("Temperature") is None:
            continue
        h = {"time": iso(ts), "h": 1}
        for src, dst in FC_PARAMS.items():
            if dst == "ws3":
                continue
            v = vals.get(src)
            h[dst] = None if v is None else (int(round(v)) if dst in ("wd", "rh", "pop", "cloud") else _r(v))
        h["sym"] = symbols.from_fmi_ws3(vals.get("WeatherSymbol3"))
        hourly.append(h)
    return hourly


def forecasts(latlons: list[tuple[float, float]], batch: int = 10) -> list[list[dict]]:
    """Hourly forecast per requested point (same order). Empty list = no coverage."""
    from ..geo import haversine_km

    def fetch(chunk) -> list[Series] | None:
        try:
            return parse_multipointcoverage(fetch_forecast_xml(chunk))
        except (FmiError, httpx.HTTPStatusError) as e:
            # FMI rejects the whole request if one point lacks data (e.g. outside the domain)
            log.info("forecast batch of %d rejected (%s)", len(chunk), e)
            return None

    result: list[list[dict]] = []
    for i in range(0, len(latlons), batch):
        chunk = latlons[i : i + batch]
        series = fetch(chunk)
        if series is None:
            series = []
            for pt in chunk:
                series += fetch([pt]) or []
        for la, lo in chunk:
            best = min(series, key=lambda s: haversine_km(la, lo, s.lat, s.lon), default=None)
            if best is None or haversine_km(la, lo, best.lat, best.lon) > 10:
                result.append([])
            else:
                result.append(series_to_hourly(best))
    return result


# ---------------------------------------------------------------- magnetometer

# IMAGE magnetometer stations in Finland (FMI). Keyed by rounded lat/lon.
MAG_STATIONS = {
    (69.76, 27.01): ("KEV", "Kevo"),
    (69.06, 20.77): ("KIL", "Kilpisjärvi"),
    (68.56, 27.29): ("IVA", "Ivalo"),
    (68.02, 23.52): ("MUO", "Muonio"),
    (67.37, 26.63): ("SOD", "Sodankylä"),
    (66.90, 24.08): ("PEL", "Pello"),
    (65.90, 26.41): ("RAN", "Ranua"),
    (64.51, 27.23): ("OUJ", "Oulujärvi"),
    (62.77, 30.97): ("MEK", "Mekrijärvi"),
    (62.25, 26.60): ("HAN", "Hankasalmi"),
    (60.51, 24.65): ("NUR", "Nurmijärvi"),
}


def magnetometer(minutes: int = 60) -> list[dict]:
    """Per-station X-component range (nT) over the last `minutes` — local auroral activity."""
    end = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    xml = _wfs(
        "fmi::observations::magnetometer::simple",
        bbox="19,59,32,71",
        starttime=_fmt(end - timedelta(minutes=minutes)),
        endtime=_fmt(end),
        timestep="1",
        parameters="MAGNX_PT1M_AVG",
    )
    return summarize_magnetometer(parse_simple(xml))


def summarize_magnetometer(series: list[Series]) -> list[dict]:
    out = []
    for s in series:
        xs = [v["MAGNX_PT1M_AVG"] for _, v in s.rows if v.get("MAGNX_PT1M_AVG") is not None]
        if len(xs) < 5:
            continue
        code, name = MAG_STATIONS.get((round(s.lat, 2), round(s.lon, 2)), (None, f"{s.lat:.2f},{s.lon:.2f}"))
        # derivative: largest 1-min change, a good "something is happening now" signal
        dmax = max((abs(b - a) for a, b in zip(xs, xs[1:])), default=0.0)
        out.append(
            {
                "code": code,
                "name": name,
                "lat": round(s.lat, 3),
                "lon": round(s.lon, 3),
                "range": round(max(xs) - min(xs), 1),
                "dxmax": round(dmax, 1),
                "time": iso(s.rows[-1][0]),
                "n": len(xs),
            }
        )
    out.sort(key=lambda x: -x["lat"])
    return out


# ---------------------------------------------------------------- sea

WAVE_PARAMS = ("WaveHs", "ModalWDi", "TWATER", "WTP")
LEVEL_PARAMS = ("WATLEV", "TW_PT1H_AVG")


def _latest(s: Series, keys, max_age: timedelta = timedelta(hours=3), now: datetime | None = None) -> tuple[dict, datetime | None]:
    """Newest non-null value per key within max_age of now."""
    out: dict[str, float] = {}
    t: datetime | None = None
    cutoff = (now or datetime.now(timezone.utc)) - max_age
    for ts, vals in reversed(s.rows):
        if ts < cutoff:
            break
        for k in keys:
            if k not in out and vals.get(k) is not None:
                out[k] = vals[k]
                t = t or ts
    return out, t


def summarize_waves(series: list[Series], now: datetime | None = None) -> list[dict]:
    out = []
    for s in series:
        v, t = _latest(s, WAVE_PARAMS, now=now)
        if not v:
            continue
        out.append(
            {
                "name": s.name,
                "lat": round(s.lat, 4),
                "lon": round(s.lon, 4),
                "time": iso(t),
                "hs": _r(v.get("WaveHs")),
                "dir": None if v.get("ModalWDi") is None else int(v["ModalWDi"]),
                "period": _r(v.get("WTP")),
                "tw": _r(v.get("TWATER")),
            }
        )
    out.sort(key=lambda x: -x["lat"])
    return out


def summarize_levels(series: list[Series], now: datetime | None = None) -> list[dict]:
    out = []
    for s in series:
        v, t = _latest(s, LEVEL_PARAMS, now=now)
        if v.get("WATLEV") is None:
            continue
        # change over the last ~6 h, cm
        trend = None
        target = t - timedelta(hours=6) if t else None
        for ts, vals in s.rows:
            if target and abs((ts - target).total_seconds()) <= 30 * 60 and vals.get("WATLEV") is not None:
                trend = round((v["WATLEV"] - vals["WATLEV"]) / 10)
                break
        out.append(
            {
                "name": s.name,
                "lat": round(s.lat, 4),
                "lon": round(s.lon, 4),
                "time": iso(t),
                "level": round(v["WATLEV"] / 10),  # cm vs. theoretical mean water level
                "trend": trend,
                "tw": _r(v.get("TW_PT1H_AVG")),
            }
        )
    out.sort(key=lambda x: -x["lat"])
    return out


def sea() -> dict:
    start = _fmt(datetime.now(timezone.utc) - timedelta(hours=7))
    waves = summarize_waves(
        parse_multipointcoverage(
            _wfs("fmi::observations::wave::multipointcoverage", bbox="17,58,32,67", starttime=start, parameters=",".join(WAVE_PARAMS))
        )
    )
    levels = summarize_levels(
        parse_multipointcoverage(
            _wfs("fmi::observations::mareograph::multipointcoverage", bbox="17,58,32,67", starttime=start, parameters=",".join(LEVEL_PARAMS))
        )
    )
    return {"source": "fmi", "updated": iso(datetime.now(timezone.utc)), "waves": waves, "levels": levels}


# ---------------------------------------------------------------- lightning

LIGHTNING_BBOX = "14,57,36,71.5"


def summarize_lightning(series: list[Series]) -> list[list]:
    """Flat strike list: [lat, lon, epoch_s, cloud(0/1), peak_kA]."""
    out = []
    for s in series:
        for ts, vals in s.rows:
            ka = vals.get("peak_current")
            out.append(
                [
                    round(s.lat, 3),
                    round(s.lon, 3),
                    int(ts.timestamp()),
                    1 if vals.get("cloud_indicator") else 0,
                    None if ka is None else round(ka),
                ]
            )
    out.sort(key=lambda x: x[2])
    return out


def lightning(minutes: int = 60) -> dict:
    end = datetime.now(timezone.utc)
    xml = _wfs(
        "fmi::observations::lightning::multipointcoverage",
        bbox=LIGHTNING_BBOX,
        starttime=_fmt(end - timedelta(minutes=minutes)),
        endtime=_fmt(end),
        parameters="peak_current,cloud_indicator",
    )
    strikes = summarize_lightning(parse_multipointcoverage(xml))
    return {"source": "fmi", "updated": iso(end), "minutes": minutes, "strikes": strikes}


# ---------------------------------------------------------------- air quality

AQ_PARAMS = {
    "AQINDEX_PT1H_avg": "aqi",
    "PM25_PT1H_avg": "pm25",
    "PM10_PT1H_avg": "pm10",
    "NO2_PT1H_avg": "no2",
    "O3_PT1H_avg": "o3",
}


def summarize_airquality(series: list[Series], now: datetime | None = None) -> list[dict]:
    out = []
    for s in series:
        v, t = _latest(s, AQ_PARAMS, max_age=timedelta(hours=4), now=now)
        if v.get("AQINDEX_PT1H_avg") is None:
            continue
        row = {"name": s.name, "lat": round(s.lat, 4), "lon": round(s.lon, 4), "time": iso(t)}
        for src, dst in AQ_PARAMS.items():
            x = v.get(src)
            row[dst] = None if x is None else (int(round(x)) if dst == "aqi" else _r(x))
        out.append(row)
    out.sort(key=lambda x: -x["lat"])
    return out


def airquality() -> dict:
    start = _fmt(datetime.now(timezone.utc) - timedelta(hours=4))
    xml = _wfs(
        "urban::observations::airquality::hourly::multipointcoverage",
        bbox=FI_BBOX,
        starttime=start,
        parameters=",".join(AQ_PARAMS),
    )
    return {"source": "fmi", "updated": iso(datetime.now(timezone.utc)), "stations": summarize_airquality(parse_multipointcoverage(xml))}
