"""Fintraffic Digitraffic road weather (CC BY 4.0): road condition forecasts per road
section, and road weather station observations."""

from datetime import datetime, timedelta, timezone

from .. import net, proj
from ..store import iso

BASE = "https://tie.digitraffic.fi/api/weather/v1"
HEADERS = {"Digitraffic-User": "wx.fi"}

COND = {
    "NORMAL_CONDITION": "N",
    "POOR_CONDITION": "P",
    "EXTREMELY_POOR_CONDITION": "X",
}
STEPS = ["0h", "2h", "4h", "6h", "12h"]
SENSORS = {"ILMA": "t", "TIE_1": "rt", "KELI_1": "cond", "VAROITUS_1": "warn"}


def _svg_path(coords, extent: str) -> str | None:
    x0, _, _, y1 = proj.EXTENTS[extent]
    pts = []
    for lon, lat, *_ in coords:
        e, n = proj.forward(lat, lon)
        p = (round((e - x0) / 1000, 1), round((y1 - n) / 1000, 1))
        if not pts or pts[-1] != p:
            pts.append(p)
    if len(pts) < 2:
        return None
    return "M" + "L".join(f"{x:g} {y:g}" for x, y in pts)


def sections(extent: str = "fi") -> list[dict]:
    meta = net.get_json(f"{BASE}/forecast-sections-simple", headers=HEADERS)
    fc = net.get_json(f"{BASE}/forecast-sections-simple/forecasts", headers=HEADERS)
    by_id = {s["id"]: s for s in fc.get("forecastSections", [])}
    out = []
    for f in meta["features"]:
        sid = f["id"]
        path = _svg_path(f["geometry"]["coordinates"], extent)
        if not path:
            continue
        steps = {x.get("forecastName"): x for x in by_id.get(sid, {}).get("forecasts", [])}
        now = steps.get("0h", {})
        out.append(
            {
                "id": sid,
                "name": f["properties"].get("description"),
                "road": f["properties"].get("roadNumber"),
                "path": path,
                "cond": "".join(COND.get(steps.get(s, {}).get("overallRoadCondition"), "?") for s in STEPS),
                "rt": now.get("roadTemperature"),
                "t": now.get("temperature"),
            }
        )
    return out


def forecast_times() -> list[str]:
    """Nominal valid times of the forecast steps, from now."""
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    return [iso(now + timedelta(hours=int(s[:-1]))) for s in STEPS]


def stations() -> list[dict]:
    meta = net.get_json(f"{BASE}/stations", headers=HEADERS)
    pos = {
        f["id"]: (f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0], f["properties"].get("name"))
        for f in meta["features"]
    }
    data = net.get_json(f"{BASE}/stations/data", headers=HEADERS)
    out = []
    for st in data.get("stations", []):
        if st["id"] not in pos:
            continue
        lat, lon, name = pos[st["id"]]
        row = {"id": st["id"], "name": name, "lat": round(lat, 4), "lon": round(lon, 4), "time": st.get("dataUpdatedTime")}
        for v in st.get("sensorValues", []):
            k = SENSORS.get(v.get("name"))
            if k:
                row[k] = v.get("value")
        if row.get("rt") is None and row.get("t") is None:
            continue
        if row.get("cond") == 0:  # sensor fault
            row["cond"] = None
        out.append(row)
    return out


# ---------------------------------------------------------------- weather cameras

CAM_API = "https://tie.digitraffic.fi/api/weathercam/v1"
ROAD_RE = __import__("re").compile(r"^(vt|kt|st|mt|yt|pt)(\d+)_(.+)$", __import__("re").I)


def cam_label(station_name: str) -> tuple[str, str | None]:
    """'kt51_Inkoo' -> ('Inkoo', 'kt 51'); other names are returned as they are."""
    m = ROAD_RE.match(station_name)
    if not m:
        return station_name.replace("_", " "), None
    return m.group(3).replace("_", " "), f"{m.group(1).lower()} {m.group(2)}"


def cam_stations() -> list[dict]:
    """Collecting camera stations: id, lat, lon, label, road, preset ids."""
    d = net.get_json(f"{CAM_API}/stations", headers=HEADERS)
    out = []
    for f in d.get("features", []):
        p = f["properties"]
        if p.get("collectionStatus") != "GATHERING":
            continue
        presets = [x["id"] for x in p.get("presets", []) if x.get("inCollection")]
        if not presets:
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        name, road = cam_label(p.get("name") or p["id"])
        out.append({"id": p["id"], "lat": lat, "lon": lon, "name": name, "road": road, "presets": sorted(presets)})
    return out


def cam_times() -> dict[str, str]:
    """preset id -> measuredTime of its latest image."""
    d = net.get_json(f"{CAM_API}/stations/data", headers=HEADERS)
    return {pr["id"]: pr["measuredTime"] for st in d.get("stations", []) for pr in st.get("presets", []) if pr.get("measuredTime")}


def cam_image(preset: str, width: int = 640) -> bytes:
    """Latest image of a preset, downscaled to `width` px as JPEG."""
    import io

    from PIL import Image

    raw = net.get(f"https://weathercam.digitraffic.fi/{preset}.jpg", headers=HEADERS).content
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=78, optimize=True, progressive=True)
    return buf.getvalue()
