# wx.fi

A retro cable-TV style weather info-screen built only on open data (FMI, MET Norway,
aviationweather.gov, NOAA SWPC, …). Finland and the Nordics first.

- `backend/`: the **baker**, a Python CLI that fetches upstream data and writes static JSON to `/opt/wx/html/wx/data/`
- `frontend/`: the info-screen SPA (Svelte 5 + TypeScript + Vite), served at https://wx.fi/
- `music/`: background music playlist (`playlists.json` + audio files), served at `/wx/music/`
- `deploy/`: deploy script and systemd *user* units for the `wx` account

## Baker

```sh
cd backend
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/pytest -q
.venv/bin/python -m wx jobs                 # list jobs and intervals
.venv/bin/python -m wx bake --force         # run everything now -> ./out/wx/data
.venv/bin/python -m wx bake --only aurora   # run selected jobs
```

Environment: `WX_DATA_DIR` (default `out/wx/data`), `WX_STATE_DIR` (default `var`).

| Job | Interval | Output |
|---|---|---|
| places | 24 h | `places.json` (curated places in `backend/wx/places.yaml`, airports) |
| obs | 10 min | `obs/fi.json`: latest values from all FMI stations, plus 3 h pressure tendency |
| warnings | 10 min | `warnings/fi.json`: FMI CAP warnings, fi/sv/en text, polygons |
| aviation | 10 min | `aviation.json`: METAR and TAF |
| aurora | 15 min | `aurora.json`: Kp observed and forecast, OVATION Nordic grid, solar wind, FI magnetometers |
| forecast | 60 min | `fc/<place>.json`: hourly and daily (FMI edited forecast; MET Norway outside FMI's area) |
| radar | 5 min | `radar/fi/index.json` + PNG frames: last hour of FMI radar in EPSG:3067, recoloured; fetched at the native 500 m, saved at 2 km nationally + 250 km windows at 500 m per Finnish place in `radar/local/<place>/` |
| roads | 15 min | `roads/fi.json`: Digitraffic road condition forecast per road section (projected paths) + road weather stations |
| nowcast | 10 min | `nowcast/<place>.json`: MET Norway radar nowcast, 5-min precipitation rate for ~90 min (Nordic coverage) |
| sea | 30 min | `sea/fi.json`: FMI wave buoys (Hs, direction, water temp) + mareographs (sea level vs. theoretical mean, trend) |
| lightning | 5 min | `lightning/fi.json`: FMI lightning strikes of the last hour |
| airquality | 30 min | `airquality/fi.json`: FMI hourly air quality index + PM2.5/PM10/NO2/O3 per station |
| grid | 60 min | `grid/fi.json`: 24 h of HARMONIE wind/cloud/precip/temperature on a 50 km map-space grid |
| fields | 30 min (re-bakes only on a new model run, every 3 h) | `fields/fi/index.json` + hourly PNGs: HARMONIE cloud/precipitation/temperature at 5 km from FMI's download service (NetCDF, read with `wx/netcdf3.py`), packed in RGB |
| world | 60 min (re-bakes on a new ECMWF run) | `world/index.json` + `world/<view>/<time>.png`: ECMWF temperature/precipitation/wind via FMI, 6-hourly for 60 h, resampled into each region and capital view (Lambert azimuthal equal-area, see `wx/world.json`) |
| capitals | 60 min | `world/capitals.json`: latest METAR + 3-day MET Norway forecast for each world capital |
| (runner) | each run | `health.json`: freshness and errors per job |

The timer ticks every 5 min; each job runs when its own interval has elapsed. After a
failure, a job is retried on the next tick, at most every 5 min. If a job fails, the
previous output files stay in place.

## Frontend

```sh
cd frontend
npm install
npm run dev        # http://localhost:5173/wx/app/  (data proxied from https://wx.fi; WX_DATA_ORIGIN to override)
npm test           # vitest: text forecast, config, helpers
npm run check      # svelte-check / TypeScript
npm run build      # dist/index.html (site root) + dist/app/ (served at /wx/app/)
npm run shots -- https://wx.fi/ shots   # Playwright smoke test: screenshot every slide
```

URL options: `?place=oulu,helsinki&lang=en&theme=modern&slides=current,aurora&kiosk=1&music=0`,
or a full config as `#c=<base64url JSON>` (the settings dialog has "Copy share link").
Keys: ← → browse, space pause, M music, N next track, F fullscreen, S settings.

Music: playlists live in `music/playlists.json`
(`{"playlists": [{"id", "fi", "en", "tracks": [{"src", "title", "artist", "license", "url", "download"}]}]}`;
currently smooth jazz, synth classics and synthwave, all CC BY 4.0). `python3 music/fetch.py` downloads
the audio (not in git). Users pick playlists in the settings or with `?playlist=synth,synthwave`; the
selected tracks are credited on the Data Sources slide automatically.

## Server (172.16.173.100)

- Code: `/opt/wx/code/backend`, venv `/opt/wx/code/venv`, state `/opt/wx/code/var`
- Output: `/opt/wx/html/wx/data` (served by nginx as `https://wx.fi/wx/data/…`)
- Scheduler: systemd **user** units of `wx` (lingering), in `/opt/wx/code/.config/systemd/user/`

```sh
./deploy/deploy.sh                                              # build + sync everything, update venv (no sudo)
ssh 172.16.173.100 sudo systemctl --user -M wx@ daemon-reload   # only after unit file changes
ssh 172.16.173.100 sudo systemctl --user -M wx@ list-timers
ssh 172.16.173.100 sudo journalctl _SYSTEMD_USER_UNIT=wx-bake.service -n 50
curl -s https://wx.fi/wx/data/health.json
```

## Maps

Finnish maps use ETRS-TM35FIN (EPSG:3067); the projection exists in `backend/wx/proj.py` and
`frontend/src/map/proj.ts` (kept in sync, both tested against the same values). World views
(regions and capitals, defined in `backend/wx/world.json`) use a spherical Lambert azimuthal
equal-area projection centred on each view (`wx/laea.py`, `map/laea.ts`). Basemaps are built
once from Natural Earth GeoJSON (public domain) and committed:

```sh
python3 tools/build_basemap.py <dir with ne_10m_admin_0_countries/lakes/boundary_lines_land .geojson>
# world views: 50m data for regions, 10m for capitals; also copies world.json to the frontend
python3 tools/build_world.py <dir with ne_10m_* and ne_50m_* .geojson> [view id ...]
```

## Data licences

FMI, MET Norway, Fintraffic, ECMWF (via FMI): CC BY 4.0. aviationweather.gov and NOAA SWPC: US public domain.
Natural Earth: public domain.
The info-screen has a credits slide listing them.
