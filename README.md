# wx.fi

A retro cable-TV style weather info-screen built only on open data (FMI, MET Norway,
aviationweather.gov, NOAA SWPC, …). Finland and the Nordics first.

- `backend/`: the **baker**, a Python CLI that fetches upstream data and writes static JSON to `/opt/wx/html/wx/data/`
- `frontend/`: the info-screen SPA (not yet built)
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
| (runner) | each run | `health.json`: freshness and errors per job |

The timer ticks every 5 min; each job runs when its own interval has elapsed. After a
failure, a job is retried on the next tick, at most every 5 min. If a job fails, the
previous output files stay in place.

## Server (172.16.173.100)

- Code: `/opt/wx/code/backend`, venv `/opt/wx/code/venv`, state `/opt/wx/code/var`
- Output: `/opt/wx/html/wx/data` (served by nginx as `https://wx.fi/wx/data/…`)
- Scheduler: systemd **user** units of `wx` (lingering), in `/opt/wx/code/.config/systemd/user/`

```sh
./deploy/deploy.sh                                              # sync code + units, update venv (no sudo)
ssh 172.16.173.100 sudo systemctl --user -M wx@ daemon-reload   # only after unit file changes
ssh 172.16.173.100 sudo systemctl --user -M wx@ list-timers
ssh 172.16.173.100 sudo journalctl _SYSTEMD_USER_UNIT=wx-bake.service -n 50
curl -s https://wx.fi/wx/data/health.json
```

## Data licences

FMI, MET Norway, Fintraffic: CC BY 4.0. aviationweather.gov and NOAA SWPC: US public domain.
The info-screen has a credits slide listing them.
