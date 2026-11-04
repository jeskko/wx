"""Baker jobs. Each job fetches one family of data and writes files under DATA_DIR.

Output layout (all JSON, relative to DATA_DIR):
  places.json            curated places + airport list
  obs/fi.json            latest FMI station observations (all of Finland)
  fc/<place>.json        hourly + daily forecast per curated place
  aviation.json          METAR + TAF for configured airports
  warnings/fi.json       FMI CAP warnings with polygons and fi/sv/en texts
  aurora.json            Kp, OVATION Nordic grid, solar wind, FI magnetometers
  radar/fi/index.json    radar frame list (+ radar/fi/<time>.png, last hour, 5-min steps)
  grid/fi.json           24 h of wind/cloud/precip/temperature on a map-space grid
  roads/fi.json          road condition forecasts per road section (+ road weather stations)
  health.json            job freshness (written by the runner)
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

from . import daily as daily_mod
from . import places as places_mod
from . import settings
from .proj import EXTENTS
from .sources import aviation, cap, digitraffic, fmi, grid, metno, radar, swpc
from .store import iso, utcnow, write_bytes, write_json

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Job:
    name: str
    interval_s: int
    run: Callable[[], dict]  # returns a small summary for health.json


def job_places() -> dict:
    ps = places_mod.places()
    write_json(
        "places.json",
        {"updated": iso(utcnow()), "places": [p.to_json() for p in ps], "airports": places_mod.airports()},
    )
    return {"places": len(ps)}


def job_obs() -> dict:
    data = fmi.observations()
    write_json("obs/fi.json", data)
    return {"stations": len(data["stations"])}


def job_forecast() -> dict:
    ps = places_mod.places()
    fmi_steps = fmi.forecasts([(p.lat, p.lon) for p in ps])
    counts = {"fmi": 0, "metno": 0, "failed": 0}
    now = iso(utcnow())
    for p, steps in zip(ps, fmi_steps):
        source = "fmi"
        if len(steps) < 24:
            try:
                steps = metno.forecast(p.lat, p.lon)
                source = "metno"
            except Exception as e:  # keep the previous file if both fail
                log.warning("forecast %s: metno fallback failed: %s", p.id, e)
                counts["failed"] += 1
                continue
        counts[source] += 1
        write_json(
            f"fc/{p.id}.json",
            {
                "place": p.id,
                "source": source,
                "updated": now,
                "tz": daily_mod.tz_for(p.country),
                "hourly": steps,
                "daily": daily_mod.daily(steps, daily_mod.tz_for(p.country)),
            },
        )
    if counts["fmi"] + counts["metno"] == 0:
        raise RuntimeError("no forecasts produced")
    return counts


def job_aviation() -> dict:
    ids = places_mod.airports()
    metars = aviation.metars(ids)
    try:
        tafs = aviation.tafs(ids)
    except Exception as e:
        log.warning("taf fetch failed: %s", e)
        tafs = {}
    write_json("aviation.json", {"updated": iso(utcnow()), "metar": metars, "taf": tafs})
    return {"metar": len(metars), "taf": len(tafs)}


def job_warnings() -> dict:
    ws = cap.warnings()
    write_json("warnings/fi.json", {"updated": iso(utcnow()), "source": "fmi", "warnings": ws})
    return {"warnings": len(ws)}


def job_aurora() -> dict:
    out: dict = {"updated": iso(utcnow())}
    errors = []
    for key, fn in (("kp", swpc.kp), ("ovation", swpc.ovation), ("solarwind", swpc.solar_wind), ("mag", fmi.magnetometer)):
        try:
            out[key] = fn()
        except Exception as e:
            log.warning("aurora %s failed: %s", key, e)
            errors.append(key)
            out[key] = None
    if len(errors) == 4:
        raise RuntimeError("all aurora sources failed")
    write_json("aurora.json", out)
    return {"errors": errors}


RADAR_FRAMES = 13  # one hour at 5-min steps


def job_radar() -> dict:
    extent = "fi"
    rel = f"radar/{extent}"
    folder = settings.DATA_DIR / rel
    latest = radar.latest_slot()
    slots = [latest - radar.STEP * i for i in range(RADAR_FRAMES)]
    name = lambda t: t.strftime("%Y%m%dT%H%MZ") + ".png"  # noqa: E731
    fetched, missing = 0, 0
    for t in slots:
        if (folder / name(t)).exists():
            continue
        try:
            raw = radar.fetch_raw(t, extent)
        except Exception as e:
            log.warning("radar %s: %s", t, e)
            missing += 1
            continue
        if radar.is_empty(raw):
            missing += 1
            continue
        png, _ = radar.colorize(raw)
        write_bytes(f"{rel}/{name(t)}", png)
        fetched += 1
    # drop frames that fell out of the window
    keep = {name(t) for t in slots}
    if folder.exists():
        for f in folder.glob("*.png"):
            if f.name not in keep:
                f.unlink(missing_ok=True)
    frames = sorted(f.name for f in folder.glob("*.png")) if folder.exists() else []
    if not frames:
        raise RuntimeError("no radar frames available")
    w, h = radar.size_for(extent)
    write_json(
        f"{rel}/index.json",
        {
            "updated": iso(utcnow()),
            "source": "fmi",
            "extent": list(EXTENTS[extent]),
            "width": w,
            "height": h,
            "frames": [
                {"time": iso(datetime.strptime(f[:-4], "%Y%m%dT%H%MZ").replace(tzinfo=timezone.utc)), "file": f}
                for f in frames
            ],
            "legend": [{"dbz": lo, "rgba": list(rgba)} for lo, rgba in radar.PALETTE],
        },
    )
    return {"frames": len(frames), "fetched": fetched, "missing": missing}


def job_grid() -> dict:
    data = grid.fields("fi")
    write_json("grid/fi.json", data)
    return {"nodes": data["nx"] * data["ny"], "times": len(data["times"])}


def job_roads() -> dict:
    secs = digitraffic.sections("fi")
    try:
        stations = digitraffic.stations()
    except Exception as e:
        log.warning("road stations failed: %s", e)
        stations = []
    write_json(
        "roads/fi.json",
        {
            "updated": iso(utcnow()),
            "source": "digitraffic",
            "extent": list(EXTENTS["fi"]),
            "steps": digitraffic.STEPS,
            "times": digitraffic.forecast_times(),
            "sections": secs,
            "stations": stations,
        },
    )
    poor = sum(1 for s in secs if any(c in "PX" for c in s["cond"]))
    return {"sections": len(secs), "poor": poor, "stations": len(stations)}


JOBS: list[Job] = [
    Job("places", 24 * 3600, job_places),
    Job("obs", 10 * 60, job_obs),
    Job("warnings", 10 * 60, job_warnings),
    Job("aviation", 10 * 60, job_aviation),
    Job("aurora", 15 * 60, job_aurora),
    Job("forecast", 60 * 60, job_forecast),
    Job("radar", 5 * 60, job_radar),
    Job("grid", 60 * 60, job_grid),
    Job("roads", 15 * 60, job_roads),
]
