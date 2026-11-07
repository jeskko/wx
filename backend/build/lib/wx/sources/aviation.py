"""METAR/TAF from aviationweather.gov Data API (US public domain, global)."""

from datetime import datetime, timezone

from .. import net
from ..store import iso

BASE = "https://aviationweather.gov/api/data"


def _ts(epoch) -> str | None:
    return iso(datetime.fromtimestamp(epoch, timezone.utc)) if epoch else None


def _vis_m(v) -> int | None:
    """aviationweather gives statute miles, '6+' or '10+' strings."""
    if v is None:
        return None
    if isinstance(v, str):
        if v.endswith("+"):
            return 9999
        try:
            v = float(v)
        except ValueError:
            return None
    return min(9999, int(round(v * 1609.344, -1)))


def parse_metars(rows: list[dict]) -> dict[str, dict]:
    out = {}
    for m in rows:
        icao = m.get("icaoId")
        if not icao:
            continue
        prev = out.get(icao)
        if prev and prev["obsTime"] >= m.get("obsTime", 0):
            continue
        out[icao] = m
    return {
        icao: {
            "icao": icao,
            "name": (m.get("name") or "").split(",")[0],
            "lat": m.get("lat"),
            "lon": m.get("lon"),
            "time": _ts(m.get("obsTime")),
            "raw": m.get("rawOb"),
            "t": m.get("temp"),
            "td": m.get("dewp"),
            "wd": m.get("wdir") if isinstance(m.get("wdir"), int) else None,
            "wdvrb": m.get("wdir") == "VRB",
            "wskt": m.get("wspd"),
            "wgkt": m.get("wgst"),
            "vis": _vis_m(m.get("visib")),
            "qnh": m.get("altim"),
            "wx": m.get("wxString"),
            "clouds": [{"cover": c.get("cover"), "base": c.get("base")} for c in (m.get("clouds") or [])],
            "cat": m.get("fltCat"),
        }
        for icao, m in out.items()
    }


def parse_tafs(rows: list[dict]) -> dict[str, dict]:
    out = {}
    for t in rows:
        icao = t.get("icaoId")
        if not icao or (icao in out and not t.get("mostRecent")):
            continue
        out[icao] = {
            "icao": icao,
            "issued": t.get("issueTime"),
            "from": _ts(t.get("validTimeFrom")),
            "to": _ts(t.get("validTimeTo")),
            "raw": t.get("rawTAF"),
        }
    return out


def _chunks(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i : i + n]


def metars(ids: list[str]) -> dict[str, dict]:
    rows = []
    for chunk in _chunks(ids, 40):
        rows += net.get_json(f"{BASE}/metar", {"ids": ",".join(chunk), "format": "json"}) or []
    return parse_metars(rows)


def tafs(ids: list[str]) -> dict[str, dict]:
    rows = []
    for chunk in _chunks(ids, 40):
        rows += net.get_json(f"{BASE}/taf", {"ids": ",".join(chunk), "format": "json"}) or []
    return parse_tafs(rows)
