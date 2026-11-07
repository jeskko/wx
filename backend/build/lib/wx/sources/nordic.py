"""Observations from the neighbouring weather services, normalized to the FMI station shape
(see fmi.summarize_station): SMHI (Sweden), DMI (Denmark, Faroes), the Estonian Environment
Agency and the Icelandic Met Office. All open data without API keys.

Norway (MET Norway Frost) needs a registered client id: put it in STATE_DIR/frost_client_id
to enable it; without one Norwegian places fall back to METAR.

Each station dict gets an extra "src" key naming the service.
"""

import json
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

from .. import net, settings
from ..store import iso

log = logging.getLogger(__name__)

FIELDS = ("t", "ws", "wg", "wd", "rh", "td", "r1h", "ri", "snow", "p", "ptend", "vis", "n", "wawa")


def _station(src: str, sid: str, name: str, lat: float, lon: float, time: datetime) -> dict:
    out = {"id": f"{src}:{sid}", "src": src, "name": name, "region": None, "lat": round(lat, 4), "lon": round(lon, 4), "time": iso(time)}
    for k in FIELDS:
        out[k] = None
    return out


def _num(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def octas(percent: float | None) -> int | None:
    """Cloud cover % to octas; > 100 % means sky obscured (9)."""
    if percent is None:
        return None
    if percent > 100:
        return 9
    return int(round(percent / 12.5))


def ww_to_wawa(ww: int) -> int | None:
    """Manual present weather (WMO 4677) to the nearest automatic code (WMO 4680)."""
    if ww == 10:
        return 10
    if ww == 17 or ww in (13, 19):
        return 90 if ww == 17 else None
    if 40 <= ww <= 49:
        return 30
    if 50 <= ww <= 55:
        return 51 if ww <= 51 else 52 if ww <= 53 else 53
    if ww in (56, 57):
        return 54
    if ww in (58, 59):
        return 57
    if 60 <= ww <= 65:
        return {60: 61, 61: 61, 62: 62, 63: 62, 64: 63, 65: 63}[ww]
    if ww in (66, 67):
        return 64
    if ww in (68, 69):
        return 67 if ww == 68 else 68
    if 70 <= ww <= 75:
        return {70: 71, 71: 71, 72: 72, 73: 72, 74: 73, 75: 73}[ww]
    if 76 <= ww <= 78:
        return 77
    if ww == 79:
        return 74
    if 80 <= ww <= 90:
        return {80: 81, 81: 82, 82: 83, 83: 84, 84: 84, 85: 85, 86: 86, 87: 87, 88: 87, 89: 89, 90: 89}[ww]
    if 91 <= ww <= 99:
        return 92 if ww <= 94 else 95
    return None


def present_weather(code: float | None) -> int | None:
    """SMHI/DMI code: 100-199 = WMO 4680 + 100 (automatic), < 100 = WMO 4677 (manual)."""
    if code is None:
        return None
    c = int(code)
    if 100 <= c <= 199:
        return c - 100
    if 0 <= c < 100:
        return ww_to_wawa(c)
    return None


def _r(v: float | None, nd: int = 1) -> float | None:
    return None if v is None else round(v, nd)


# ---------------------------------------------------------------- SMHI (Sweden)

SMHI_URL = "https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/{p}/station-set/all/period/{period}/data.json"
# SMHI parameter id -> our field (all hourly values)
SMHI_PARAMS = {1: "t", 4: "ws", 3: "wd", 21: "wg", 6: "rh", 39: "td", 7: "r1h", 12: "vis", 16: "n", 13: "wawa"}
SMHI_PRESSURE = 9  # (the all-stations set only has the latest hour, so no tendency)
_SMHI_SUFFIX = re.compile(r"\s+(A|Aut|Mo|Sol|D)$")


def smhi_name(name: str) -> str:
    return _SMHI_SUFFIX.sub("", name.strip())


def parse_smhi(by_param: dict[int, dict]) -> list[dict]:
    """by_param: SMHI parameter id -> parsed data.json of station-set/all."""
    stations: dict[str, dict] = {}
    for pid, doc in by_param.items():
        for s in doc.get("station") or []:
            vals = [v for v in (s.get("value") or []) if v.get("value") not in (None, "")]
            if not vals:
                continue
            key = s["key"]
            last = vals[-1]
            t = datetime.fromtimestamp(last["date"] / 1000, timezone.utc)
            st = stations.get(key)
            if st is None:
                st = stations[key] = _station("smhi", key, smhi_name(s["name"]), s["latitude"], s["longitude"], t)
                st["_t"] = None
            v = _num(last["value"])
            if pid == 1:
                st["t"] = _r(v)
                st["time"] = iso(t)
                st["_t"] = t
            elif pid == SMHI_PRESSURE:
                st["p"] = _r(v)
                target = last["date"] - 3 * 3600_000
                old = next((_num(x["value"]) for x in vals if abs(x["date"] - target) <= 15 * 60_000), None)
                st["ptend"] = None if old is None or v is None else _r(v - old)
            else:
                field = SMHI_PARAMS[pid]
                if field == "n":
                    st["n"] = octas(v)
                elif field == "wawa":
                    st["wawa"] = present_weather(v)
                elif field in ("wd", "rh", "vis"):
                    st[field] = None if v is None else int(round(v))
                else:
                    st[field] = _r(v)
    out = []
    for st in stations.values():
        if st.pop("_t") is None:  # temperature is required, as for FMI stations
            continue
        out.append(st)
    return out


def smhi() -> list[dict]:
    docs = {pid: net.get_json(SMHI_URL.format(p=pid, period="latest-hour")) for pid in SMHI_PARAMS}
    docs[SMHI_PRESSURE] = net.get_json(SMHI_URL.format(p=SMHI_PRESSURE, period="latest-hour"))
    return parse_smhi(docs)


# ---------------------------------------------------------------- DMI (Denmark, Faroe Islands)

DMI_BASE = "https://opendataapi.dmi.dk/v2/metObs/collections"
DMI_PARAMS = {
    "temp_dry": "t",
    "wind_speed": "ws",
    "wind_max": "wg",
    "wind_dir": "wd",
    "humidity": "rh",
    "temp_dew": "td",
    "pressure_at_sea": "p",
    "visibility": "vis",
    "cloud_cover": "n",
    "weather": "wawa",
    "precip_past1h": "r1h",
    "snow_depth_man": "snow",
}


def dmi_station_names(doc: dict) -> dict[str, tuple[str, float, float]]:
    """Newest valid name/position per station id (the list also holds history rows)."""
    best: dict[str, tuple[str, dict]] = {}
    for f in doc.get("features") or []:
        p = f["properties"]
        if p.get("country") not in ("DNK", "FRO") or not f.get("geometry"):
            continue
        sid = p["stationId"]
        if sid not in best or (p.get("validFrom") or "") > best[sid][0]:
            best[sid] = (p.get("validFrom") or "", f)
    out = {}
    for sid, (_, f) in best.items():
        lon, lat = f["geometry"]["coordinates"][:2]
        out[sid] = (f["properties"]["name"], lat, lon)
    return out


def parse_dmi(obs: dict, names: dict[str, tuple[str, float, float]], pressure_3h_ago: dict | None = None) -> list[dict]:
    latest: dict[str, dict[str, tuple[str, float]]] = {}
    for f in obs.get("features") or []:
        p = f["properties"]
        field = DMI_PARAMS.get(p["parameterId"])
        if field is None or p.get("value") is None:
            continue
        cur = latest.setdefault(p["stationId"], {})
        if field not in cur or p["observed"] > cur[field][0]:
            cur[field] = (p["observed"], p["value"])
    old_p: dict[str, float] = {}
    for f in (pressure_3h_ago or {}).get("features") or []:
        p = f["properties"]
        if p["parameterId"] == "pressure_at_sea" and p.get("value") is not None:
            old_p[p["stationId"]] = p["value"]
    out = []
    for sid, vals in latest.items():
        if "t" not in vals or sid not in names:
            continue
        name, lat, lon = names[sid]
        t = datetime.fromisoformat(vals["t"][0].replace("Z", "+00:00"))
        st = _station("dmi", sid, name, lat, lon, t)
        for field, (_, v) in vals.items():
            if field == "n":
                st["n"] = octas(v)
            elif field == "wawa":
                st["wawa"] = present_weather(v)
            elif field in ("wd", "rh", "vis"):
                st[field] = int(round(v))
            else:
                st[field] = _r(v)
        if st["p"] is not None and sid in old_p:
            st["ptend"] = _r(st["p"] - old_p[sid])
        out.append(st)
    return out


def _dmi_names() -> dict[str, tuple[str, float, float]]:
    """Station list, cached for a day in STATE_DIR."""
    cache = settings.STATE_DIR / "dmi_stations.json"
    try:
        if cache.exists() and datetime.now().timestamp() - cache.stat().st_mtime < 86400:
            return {k: tuple(v) for k, v in json.loads(cache.read_text()).items()}
    except (OSError, ValueError):
        pass
    names = dmi_station_names(net.get_json(f"{DMI_BASE}/station/items", {"status": "Active", "limit": 10000}))
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(names))
    return names


def dmi() -> list[dict]:
    names = _dmi_names()
    obs = net.get_json(f"{DMI_BASE}/observation/items", {"period": "latest-10-minutes", "limit": 300000})
    # hourly precipitation is only reported on the hour
    try:
        r1h = net.get_json(f"{DMI_BASE}/observation/items", {"period": "latest-hour", "parameterId": "precip_past1h", "limit": 10000})
        obs = {"features": (obs.get("features") or []) + (r1h.get("features") or [])}
    except Exception as e:
        log.info("dmi precip_past1h: %s", e)
    now = datetime.now(timezone.utc)
    a, b = now - timedelta(hours=3, minutes=10), now - timedelta(hours=2, minutes=50)
    try:
        old = net.get_json(
            f"{DMI_BASE}/observation/items",
            {"parameterId": "pressure_at_sea", "datetime": f"{a:%Y-%m-%dT%H:%M:%SZ}/{b:%Y-%m-%dT%H:%M:%SZ}", "limit": 10000},
        )
    except Exception as e:
        log.info("dmi pressure 3h ago: %s", e)
        old = None
    return parse_dmi(obs, names, old)


# ---------------------------------------------------------------- Estonia

EE_URL = "https://www.ilmateenistus.ee/ilma_andmed/xml/observations.php"
# phenomenon text -> (octas, wawa)
EE_PHENOMENA: dict[str, tuple[int | None, int | None]] = {
    "Clear": (0, None),
    "Few clouds": (2, None),
    "Variable clouds": (4, None),
    "Cloudy with clear spells": (6, None),
    "Overcast": (8, None),
    "Light snow shower": (None, 85),
    "Moderate snow shower": (None, 86),
    "Heavy snow shower": (None, 87),
    "Light shower": (None, 81),
    "Moderate shower": (None, 82),
    "Heavy shower": (None, 83),
    "Light rain": (None, 61),
    "Moderate rain": (None, 62),
    "Heavy rain": (None, 63),
    "Glaze": (None, 64),
    "Light sleet": (None, 67),
    "Moderate sleet": (None, 68),
    "Light snowfall": (None, 71),
    "Moderate snowfall": (None, 72),
    "Heavy snowfall": (None, 73),
    "Blowing snow": (None, 72),
    "Drifting snow": (None, 71),
    "Hail": (None, 89),
    "Mist": (None, 10),
    "Fog": (9, 30),
    "Thunder": (None, 90),
    "Thunderstorm": (None, 92),
}


def parse_estonia(xml: bytes) -> list[dict]:
    root = ET.fromstring(xml)
    t = datetime.fromtimestamp(int(root.get("timestamp")), timezone.utc)
    out = []
    for s in root.findall("station"):
        temp = _num(s.findtext("airtemperature"))
        lat, lon = _num(s.findtext("latitude")), _num(s.findtext("longitude"))
        if temp is None or lat is None or lon is None:
            continue
        name = (s.findtext("name") or "").strip()
        st = _station("ee", s.findtext("wmocode") or name, name, lat, lon, t)
        st["t"] = _r(temp)
        st["ws"] = _r(_num(s.findtext("windspeed")))
        st["wg"] = _r(_num(s.findtext("windspeedmax")))
        wd = _num(s.findtext("winddirection"))
        st["wd"] = None if wd is None else int(round(wd))
        rh = _num(s.findtext("relativehumidity"))
        st["rh"] = None if rh is None else int(round(rh))
        st["p"] = _r(_num(s.findtext("airpressure")))
        vis = _num(s.findtext("visibility"))  # km
        st["vis"] = None if vis is None else int(round(vis * 1000))
        st["r1h"] = _r(_num(s.findtext("precipitations")))
        ph = (s.findtext("phenomenon") or "").strip()
        if ph in EE_PHENOMENA:
            st["n"], st["wawa"] = EE_PHENOMENA[ph]
        out.append(st)
    return out


def estonia() -> list[dict]:
    return parse_estonia(net.get_bytes(EE_URL))


# ---------------------------------------------------------------- Iceland

IS_URL = "https://xmlweather.vedur.is/"
# Reykjavík, Keflavík airport, Akureyri, Egilsstaðir airport, Höfn, Stykkishólmur, Flateyri,
# Vestmannaeyjar, Kirkjubæjarklaustur, Hveravellir
IS_STATIONS = [1, 990, 3471, 571, 5544, 178, 2631, 6015, 6272, 6935]
_COMPASS16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
# Icelandic station coordinates (the XML has none)
IS_COORDS = {
    1: (64.1275, -21.9025),
    990: (63.9706, -22.5948),
    3471: (65.6990, -18.1110),
    571: (65.2833, -14.4025),
    5544: (64.2675, -15.2136),
    178: (65.0733, -22.7341),
    2631: (66.0496, -23.5060),
    6015: (63.4433, -20.2933),
    6272: (63.7900, -18.0100),
    6935: (64.8667, -19.5667),
}


def parse_iceland(xml: bytes) -> list[dict]:
    root = ET.fromstring(xml)
    out = []
    for s in root.findall("station"):
        sid = int(s.get("id"))
        temp = _num(s.findtext("T"))
        time = s.findtext("time")
        if temp is None or sid not in IS_COORDS or not time:
            continue
        # times are UTC (Iceland keeps UTC all year)
        t = datetime.strptime(time, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        lat, lon = IS_COORDS[sid]
        st = _station("is", str(sid), (s.findtext("name") or "").strip(), lat, lon, t)
        st["t"] = _r(temp)
        st["ws"] = _r(_num(s.findtext("F")))
        st["wg"] = _r(_num(s.findtext("FG")))
        d = (s.findtext("D") or "").strip().upper()
        st["wd"] = _COMPASS16.index(d) * 22.5 if d in _COMPASS16 else (0 if d == "LOGN" else None)
        if st["wd"] is not None:
            st["wd"] = int(st["wd"])
        rh = _num(s.findtext("RH"))
        st["rh"] = None if rh is None else int(round(rh))
        st["td"] = _r(_num(s.findtext("TD")))
        st["p"] = _r(_num(s.findtext("P")))
        st["r1h"] = _r(_num(s.findtext("R")))
        vis = _num(s.findtext("V"))  # km
        st["vis"] = None if vis is None else int(round(vis * 1000))
        n = _num(s.findtext("N"))
        st["n"] = None if n is None else int(n)
        out.append(st)
    return out


def iceland() -> list[dict]:
    params = {
        "op_w": "xml",
        "type": "obs",
        "lang": "en",
        "view": "xml",
        "ids": ";".join(map(str, IS_STATIONS)),
        "params": "T;F;FG;D;R;V;N;P;RH;TD",
    }
    return parse_iceland(net.get_bytes(IS_URL, params))


# ---------------------------------------------------------------- Norway (optional)

FROST_URL = "https://frost.met.no/observations/v0.jsonld"
FROST_SOURCES_URL = "https://frost.met.no/sources/v0.jsonld"
FROST_ELEMENTS = {
    "air_temperature": "t",
    "wind_speed": "ws",
    "max(wind_speed_of_gust PT10M)": "wg",
    "wind_from_direction": "wd",
    "relative_humidity": "rh",
    "dew_point_temperature": "td",
    "air_pressure_at_sea_level": "p",
    "sum(precipitation_amount PT1H)": "r1h",
    "surface_snow_thickness": "snow",
    "cloud_area_fraction": "n",
}


def frost_client_id() -> str | None:
    p = settings.STATE_DIR / "frost_client_id"
    try:
        v = p.read_text().strip()
        return v or None
    except OSError:
        return None


def parse_frost(obs: dict, sources: dict) -> list[dict]:
    pos = {}
    for s in sources.get("data") or []:
        g = s.get("geometry") or {}
        if g.get("coordinates"):
            lon, lat = g["coordinates"][:2]
            pos[s["id"]] = (s.get("shortName") or s.get("name") or s["id"], lat, lon)
    by: dict[str, dict[str, tuple[str, float]]] = {}
    for item in obs.get("data") or []:
        sid = item["sourceId"].split(":")[0]
        for o in item.get("observations") or []:
            field = FROST_ELEMENTS.get(o["elementId"])
            if field is None or o.get("value") is None:
                continue
            cur = by.setdefault(sid, {})
            if field not in cur or item["referenceTime"] > cur[field][0]:
                cur[field] = (item["referenceTime"], o["value"])
    out = []
    for sid, vals in by.items():
        if "t" not in vals or sid not in pos:
            continue
        name, lat, lon = pos[sid]
        t = datetime.fromisoformat(vals["t"][0].replace("Z", "+00:00"))
        st = _station("frost", sid, name.title() if name.isupper() else name, lat, lon, t)
        for field, (_, v) in vals.items():
            if field == "n":
                st["n"] = int(round(v)) if v <= 8 else 9  # Frost reports octas
            elif field == "snow":
                st["snow"] = _r(v)
            elif field in ("wd", "rh"):
                st[field] = int(round(v))
            else:
                st[field] = _r(v)
        out.append(st)
    return out


def norway(client_id: str) -> list[dict]:
    auth = (client_id, "")
    c = net.client()
    sources = c.get(FROST_SOURCES_URL, params={"types": "SensorSystem", "country": "NO", "fields": "id,name,shortName,geometry"}, auth=auth)
    sources.raise_for_status()
    obs = c.get(
        FROST_URL,
        params={"sources": "SN*", "referencetime": "latest", "maxage": "PT2H", "elements": ",".join(FROST_ELEMENTS)},
        auth=auth,
    )
    obs.raise_for_status()
    return parse_frost(obs.json(), sources.json())


# ---------------------------------------------------------------- all

SOURCES = {"smhi": smhi, "dmi": dmi, "ee": estonia, "is": iceland}


def observations(previous: dict | None = None) -> dict:
    """All neighbouring services. A failed service keeps its stations from `previous`
    (if under 3 h old) so one outage does not blank a country."""
    sources = dict(SOURCES)
    cid = frost_client_id()
    if cid:
        sources["frost"] = lambda: norway(cid)
    stations: list[dict] = []
    status: dict[str, int | str] = {}
    now = datetime.now(timezone.utc)
    for name, fn in sources.items():
        try:
            got = fn()
            status[name] = len(got)
        except Exception as e:
            log.warning("nordic obs %s failed: %s", name, e)
            got = [
                s
                for s in (previous or {}).get("stations", [])
                if s.get("src") == name and now - datetime.fromisoformat(s["time"].replace("Z", "+00:00")) < timedelta(hours=3)
            ]
            status[name] = f"failed ({len(got)} kept)"
        stations += got
    if not any(isinstance(v, int) and v for v in status.values()):
        raise RuntimeError(f"all nordic sources failed: {status}")
    stations.sort(key=lambda x: -x["lat"])
    return {"source": "nordic", "updated": iso(now), "sources": status, "stations": stations}
