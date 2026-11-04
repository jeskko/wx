from wx.sources import fmi
from wx.sources.fmi_xml import parse_multipointcoverage, parse_simple


def test_obs_multipointcoverage(fixture_bytes):
    series = parse_multipointcoverage(fixture_bytes("fmi_obs_helsinki.xml"))
    assert len(series) == 1
    s = series[0]
    assert s.fmisid == "100971"
    assert s.name == "Helsinki Kaisaniemi"
    assert s.region == "Helsinki"
    assert len(s.rows) > 10
    # times ascending, all requested params present
    assert all(a[0] < b[0] for a, b in zip(s.rows, s.rows[1:]))
    assert {"t2m", "ws_10min", "p_sea", "n_man"} <= set(s.rows[-1][1])


def test_summarize_station(fixture_bytes):
    s = parse_multipointcoverage(fixture_bytes("fmi_obs_helsinki.xml"))[0]
    out = fmi.summarize_station(s)
    assert out["id"] == "100971"
    assert isinstance(out["t"], float)
    assert out["time"].endswith("Z")
    # fixture spans 12 h, so a 3 h pressure tendency must be computable
    assert out["ptend"] is not None


def test_forecast_multi_location(fixture_bytes):
    series = parse_multipointcoverage(fixture_bytes("fmi_fc_multi.xml"))
    assert len(series) == 4
    lats = sorted(round(s.lat) for s in series)
    assert lats == [59, 60, 65, 70]
    hourly = fmi.series_to_hourly(series[0])
    assert len(hourly) > 48
    h = hourly[0]
    assert h["time"].endswith("Z") and isinstance(h["t"], float)
    assert h["sym"] in ("clear", "partly", "cloudy") or "-" in h["sym"]


def test_magnetometer(fixture_bytes):
    series = parse_simple(fixture_bytes("fmi_mag.xml"))
    assert len(series) == 10
    mags = fmi.summarize_magnetometer(series)
    names = {m["name"] for m in mags}
    assert {"Kevo", "Nurmijärvi", "Kilpisjärvi"} <= names
    assert all(m["range"] >= 0 and m["n"] >= 5 for m in mags)
    assert mags[0]["lat"] > mags[-1]["lat"]  # north first


def _now():
    from datetime import datetime, timezone

    return datetime(2026, 11, 4, 19, 0, tzinfo=timezone.utc)


def test_sea_waves_and_levels(fixture_bytes):
    waves = fmi.summarize_waves(parse_multipointcoverage(fixture_bytes("fmi_wave.xml")), now=_now())
    assert waves and any(w["hs"] is not None and w["dir"] is not None for w in waves)
    assert all(w["tw"] is None or 0 <= w["tw"] < 30 for w in waves)
    levels = fmi.summarize_levels(parse_multipointcoverage(fixture_bytes("fmi_mareograph.xml")), now=_now())
    assert len(levels) > 8
    assert all(isinstance(lv["level"], int) and -150 < lv["level"] < 200 for lv in levels)
    assert any(lv["trend"] is not None for lv in levels)


def test_lightning(fixture_bytes):
    strikes = fmi.summarize_lightning(parse_multipointcoverage(fixture_bytes("fmi_lightning.xml")))
    assert len(strikes) > 10
    lat, lon, t, cloud, ka = strikes[0]
    assert 55 < lat < 72 and 10 < lon < 40 and cloud in (0, 1)
    assert [s[2] for s in strikes] == sorted(s[2] for s in strikes)


def test_airquality(fixture_bytes):
    st = fmi.summarize_airquality(parse_multipointcoverage(fixture_bytes("fmi_airquality.xml")), now=_now())
    assert len(st) > 30
    assert all(1 <= s["aqi"] <= 5 for s in st)
