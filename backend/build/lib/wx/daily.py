"""Aggregate hourly/6-hourly forecast steps into local-calendar days."""

from collections import OrderedDict
from datetime import datetime
from zoneinfo import ZoneInfo

TZ_BY_COUNTRY = {
    "FI": "Europe/Helsinki",
    "SE": "Europe/Stockholm",
    "NO": "Europe/Oslo",
    "DK": "Europe/Copenhagen",
    "IS": "Atlantic/Reykjavik",
    "EE": "Europe/Tallinn",
    "LV": "Europe/Riga",
}

# precedence when choosing the "headline" symbol of a day
_SEVERITY = ["clear", "partly", "cloudy", "fog", "showers", "snowshowers", "rain", "sleet", "snow", "thunder"]


def _sev(sym: str | None) -> tuple[int, int]:
    if not sym:
        return (-1, 0)
    kind, _, inten = sym.partition("-")
    return (_SEVERITY.index(kind) if kind in _SEVERITY else 0, int(inten or 0))


def daily(steps: list[dict], tz: str) -> list[dict]:
    zone = ZoneInfo(tz)
    days: "OrderedDict[str, list[tuple[datetime, dict]]]" = OrderedDict()
    for s in steps:
        lt = datetime.fromisoformat(s["time"].replace("Z", "+00:00")).astimezone(zone)
        days.setdefault(lt.date().isoformat(), []).append((lt, s))

    out = []
    for date, items in days.items():
        covered = sum(s.get("h", 1) for _, s in items)
        partial = covered < 18  # today's remainder or the tail of the series
        temps = [s["t"] for _, s in items if s.get("t") is not None]
        if not temps:
            continue
        pr = sum(s["pr"] for _, s in items if s.get("pr") is not None)
        winds = [s["ws"] for _, s in items if s.get("ws") is not None]
        gusts = [s["wg"] for _, s in items if s.get("wg") is not None]
        pops = [s["pop"] for _, s in items if s.get("pop") is not None]
        # daytime (07-20 local) symbols; whole day if none
        day_syms = [s.get("sym") for lt, s in items if 7 <= lt.hour <= 20 and s.get("sym")]
        syms = day_syms or [s.get("sym") for _, s in items if s.get("sym")]
        if pr >= 0.3:
            sym = max(syms, key=_sev, default=None)
        else:
            # dry day: most common cloudiness during the day
            dry = [x for x in syms if x in ("clear", "partly", "cloudy", "fog")] or syms
            sym = max(set(dry), key=dry.count) if dry else None
        # representative wind direction: at the hour of max wind
        wd = None
        if winds:
            wd = max(items, key=lambda x: x[1].get("ws") or -1)[1].get("wd")
        out.append(
            {
                "date": date,
                "partial": partial,
                "tmin": round(min(temps), 1),
                "tmax": round(max(temps), 1),
                "pr": round(pr, 1),
                "wsmax": round(max(winds), 1) if winds else None,
                "wgmax": round(max(gusts), 1) if gusts else None,
                "wd": wd,
                "pop": max(pops) if pops else None,
                "sym": sym,
            }
        )
    return out


def tz_for(country: str) -> str:
    return TZ_BY_COUNTRY.get(country, "UTC")

