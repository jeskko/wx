# wx.fi

A cable-TV style weather info-screen built only on open data (FMI, Fintraffic, MET Norway,
SMHI, DMI, the Estonian and Icelandic weather services, ECMWF via FMI, aviationweather.gov,
NOAA SWPC, NASA SDO, GeoNames, Natural Earth). An auto-advancing loop of
slides with background music, in Finnish and English, with a retro and a modern theme and a
Teksti-TV (teletext) mode.
Finland first, with Nordic, continental and world-capital views.

- `backend/`: the **baker**, a Python CLI that fetches upstream data and writes static JSON/PNG/JPEG to `/opt/wx/html/wx/data/`
- `frontend/`: the info-screen SPA (Svelte 5 + TypeScript + Vite), served at https://wx.fi/
- `music/`: background music playlists (`playlists.json`; audio files are fetched, not in git), served at `/wx/music/`
- `tools/`: one-off basemap builders (Natural Earth → SVG path JSON)
- `deploy/`: deploy script and systemd *user* units for the `wx` account

Everything shared is fetched centrally by the baker (one request per interval regardless of
viewer count, identifying User-Agent, last good data survives outages, viewers' IPs stay
with wx.fi). Browsers only load wx.fi itself, with one exception: the forecast for a place
added with the place search (outside the curated list) is fetched by the browser from MET
Norway's locationforecast (CORS-enabled, cached 45 min in localStorage).

## Slides

Per place (repeat for each configured place; a place × slide matrix in the settings turns
them off per place):

| id | Slide |
|---|---|
| `current` | Current conditions: nearest station from FMI, SMHI, DMI, Estonia or Iceland (gaps filled from stations within 50 km), else METAR, else the forecast for this hour; for Finnish places also a 500 m local radar loop with lightning, a 90-min MET Norway precipitation nowcast and a random nearby Digitraffic road weather camera |
| `next36` | Seuraavat 36 tuntia / The Next 36 Hours: generated text forecast for three periods |
| `chart` | Hourly temperature / precipitation / wind chart |
| `extended` | Multi-day forecast |

Once per loop:

| id | Slide |
|---|---|
| `warnings` | FMI warnings for the whole country, own places first (scrolls when long) |
| `radar` | Radar loop of Finland, last hour, with lightning |
| `cloudmap` | HARMONIE clouds and precipitation, next 24 h, 5 km |
| `hf` | HF band conditions (160–10 m; 160 m is just below VOACAP's specified 2–30 MHz) for the next 24 h from central Finland to 8 world regions: best mode per band (SSB/CW/FT8/closed) and MUF, from VOACAP (vendored DVOACAP-Python), with sunspot number, Kp and D-RAP blackout warnings |
| `vhf` | Special VHF propagation, computed in the browser: sporadic-E chance on 6/4/2 m from Finland to Central Europe (ITU-R P.534-6 attenuation formula + its European foEs climatology, Fig. 7; statistics, not a forecast), meteor scatter (sporadic diurnal/seasonal cycle per ITU-R P.843 + IMO shower profiles weighted by radiant altitude) and radio aurora (Kp rule of thumb); see `frontend/src/lib/vhf.ts` |
| `tropo` | VHF/UHF tropospheric propagation (ducting) over the Nordics, next 48 h: an index computed from refractivity on HARMONIE's lowest 26 model levels |
| `tempmap` | Observed temperatures over a 5 km model temperature field |
| `regional` | Regional observations table |
| `windmap` | Wind particles (50 km HARMONIE grid) |
| `roadmap` | Digitraffic driving conditions per road section, now → +12 h |
| `traffic` | Liikennetiedotteet / Traffic Announcements: active Digitraffic announcements (accidents, closures, congestion …) on a map + list; recent accidents and closures also run in the ticker. The feed is Finnish only; English uses our own translations of the fixed feature vocabulary |
| `sea` | Merisää / Sea Conditions: coastal winds, wave buoys, sea level and water temperature |
| `airquality` | FMI air quality index on a map + table |
| `aurora` | Aurora summary: Kp now/forecast, solar wind, FMI magnetometer traffic lights, chance per city |
| `auroramap` | OVATION auroral oval over the Nordics |
| `auroraglobe` | Revontulet maapallolla / Aurora Worldwide: both auroral ovals on polar maps with the night side shaded, Kp now and in 24 h |
| `sun` | Aurinko / The Sun Today: SDO image (visible light, then extreme UV half-way) with NOAA's numbered active regions placed on the detected sunspot groups and coloured by M-flare chance; sunspot number, F10.7, flare chances, region table and the solar cycle since 2008 with SWPC's prediction |
| `spaceweather` | Avaruussää / Space Weather: NOAA R/S/G scales now and forecast for 3 days, GOES X-ray flux for 24 h with flares marked, flare counts, biggest flare of the week, proton flux |
| `aviation`, `taf` | METAR and TAF for the configured airports (scroll when long); optionally decoded into plain Finnish/English (wind in m/s, cloud heights in metres, times in the airport's local time) |
| `almanac` | Moon phase + sunrise/sunset/day length for chosen cities (handles polar night and midnight sun); flag days, holidays and other special days of the next two weeks |
| `sky` | Taivaalla tänä yönä / Tonight's Sky: naked-eye planets, Moon, bright stars and constellations over central Finland; meteor showers; visible ISS / Tiangong passes for the first configured Finnish place (tracks drawn on the chart; else the next visible pass) |
| `map-<region>` | ECMWF temperature + precipitation + wind particles, next 48 h: Nordic countries, Europe, Asia, North and South America, Africa, Oceania |
| `capital` | Repeats for each selected world capital: local time, METAR, 3-day forecast, 900 km map with wind |
| `credits` | Data sources and the tracks of the selected playlists |

Next to the date the header shows the day's Finnish flag day (with a flag), public holiday
(in red) or other special day; the almanac lists those of the next two weeks. Holidays,
traditional days (laskiainen, kynttilänpäivä …), the summer time changes and the equinoxes /
solstices are computed in `frontend/src/lib/specialdays.ts` (no name days: that list is
copyrighted). Flag days
are computed in `frontend/src/lib/flagdays.ts` from the Ministry of the Interior's list
(official and established days, election days by the election act). Elections the rules can't
predict (European Parliament elections, early elections, referendums, second presidential
rounds) come from Wikidata via the `elections` job; for regular elections the computed date
wins if the two disagree. Manual additions go into the `EXTRA` list.

Long lists hold still for 2.5 s, then scroll to the bottom before the slide ends
(`lib/autoscroll.ts`). Slides whose data is missing or stale are skipped.

Places: the curated list (`backend/wx/places.yaml`, everything baked) plus any town found
with the place search in the settings (GeoNames: every city of 15 000+ inhabitants, every
place of 1 000+ in the Nordic and Baltic countries, Finnish names for Finnish places). Added
places are stored in the configuration (`custom`, ids `geo-<geonameid>`) and get the
per-place slides with a MET Norway forecast.

The default configuration (what a first-time viewer gets) is `DEFAULT_CONFIG` in
`frontend/src/engine/config.ts`: Finnish, modern theme, places Helsinki, Oulu, Kuopio,
Tampere, Turku, Rovaniemi and Stockholm, every slide on, credits last. Slides added in later
versions are inserted before the credits in viewers' saved configurations.

## Teletext mode

`?theme=teletext` (or Teksti-TV in the settings) shows the same data as an honest Level 1.5
teletext service (ETS 300 706) on a 4:3 screen, a "Pages from Ceefax"-style in-vision carousel with the music:
40×25 cells, eight colours, 2×3 block graphics, and every colour, graphics or size change
spending a character cell. Composers in `frontend/src/teletext/pages/` describe cells; `page.ts`
compiles them into real page bytes (attributes go into the spaces before a change, hold
mosaics keep colour fields solid) and `decode.ts` renders them with a decoder's set-at/set-after
rules, so nothing appears that a real TV couldn't show. Text uses the Finnish/Swedish national
character set like Yle Teksti-TV (no degree sign: temperatures are `+5`, wind `LU 5`, weather two-letter codes
explained on page 419) and the public-domain [Bedstead](https://bjh21.me.uk/bedstead/) font.

| Page | | Page | |
|---|---|---|---|
| 100 | front page | 428 / 429 | METAR / TAF |
| 400 | weather index | 430 | sun and moon, special days |
| 401 | text forecast, a subpage per place | 600 | space and radio index |
| 402 | observations (16 towns, own places) | 601 | aurora: Kp, solar wind, Kp bars, chance per city |
| 404 | temperature map (Finland hollow, NOS style) | 603 | space weather: NOAA scales, X-ray flux plot |
| 405 | 5-day table per place (NOS style) | 610 | HF bands per region, now/+6/+12/+18 h |
| 409 | warnings | 611 | tropo map: now, +12, +24, +36 h |
| 419 | abbreviations | 899 | data sources, music |

The carousel runs the front page and then one page per enabled slide in the configured order
(seconds per subpage = the slide's duration). Type a page number, use ← → (pages), ↑ ↓
(subpages), R G Y C (Fastext) or click a page number to hold a page; space toggles HOLD; W
switches between 4:3 and stretched 16:9. After two minutes without input the carousel resumes.
Slides without a page (radar, cloud and wind maps, roads, sea, sky, world maps …) are not shown
in this mode.

The layouts follow what real services did with the same constraints: Yle Teksti-TV for the
number and word conventions (signed temperatures, compass letters, condition codes, a legend
page), NOS Teletekst 702/704 for the hollow country map with numbers in it and the 5-day table,
SwissTXT for separated-mosaic level bars, Ceefax/Pages from Ceefax for the in-vision carousel.
No broadcaster had HF, tropo or space weather pages; those are our own, built from the same
parts (coloured blocks per band, a mosaic map coloured by index with the coast drawn on top,
block-graphic bar charts and plots). `npm test` covers the encoder and decoder
(`teletext.test.ts`): attribute placement, background bars, double height, hold mosaics,
character set transliteration.

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
| nordic | 20 min | `obs/nordic.json`: same shape from SMHI (Sweden), DMI (Denmark, Faroes), the Estonian Environment Agency and the Icelandic Met Office; Norway (MET Norway Frost) only if a client id is put in `$WX_STATE_DIR/frost_client_id`. A failing service keeps its stations for up to 3 h |
| satellites | 3 h | `sky/passes.json`: visible ISS and Tiangong passes for 21 days, per Finnish place and central Finland (CelesTrak elements cached 12 h, SGP4 via `sgp4`; at least 10° up, observer's sun below −6°, satellite sunlit; magnitude from a standard magnitude and phase angle). Positions checked against Skyfield |
| elections | 7 days | `calendar/elections.json`: upcoming Finnish elections and referendums from Wikidata (CC0; day-precision dates only, one entry per day) |
| geonames | 7 days | `geo/<aa>.json`: GeoNames cities for the place search, split by the first two letters of the folded name |
| warnings | 10 min | `warnings/fi.json`: FMI CAP warnings, fi/sv/en text, polygons |
| aviation | 10 min | `aviation.json`: METAR and TAF |
| aurora | 15 min | `aurora.json`: Kp observed and forecast, OVATION Nordic grid, solar wind, FI magnetometers; `aurora/ovation.png`: OVATION for both polar caps (8-bit, 360 × 92) |
| space | 15 min | `space.json` + `space/hmi.jpg`, `space/aia193.jpg`: SDO quick-look images recentred to a common geometry (disk radius 0.4 × 720 px), sunspot groups detected on the HMI continuum and matched to NOAA's active regions (their positions are valid ~00 UT the day after `observed_date`; rotated to image time), daily SWPC sunspot number, F10.7, monthly solar cycle + prediction, flare probabilities, 24 h of GOES X-rays and ≥10 MeV protons (5-min max, log10), C+ flares of the week, NOAA scales |
| forecast | 60 min | `fc/<place>.json`: hourly and daily (FMI edited forecast; MET Norway outside FMI's area) |
| radar | 5 min | `radar/fi/index.json` + PNG frames: last hour of FMI radar in EPSG:3067, recoloured; fetched at the native 500 m, saved at 2 km nationally + 250 km windows at 500 m per Finnish place in `radar/local/<place>/` |
| roads | 15 min | `roads/fi.json`: Digitraffic road condition forecast per road section (projected paths) + road weather stations |
| traffic | 5 min | `roads/messages.json`: active Digitraffic traffic announcements (title, features, location, kind: accident / closed / lane / other), accidents and the last 24 h first |
| cams | 15 min | `cams/fi/index.json` + `cams/fi/<preset>.jpg`: up to 3 Digitraffic road weather cameras within 30 km of each Finnish place, 640 px; each run refreshes the oldest image per place |
| nowcast | 10 min | `nowcast/<place>.json`: MET Norway radar nowcast, 5-min precipitation rate for ~90 min (Nordic coverage) |
| sea | 30 min | `sea/fi.json`: FMI wave buoys (Hs, direction, water temp) + mareographs (sea level vs. theoretical mean, trend) |
| lightning | 5 min | `lightning/fi.json`: FMI lightning strikes of the last hour |
| airquality | 30 min | `airquality/fi.json`: FMI hourly air quality index + PM2.5/PM10/NO2/O3 per station |
| grid | 60 min | `grid/fi.json`: 24 h of HARMONIE wind/cloud/precip/temperature on a 50 km map-space grid |
| fields | 30 min (re-bakes only on a new model run, every 3 h) | `fields/fi/index.json` + hourly PNGs: HARMONIE cloud/precipitation/temperature at 5 km from FMI's download service (NetCDF, read with `wx/netcdf3.py`), packed in RGB |
| tropo | 5 min (builds only on a new model run: ~100 s of work per tick until all 17 frames are done, then published at once) | `tropo/nordic/index.json` + 3-hourly PNGs for 48 h: from FMI's `harmonie_scandinavia_hybrid` (temperature, humidity, pressure, height on model levels 40–65, ~100 MB per frame) the radio refractivity N and modified refractivity M per column, the steepest dN/dh and the trapping-layer M-deficit, combined into a 0–10 index (5+ = duct) on the Nordic 5 km grid; see `wx/sources/tropo.py` |
| hf | 60 min | `hf.json`: VOACAP predictions (vendored DVOACAP-Python in `wx/vendor/dvoacap/`, MIT; see its VENDORED.md for the validation against genuine VOACAP output) for 9 bands × 8 regions × 24 h, 100 W and isotropic antennas from central Finland, driven by SWPC's predicted smoothed sunspot number; D-RAP header + value over Finland for blackout warnings |
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
npm test           # vitest: text forecast, config, projections, rasters, nowcast, sky (vs. JPL Horizons), place search, MET Norway port, teletext encoder/decoder
npm run check      # svelte-check / TypeScript
npm run build      # dist/index.html (site root) + dist/app/ (served at /wx/app/)
npm run shots -- https://wx.fi/ shots   # Playwright smoke test: screenshot every slide
```

URL options: `?place=oulu,helsinki&lang=en&theme=modern&slides=current,aurora&kiosk=1&music=0&playlist=synth&decode=metar,taf`,
or a full config as `#c=<base64url JSON>` (the settings dialog has "Copy share link").
Themes: `retro`, `modern` (default) and `teletext` (https://wx.fi/?theme=teletext, see Teletext mode).
Keys: ← → browse, space pause, M music on/off, N next track, F fullscreen, S settings (teletext mode adds its own, see above).
The corner buttons (GitHub link, ♫, ⏭, ⛶, ⚙) are hidden in kiosk mode; music starts on its own when the
browser allows it, otherwise on the first click or key press.

Music: playlists live in `music/playlists.json`
(`{"playlists": [{"id", "fi", "en", "tracks": [{"src", "title", "artist", "license", "url", "download"}]}]}`;
currently smooth jazz (15), synth classics (18) and synthwave (22): Kevin MacLeod, Scott Buckley
and Shane Ivers, all CC BY 4.0). `python3 music/fetch.py` downloads
the audio (not in git). Users pick playlists in the settings or with `?playlist=synth,synthwave`; the
selected tracks are credited on the Data Sources slide automatically.

## Server

`deploy/deploy.sh` deploys over ssh to the host in `$WX_HOST`, or in `deploy/deploy.env`
(`WX_HOST=<ssh host>`, not in git). The layout it expects on the server:


- Code: `/opt/wx/code/backend`, venv `/opt/wx/code/venv`, state `/opt/wx/code/var`
- Output: `/opt/wx/html/wx/data` (served by nginx as `https://wx.fi/wx/data/…`)
- Scheduler: systemd **user** units of `wx` (lingering), in `/opt/wx/code/.config/systemd/user/`
- Python deps (venv): httpx, pyyaml, pillow, numpy, sgp4; NetCDF is read by `wx/netcdf3.py` (stdlib only)
- Disk: data ~20 MB (radar frames, local radar windows, world rasters, cameras), music ~210 MB

```sh
./deploy/deploy.sh                                              # build + sync everything, update venv (no sudo)
SKIP_FRONTEND=1 ./deploy/deploy.sh                              # backend only
ssh "$WX_HOST" sudo systemctl --user -M wx@ daemon-reload   # only after unit file changes
ssh "$WX_HOST" sudo systemctl --user -M wx@ list-timers
ssh "$WX_HOST" sudo journalctl _SYSTEMD_USER_UNIT=wx-bake.service -n 50
curl -s https://wx.fi/wx/data/health.json
```

## Maps

Finnish maps use ETRS-TM35FIN (EPSG:3067); the projection exists in `backend/wx/proj.py` and
`frontend/src/map/proj.ts` (kept in sync, both tested against the same values). World views
(regions, capitals and the two polar aurora views, defined in `backend/wx/world.json`) use a
spherical Lambert azimuthal equal-area projection centred on each view (`wx/laea.py`, `map/laea.ts`). Basemaps are built
once from Natural Earth GeoJSON (public domain) and committed:

```sh
python3 tools/build_basemap.py <dir with ne_10m_admin_0_countries/lakes/boundary_lines_land .geojson>
# world views: 50m data for regions, 10m for capitals; also copies world.json to the frontend
python3 tools/build_world.py <dir with ne_10m_* and ne_50m_* .geojson> [view id ...]
```

## Data licences

FMI, MET Norway, SMHI, DMI, Fintraffic/Digitraffic (incl. weather camera images), ECMWF
(via FMI), GeoNames: CC BY 4.0. Wikidata: CC0. Estonian Environment Agency and Icelandic Met Office: open
data, credited by name (no licence stated for these feeds). aviationweather.gov and NOAA
SWPC: US public domain. NASA SDO images: free to use with credit ("Courtesy of NASA/SDO and the AIA and HMI science teams"). Natural Earth: public domain.
Music: CC BY 4.0 (credited per track). Planet positions use JPL's published approximate
Keplerian elements; sun and moon via suncalc (2.x returns degrees, azimuth from north).
The info-screen has a credits slide listing them.

## Licence

The code is MIT-licensed (see `LICENSE`). `backend/wx/vendor/dvoacap/` is DVOACAP-Python, also
MIT, with its own `LICENSE` and `NOTICE`. The licence covers the code only: the data, images and
music the site uses keep their own terms (see Data licences above), and it grants no rights to
the name wx.fi.
