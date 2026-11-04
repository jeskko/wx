"""MET Norway locationforecast 2.0 (global) — fallback outside FMI's forecast area."""

from .. import net, symbols

URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact"


def forecast(lat: float, lon: float) -> list[dict]:
    # MET Norway asks for max 4 decimals in coordinates
    return parse(net.get_json(URL, {"lat": f"{lat:.4f}", "lon": f"{lon:.4f}"}))


def _int(v):
    return None if v is None else int(round(v))


def parse(d: dict) -> list[dict]:
    """Steps are hourly for ~2.5 days, then 6-hourly; `h` tells the step length."""
    steps = []
    for step in d["properties"]["timeseries"]:
        data = step["data"]
        det = data["instant"]["details"]
        if "next_1_hours" in data:
            nxt, hours = data["next_1_hours"], 1
        elif "next_6_hours" in data:
            nxt, hours = data["next_6_hours"], 6
        else:
            continue
        steps.append(
            {
                "time": step["time"],
                "h": hours,
                "t": det.get("air_temperature"),
                "feels": None,
                "ws": det.get("wind_speed"),
                "wg": det.get("wind_speed_of_gust"),
                "wd": _int(det.get("wind_from_direction")),
                "rh": _int(det.get("relative_humidity")),
                "pr": nxt.get("details", {}).get("precipitation_amount"),
                "pop": None,
                "cloud": _int(det.get("cloud_area_fraction")),
                "p": det.get("air_pressure_at_sea_level"),
                "sym": symbols.from_metno(nxt.get("summary", {}).get("symbol_code")),
            }
        )
    return steps


NOWCAST_URL = "https://api.met.no/weatherapi/nowcast/2.0/complete"


def nowcast(lat: float, lon: float) -> dict:
    """Radar nowcast (Nordic area): precipitation rate every 5 min for ~90 min."""
    return parse_nowcast(net.get_json(NOWCAST_URL, {"lat": f"{lat:.4f}", "lon": f"{lon:.4f}"}))


def parse_nowcast(d: dict) -> dict:
    props = d["properties"]
    steps = []
    for st in props["timeseries"]:
        r = st["data"]["instant"]["details"].get("precipitation_rate")
        if r is not None:
            steps.append([st["time"], round(r, 1)])
    return {"coverage": props.get("meta", {}).get("radar_coverage"), "updated": props.get("meta", {}).get("updated_at"), "steps": steps}
