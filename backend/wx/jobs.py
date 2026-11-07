"""Baker jobs. Each job fetches one family of data and writes files under DATA_DIR.

Output layout (all JSON, relative to DATA_DIR):
  places.json            curated places + airport list
  obs/fi.json            latest FMI station observations (all of Finland)
  obs/nordic.json        latest SMHI / DMI / Estonian / Icelandic (/ MET Norway Frost) observations
  fc/<place>.json        hourly + daily forecast per curated place
  aviation.json          METAR + TAF for configured airports
  warnings/fi.json       FMI CAP warnings with polygons and fi/sv/en texts
  aurora.json            Kp, OVATION Nordic grid, solar wind, FI magnetometers
  aurora/ovation.png     OVATION probabilities for both polar caps (see swpc.ovation_png)
  radar/fi/index.json    radar frame list (+ radar/fi/<time>.png, last hour, 5-min steps)
  radar/local/<place>/   500 m radar windows (250 km) around each Finnish place
  nowcast/<place>.json   MET Norway radar nowcast, 5-min precipitation for the next 90 min
  grid/fi.json           24 h of wind/cloud/precip/temperature on a 50 km map-space grid
  fields/fi/index.json   24 h of HARMONIE cloud/precip/temperature at 5 km as hourly RGB PNGs
  tropo/nordic/index.json 48 h VHF/UHF tropo (ducting) index from HARMONIE model levels, 3-hourly PNGs
  space.json             the Sun (active regions on SDO images space/hmi.jpg + space/aia193.jpg), sunspot
                         number, solar cycle, GOES X-rays/flares/protons, NOAA R/S/G scales
  hf.json                24 h HF band conditions (VOACAP) from central Finland to world regions + D-RAP
  world/index.json       ECMWF temperature/precip/wind rasters per world view (world/<view>/<time>.png)
  world/capitals.json    capitals: latest METAR + 3-day MET Norway forecast
  cams/fi/index.json     road weather cameras near each Finnish place (+ cams/fi/<preset>.jpg)
  roads/fi.json          road condition forecasts per road section (+ road weather stations)
  roads/messages.json    active Digitraffic traffic announcements (accidents, closures, ...)
  sea/fi.json            wave buoys + sea level / water temperature (FMI)
  lightning/fi.json      lightning strikes in the last hour (FMI)
  airquality/fi.json     hourly air quality index per station (FMI)
  geo/<letter>.json      GeoNames cities for the place search, by first letter of the folded name
  sky/passes.json        visible ISS / Tiangong passes for 21 days, per Finnish place + central Finland
  calendar/elections.json upcoming Finnish elections and referendums (Wikidata) for flag days
  health.json            job freshness (written by the runner)
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable

from . import daily as daily_mod
from . import places as places_mod
from . import net, settings
from .proj import EXTENTS
from .sources import aviation, cap, digitraffic, elections, fields, fmi, geonames, grid, hf, metno, nordic, radar, satellites, space, swpc, tropo, world
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


def job_nordic() -> dict:
    import json

    prev = None
    try:
        prev = json.loads((settings.DATA_DIR / "obs/nordic.json").read_text())
    except (OSError, ValueError):
        pass
    data = nordic.observations(prev)
    write_json("obs/nordic.json", data)
    return data["sources"]


def job_geonames() -> dict:
    shards = geonames.cities()
    for k, rows in shards.items():
        write_json(f"geo/{k}.json", rows)
    write_json("geo/index.json", {"updated": iso(utcnow()), "shards": sorted(shards), "count": sum(map(len, shards.values()))})
    return {"cities": sum(map(len, shards.values()))}


def job_satellites() -> dict:
    sites = {"central": satellites.SITE}
    sites.update({p.id: (p.lat, p.lon) for p in places_mod.places() if p.country == "FI"})
    data = satellites.all_passes(sites)
    write_json("sky/passes.json", data)
    return {"sites": len(sites), "passes": sum(map(len, data["sites"].values()))}


def job_traffic() -> dict:
    msgs = digitraffic.traffic_messages()
    write_json("roads/messages.json", {"updated": iso(utcnow()), "messages": msgs})
    kinds: dict[str, int] = {}
    for m in msgs:
        kinds[m["kind"]] = kinds.get(m["kind"], 0) + 1
    return kinds


def job_elections() -> dict:
    items = elections.upcoming()
    write_json("calendar/elections.json", {"updated": iso(utcnow()), "source": "wikidata", "elections": items})
    return {"elections": len(items)}


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
    def ovation() -> dict:
        raw = swpc.ovation_raw()
        write_bytes("aurora/ovation.png", swpc.ovation_png(raw))
        ov = swpc.parse_ovation(raw)
        out["ovationGlobal"] = {"file": "aurora/ovation.png", "observed": ov["observed"], "forecast": ov["forecast"]}
        return ov

    for key, fn in (("kp", swpc.kp), ("ovation", ovation), ("solarwind", swpc.solar_wind), ("mag", fmi.magnetometer)):
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


def job_space() -> dict:
    now = utcnow()
    out: dict = {"updated": iso(now)}
    errors = []

    def sun() -> dict:
        imgs = space.sun_images()
        hmi_bytes, hmi = imgs["hmi"]
        aia_bytes, aia = imgs["aia193"]
        write_bytes("space/hmi.jpg", hmi_bytes)
        write_bytes("space/aia193.jpg", aia_bytes)
        day, regs = space.parse_regions(net.get_json(f"{space.SWPC}/json/solar_regions.json"))
        placed = space.place_regions(regs, day, hmi["time"], hmi["spots"]) if day else []
        return {
            "diskR": space.DISK_R,
            "images": [
                {"kind": "hmi", "file": "space/hmi.jpg", "time": iso(hmi["time"])},
                {"kind": "aia193", "file": "space/aia193.jpg", "time": iso(aia["time"])},
            ],
            "regionsDate": day,
            "regions": placed,
            "spotGroups": len(hmi["spots"]),
        }

    def flares() -> list:
        return space.flares(net.get_json(f"{space.SWPC}/json/goes/primary/xray-flares-7-day.json"), now)

    for key, fn in (("sun", sun), ("ssn", space.daily_ssn), ("f107", space.f107), ("cycle", space.cycle), ("probabilities", space.probabilities),
                    ("xray", space.xray), ("flares", flares), ("protons", space.protons), ("scales", space.scales)):
        try:
            out[key] = fn()
        except Exception as e:
            log.warning("space %s failed: %s", key, e)
            errors.append(key)
            out[key] = None
    if len(errors) >= 7:
        raise RuntimeError(f"space sources failed: {errors}")
    write_json("space.json", out)
    return {"errors": errors, "regions": len((out.get("sun") or {}).get("regions") or [])}


RADAR_FRAMES = 13  # one hour at 5-min steps


def _frame_name(t: datetime) -> str:
    return t.strftime("%Y%m%dT%H%MZ") + ".png"


def _prune(folder, keep: set[str]) -> list[str]:
    if not folder.exists():
        return []
    for f in folder.glob("*.png"):
        if f.name not in keep:
            f.unlink(missing_ok=True)
    return sorted(f.name for f in folder.glob("*.png"))


def job_radar() -> dict:
    """National frames at 2 km + 250 km windows at the native 500 m for each Finnish place.

    One 500 m WMS request per time slot feeds both, so local views cost no extra upstream load.
    """
    extent = "fi"
    rel = f"radar/{extent}"
    folder = settings.DATA_DIR / rel
    local_places = [p for p in places_mod.places() if p.country == "FI"]
    views = {p.id: radar.local_view(p.lat, p.lon, extent) for p in local_places}
    latest = radar.latest_slot()
    slots = [latest - radar.STEP * i for i in range(RADAR_FRAMES)]
    fetched, missing = 0, 0
    for t in slots:
        nm = _frame_name(t)
        need_main = not (folder / nm).exists()
        need_local = [pid for pid in views if not (settings.DATA_DIR / f"radar/local/{pid}/{nm}").exists()]
        if not need_main and not need_local:
            continue
        try:
            raw = radar.fetch_raw(t, extent, radar.NATIVE_KM)
        except Exception as e:
            log.warning("radar %s: %s", t, e)
            missing += 1
            continue
        if radar.is_empty(raw):
            missing += 1
            continue
        if need_main:
            png, _ = radar.colorize(radar.downsample(raw, radar.size_for(extent)))
            write_bytes(f"{rel}/{nm}", png)
        for pid in need_local:
            png, _ = radar.colorize(radar.crop(raw, views[pid], extent))
            write_bytes(f"radar/local/{pid}/{nm}", png)
        fetched += 1
    keep = {_frame_name(t) for t in slots}
    frames = _prune(folder, keep)
    if not frames:
        raise RuntimeError("no radar frames available")
    local_index = {}
    for pid, view in views.items():
        lf = _prune(settings.DATA_DIR / f"radar/local/{pid}", keep)
        if lf:
            local_index[pid] = {"view": [round(v) for v in view], "frames": lf}
    w, h = radar.size_for(extent)
    to_iso = lambda f: iso(datetime.strptime(f[:-4], "%Y%m%dT%H%MZ").replace(tzinfo=timezone.utc))  # noqa: E731
    write_json(
        f"{rel}/index.json",
        {
            "updated": iso(utcnow()),
            "source": "fmi",
            "extent": list(EXTENTS[extent]),
            "width": w,
            "height": h,
            "frames": [{"time": to_iso(f), "file": f} for f in frames],
            "legend": [{"dbz": lo, "rgba": list(rgba)} for lo, rgba in radar.PALETTE],
            # 500 m windows: radar/local/<place>/<file>, same file names as `frames`
            "local": local_index,
        },
    )
    return {"frames": len(frames), "fetched": fetched, "missing": missing, "local": len(local_index)}


def job_grid() -> dict:
    data = grid.fields("fi")
    write_json("grid/fi.json", data)
    return {"nodes": data["nx"] * data["ny"], "times": len(data["times"])}


def job_fields() -> dict:
    """Re-bake only when a new model run is out (HARMONIE runs every 3 h)."""
    import json

    extent = "fi"
    rel = f"fields/{extent}"
    folder = settings.DATA_DIR / rel
    origin = fields.latest_origin()
    idx = folder / "index.json"
    if idx.exists():
        try:
            old = json.loads(idx.read_text())
            fresh_enough = datetime.now(timezone.utc) - datetime.fromisoformat(old["updated"].replace("Z", "+00:00")) < timedelta(hours=4)
            if old.get("origin") == iso(origin) and fresh_enough:
                return {"skipped": "same run", "origin": iso(origin)}
        except (ValueError, KeyError):
            pass
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    meta, frames = fields.rasters(fields.download(origin, start, 24, extent), extent)
    if len(frames) < 6:
        raise RuntimeError(f"only {len(frames)} frames")
    names = []
    for t, png in frames:
        name = t.strftime("%Y%m%dT%HZ") + ".png"
        write_bytes(f"{rel}/{name}", png)
        names.append(name)
    for f in folder.glob("*.png"):
        if f.name not in names:
            f.unlink(missing_ok=True)
    write_json(
        f"{rel}/index.json",
        {
            "updated": iso(utcnow()),
            "source": "fmi-harmonie",
            "origin": iso(origin),
            **meta,
            "times": [iso(t) for t, _ in frames],
            "files": names,
        },
    )
    return {"frames": len(frames), "origin": iso(origin), "bytes": sum(len(p) for _, p in frames)}


def job_world() -> dict:
    """ECMWF rasters for every world view; re-baked when a new ECMWF run appears (twice a day)."""
    import json

    idx_path = settings.DATA_DIR / "world/index.json"
    origin = world.latest_origin()
    start = world.first_step()
    old: dict = {}
    if idx_path.exists():
        try:
            old = json.loads(idx_path.read_text())
        except ValueError:
            old = {}
    if old.get("origin") == iso(origin) and old.get("start") == iso(start):
        return {"skipped": "same run", "origin": iso(origin)}
    out_views: dict = dict(old.get("views", {})) if old.get("origin") == iso(origin) else {}
    failed = []

    def make(v):
        try:
            return v, world.rasters(world.download(v, origin, start), v)
        except Exception as e:
            log.warning("world %s: %s", v["id"], e)
            return v, None

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(make, world.views()))
    for v, res in results:
        if res is None:
            failed.append(v["id"])
            continue
        meta, frames = res
        rel = f"world/{v['id']}"
        names = []
        for t, png in frames:
            name = t.strftime("%Y%m%dT%HZ") + ".png"
            write_bytes(f"{rel}/{name}", png)
            names.append(name)
        for f in (settings.DATA_DIR / rel).glob("*.png"):
            if f.name not in names:
                f.unlink(missing_ok=True)
        out_views[v["id"]] = {**meta, "times": [iso(t) for t, _ in frames], "files": names}
    if not out_views:
        raise RuntimeError("no world views produced")
    write_json(
        "world/index.json",
        {"updated": iso(utcnow()), "source": "ecmwf-via-fmi", "origin": iso(origin), "start": iso(start), "views": out_views},
    )
    return {"views": len(out_views), "failed": failed, "origin": iso(origin)}


def job_capitals() -> dict:
    caps = world.WORLD["capitals"]
    try:
        metars = aviation.metars([c["icao"] for c in caps])
    except Exception as e:
        log.warning("capital metars: %s", e)
        metars = {}
    hour = iso(utcnow().replace(minute=0, second=0))

    def fc(c):
        try:
            steps = metno.forecast(c["lat"], c["lon"])
            return c["id"], daily_mod.daily(steps, c["tz"])[:4], next((s for s in steps if s["time"] >= hour), None)
        except Exception as e:
            log.info("capital forecast %s: %s", c["id"], e)
            return c["id"], None, None

    with ThreadPoolExecutor(max_workers=4) as pool:
        fcs = list(pool.map(fc, caps))
    out, fc_ok = {}, 0
    for cid, days, now_step in fcs:
        c = next(x for x in caps if x["id"] == cid)
        out[cid] = {"metar": metars.get(c["icao"]), "daily": days or [], "now": now_step}
        fc_ok += days is not None
    if fc_ok == 0 and not metars:
        raise RuntimeError("no capital data")
    write_json("world/capitals.json", {"updated": iso(utcnow()), "capitals": out})
    return {"metar": len(metars), "forecasts": fc_ok}


CAMS_PER_PLACE = 3
CAM_RADIUS_KM = 30


def job_cams() -> dict:
    """Up to 3 road weather cameras near each Finnish place. Each run refreshes the oldest
    local image per place (so ~25 downloads per run), skipping presets without a newer image."""
    import json

    from .geo import haversine_km

    rel = "cams/fi"
    idx_path = settings.DATA_DIR / rel / "index.json"
    old: dict = {}
    if idx_path.exists():
        try:
            old = json.loads(idx_path.read_text()).get("places", {})
        except ValueError:
            old = {}
    have = {c["preset"]: c for cams in old.values() for c in cams}
    stations = digitraffic.cam_stations()
    times = digitraffic.cam_times()
    places: dict = {}
    fetched = failed = 0
    for p in places_mod.places():
        if p.country != "FI":
            continue
        near = sorted(
            ((haversine_km(p.lat, p.lon, s["lat"], s["lon"]), s) for s in stations),
            key=lambda x: x[0],
        )
        chosen = [s for d, s in near if d <= CAM_RADIUS_KM][:CAMS_PER_PLACE]
        cams = []
        for s in chosen:
            preset = s["presets"][0]
            prev = have.get(preset)
            cams.append(
                {
                    "station": s["id"],
                    "preset": preset,
                    "name": s["name"],
                    "road": s["road"],
                    "lat": round(s["lat"], 5),
                    "lon": round(s["lon"], 5),
                    "time": prev["time"] if prev and (settings.DATA_DIR / rel / f"{preset}.jpg").exists() else None,
                    "file": f"{preset}.jpg",
                }
            )
        # refresh the stalest camera of this place if the source has something newer
        todo = sorted(cams, key=lambda c: c["time"] or "")
        for c in todo[:1]:
            src_t = times.get(c["preset"])
            if c["time"] and src_t and src_t <= c["time"]:
                continue
            try:
                write_bytes(f"{rel}/{c['file']}", digitraffic.cam_image(c["preset"]))
                c["time"] = src_t or iso(utcnow())
                fetched += 1
            except Exception as e:
                log.info("cam %s: %s", c["preset"], e)
                failed += 1
        places[p.id] = [c for c in cams if c["time"]]
    keep = {c["file"] for cams in places.values() for c in cams}
    for f in (settings.DATA_DIR / rel).glob("*.jpg"):
        if f.name not in keep:
            f.unlink(missing_ok=True)
    write_json(f"{rel}/index.json", {"updated": iso(utcnow()), "source": "digitraffic", "places": places})
    return {"places": sum(1 for v in places.values() if v), "fetched": fetched, "failed": failed}


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


def job_nowcast() -> dict:
    counts = {"ok": 0, "nocoverage": 0, "failed": 0}
    for p in places_mod.places():
        try:
            nc = metno.nowcast(p.lat, p.lon)
        except Exception as e:  # e.g. outside the nowcast domain
            log.info("nowcast %s: %s", p.id, e)
            counts["failed"] += 1
            continue
        if nc["coverage"] != "ok" or not nc["steps"]:
            counts["nocoverage"] += 1
        else:
            counts["ok"] += 1
        write_json(f"nowcast/{p.id}.json", {"place": p.id, "source": "metno", **nc})
    if counts["ok"] == 0:
        raise RuntimeError(f"no nowcasts: {counts}")
    return counts


def job_sea() -> dict:
    data = fmi.sea()
    if not data["waves"] and not data["levels"]:
        raise RuntimeError("no sea observations")
    write_json("sea/fi.json", data)
    return {"waves": len(data["waves"]), "levels": len(data["levels"])}


def job_lightning() -> dict:
    data = fmi.lightning()
    write_json("lightning/fi.json", data)
    return {"strikes": len(data["strikes"])}


def job_hf() -> dict:
    data = hf.fetch()
    write_json("hf.json", data)
    open_now = sum(c != "0" for r in data["regions"] for c in r["levels"][0])
    return {"ssn": data["ssn"], "open_now": open_now, "drap_event": bool(data["drap"] and data["drap"]["event"])}


TROPO_EXTENT = "nordic"
TROPO_HOURS = 48
TROPO_STEP_H = 3
TROPO_BUDGET_S = 100  # per bake tick; the whole bake must finish within the unit's 240 s timeout


def job_tropo() -> dict:
    """Tropo index frames for a new HARMONIE run, built over several ticks (each frame is a ~100 MB
    download), published only when complete so the map always shows one consistent run."""
    import json
    import time

    t0 = time.monotonic()
    rel = f"tropo/{TROPO_EXTENT}"
    folder = settings.DATA_DIR / rel
    build_path = settings.STATE_DIR / "tropo_build.json"
    published = None
    try:
        published = json.loads((folder / "index.json").read_text())
    except (OSError, ValueError):
        pass

    build = None
    try:
        build = json.loads(build_path.read_text())
    except (OSError, ValueError):
        pass

    if build is None:
        # nothing in progress: start one if a newer run is out (and the published one is not brand new)
        if published:
            age = datetime.now(timezone.utc) - datetime.fromisoformat(published["updated"].replace("Z", "+00:00"))
            if age < timedelta(hours=2, minutes=30):
                return {"skipped": "recent", "origin": published.get("origin")}
        origin = tropo.latest_origin()
        if published and published.get("origin") == iso(origin):
            return {"skipped": "same run", "origin": iso(origin)}
        h = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        start = h - timedelta(hours=h.hour % TROPO_STEP_H)
        times = [start + timedelta(hours=k) for k in range(0, TROPO_HOURS + 1, TROPO_STEP_H)]
        times = [t for t in times if t >= origin]
        build = {"origin": iso(origin), "times": [iso(t) for t in times], "files": {}, "started": iso(utcnow())}

    origin = datetime.fromisoformat(build["origin"].replace("Z", "+00:00"))
    rs = tropo.Resampler(EXTENTS[TROPO_EXTENT])
    done_now = 0
    stats = {}
    for t_iso in build["times"]:
        if t_iso in build["files"]:
            continue
        if done_now and time.monotonic() - t0 > TROPO_BUDGET_S:
            break
        t = datetime.fromisoformat(t_iso.replace("Z", "+00:00"))
        png, summary = tropo.frame(origin, t, rs)
        name = f"{origin:%Y%m%dT%H}_{t:%Y%m%dT%HZ}.png"
        write_bytes(f"{rel}/{name}", png)
        build["files"][t_iso] = name
        stats[t_iso] = summary
        done_now += 1
        build_path.parent.mkdir(parents=True, exist_ok=True)
        build_path.write_text(json.dumps(build))
        # a build that drags on (e.g. repeated failures) is abandoned for a newer run
    if len(build["files"]) < len(build["times"]):
        started = datetime.fromisoformat(build["started"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) - started > timedelta(hours=3):
            build_path.unlink(missing_ok=True)
            return {"abandoned": build["origin"], "frames": len(build["files"])}
        return {"building": build["origin"], "frames": f"{len(build['files'])}/{len(build['times'])}", "stats": stats}

    names = [build["files"][t] for t in build["times"]]
    write_json(
        f"{rel}/index.json",
        {
            "updated": iso(utcnow()),
            "source": "fmi-harmonie-hybrid",
            "origin": build["origin"],
            **tropo.meta(rs),
            "times": build["times"],
            "files": names,
        },
    )
    for f in folder.glob("*.png"):
        if f.name not in names:
            f.unlink(missing_ok=True)
    build_path.unlink(missing_ok=True)
    return {"published": build["origin"], "frames": len(names), "stats": stats}


def job_airquality() -> dict:
    data = fmi.airquality()
    if not data["stations"]:
        raise RuntimeError("no air quality stations")
    write_json("airquality/fi.json", data)
    return {"stations": len(data["stations"])}


JOBS: list[Job] = [
    Job("places", 24 * 3600, job_places),
    Job("geonames", 7 * 24 * 3600, job_geonames),
    Job("elections", 7 * 24 * 3600, job_elections),
    Job("satellites", 3 * 3600, job_satellites),
    Job("obs", 10 * 60, job_obs),
    Job("nordic", 20 * 60, job_nordic),
    Job("warnings", 10 * 60, job_warnings),
    Job("aviation", 10 * 60, job_aviation),
    Job("aurora", 15 * 60, job_aurora),
    Job("space", 15 * 60, job_space),
    Job("forecast", 60 * 60, job_forecast),
    Job("radar", 5 * 60, job_radar),
    Job("grid", 60 * 60, job_grid),
    Job("fields", 30 * 60, job_fields),
    Job("world", 60 * 60, job_world),
    Job("capitals", 60 * 60, job_capitals),
    Job("roads", 15 * 60, job_roads),
    Job("cams", 15 * 60, job_cams),
    Job("traffic", 5 * 60, job_traffic),
    Job("nowcast", 10 * 60, job_nowcast),
    Job("sea", 30 * 60, job_sea),
    Job("lightning", 5 * 60, job_lightning),
    Job("airquality", 30 * 60, job_airquality),
    Job("tropo", 5 * 60, job_tropo),
    Job("hf", 60 * 60, job_hf),
]
