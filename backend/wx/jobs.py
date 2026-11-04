"""Baker jobs. Each job fetches one family of data and writes files under DATA_DIR.

Output layout (all JSON, relative to DATA_DIR):
  places.json            curated places + airport list
  obs/fi.json            latest FMI station observations (all of Finland)
  fc/<place>.json        hourly + daily forecast per curated place
  aviation.json          METAR + TAF for configured airports
  warnings/fi.json       FMI CAP warnings with polygons and fi/sv/en texts
  aurora.json            Kp, OVATION Nordic grid, solar wind, FI magnetometers
  health.json            job freshness (written by the runner)
"""

import logging
from dataclasses import dataclass
from typing import Callable

from . import daily as daily_mod
from . import places as places_mod
from .sources import aviation, cap, fmi, metno, swpc
from .store import iso, utcnow, write_json

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


JOBS: list[Job] = [
    Job("places", 24 * 3600, job_places),
    Job("obs", 10 * 60, job_obs),
    Job("warnings", 10 * 60, job_warnings),
    Job("aviation", 10 * 60, job_aviation),
    Job("aurora", 15 * 60, job_aurora),
    Job("forecast", 60 * 60, job_forecast),
]
