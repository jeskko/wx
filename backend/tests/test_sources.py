from wx import symbols
from wx.sources import aviation, cap, metno, swpc


def test_cap(fixture_bytes):
    ws = cap.parse(fixture_bytes("fmi_cap.xml"))
    assert len(ws) == 7
    w = ws[0]
    assert w["color"] in ("green", "yellow", "orange", "red")
    assert set(w["text"]) == {"fi", "sv", "en"}
    assert w["text"]["en"]["headline"]
    assert w["areas"] and w["areas"][0]["polygons"][0][0][0] > 50  # lat first
    assert set(w["areas"][0]["name"]) == {"fi", "sv", "en"}
    sev = {"Extreme": 3, "Severe": 2, "Moderate": 1, "Minor": 0}
    ranks = [sev[x["severity"]] for x in ws]
    assert ranks == sorted(ranks, reverse=True)


def test_metar_taf(fixture_json):
    m = aviation.parse_metars(fixture_json("metar.json"))
    efhk = m["EFHK"]
    assert efhk["raw"].startswith("METAR EFHK")
    assert efhk["vis"] == 9999 and efhk["cat"] == "VFR"
    assert efhk["clouds"][0] == {"cover": "SCT", "base": 1000}
    t = aviation.parse_tafs(fixture_json("taf.json"))
    assert t["EFHK"]["raw"].startswith("TAF")
    assert t["EFHK"]["from"] < t["EFHK"]["to"]


def test_vis_conversion():
    assert aviation._vis_m("10+") == 9999
    assert aviation._vis_m(1.5) == 2410
    assert aviation._vis_m(None) is None


def test_kp(fixture_json):
    obs = swpc.parse_kp(fixture_json("kp.json"))
    assert obs[0]["time"].endswith("Z") and isinstance(obs[0]["kp"], float)
    fc = swpc.parse_kp(fixture_json("kpfc.json"))
    assert {r["kind"] for r in fc} >= {"observed", "predicted"}
    # legacy array format still supported
    legacy = swpc.parse_kp([["time_tag", "kp", "observed"], ["2026-01-01 00:00:00", "3.33", "predicted"]])
    assert legacy == [{"time": "2026-01-01T00:00:00Z", "kp": 3.33, "kind": "predicted"}]


def test_ovation(fixture_json):
    ov = swpc.parse_ovation(fixture_json("ovation.json"))
    assert len(ov["grid"]) == 31 and len(ov["grid"][0]) == 81
    assert ov["observed"].endswith("Z")
    assert swpc.ovation_at(ov, 69.6, 19.0) is not None
    assert swpc.ovation_at(ov, 10, 10) is None


def test_metno(fixture_json):
    steps = metno.parse(fixture_json("metno.json"))
    assert steps[0]["h"] == 1 and steps[-1]["h"] == 6
    assert all(s["sym"] for s in steps)
    assert isinstance(steps[0]["t"], float)


def test_symbols():
    assert symbols.from_fmi_ws3(1) == "clear"
    assert symbols.from_fmi_ws3(32.0) == "rain-2"
    assert symbols.from_fmi_ws3(None) is None
    assert symbols.from_metno("lightrainshowers_day") == "showers-1"
    assert symbols.from_metno("heavysnow") == "snow-3"
    assert symbols.from_metno("rainandthunder") == "thunder-1"
    assert symbols.from_metno("fair_night") == "partly"
    assert symbols.from_metno("lightssleetshowersandthunder_day") == "cloudy"  # unknown -> safe default


def test_metno_nowcast(fixture_bytes):
    import json

    from wx.sources import metno

    nc = metno.parse_nowcast(json.loads(fixture_bytes("metno_nowcast.json")))
    assert nc["coverage"] == "ok"
    assert len(nc["steps"]) >= 15
    assert all(isinstance(r, float) and r >= 0 for _, r in nc["steps"])


def test_radar_downsample_keeps_echo_and_nodata():
    from PIL import Image

    from wx.sources import radar

    raw = Image.new("L", (8, 8), 0)
    raw.putpixel((1, 1), 150)  # a single strong pixel in block (0,0)
    for x in range(4, 8):
        for y in range(4, 8):
            raw.putpixel((x, y), 255)  # block (1,1) outside coverage
    raw.putpixel((5, 5), 0)  # ...except one covered pixel: covered wins
    small = radar.downsample(raw, (2, 2))
    assert small.getpixel((0, 0)) == 150
    assert small.getpixel((1, 0)) == 0
    assert small.getpixel((1, 1)) == 0
    full = Image.new("L", (4, 4), 255)
    assert radar.downsample(full, (2, 2)).getpixel((0, 0)) == 255


def test_nordic_codes():
    from wx.sources import nordic

    assert nordic.present_weather(181) == 81  # automatic: 4680 + 100
    assert nordic.present_weather(45) == 30  # manual fog -> 4680 fog
    assert nordic.present_weather(None) is None
    assert nordic.octas(100) == 8 and nordic.octas(0) == 0 and nordic.octas(113) == 9
    assert nordic.smhi_name("Adelsö A") == "Adelsö" and nordic.smhi_name("Abisko Aut") == "Abisko"


def test_smhi(fixture_json):
    from wx.sources import nordic

    docs = {int(k): v for k, v in fixture_json("smhi_all.json").items()}
    st = {s["name"]: s for s in nordic.parse_smhi(docs)}
    assert "Göteborg" in st and "Luleå-Kallax Flygplats" in st
    g = st["Göteborg"]
    assert g["src"] == "smhi" and g["id"].startswith("smhi:")
    assert g["t"] is not None and g["p"] is not None and g["time"].endswith("Z")
    assert all(s["n"] is None or 0 <= s["n"] <= 9 for s in st.values())


def test_dmi(fixture_json):
    from wx.sources import nordic

    names = nordic.dmi_station_names(fixture_json("dmi_stations.json"))
    assert names["06180"][0] == "Københavns Lufthavn"
    st = {s["name"]: s for s in nordic.parse_dmi(fixture_json("dmi_obs.json"), names)}
    cph = st["Københavns Lufthavn"]
    assert cph["t"] == 3.7 and cph["ws"] == 2.6 and cph["wd"] == 242 and cph["wawa"] == 81
    assert "H. C. Andersen Airport" not in st  # precipitation-only station has no temperature


def test_estonia_iceland(fixture_bytes):
    from wx.sources import nordic

    ee = {s["name"]: s for s in nordic.parse_estonia(fixture_bytes("ee_obs.xml"))}
    h = ee["Tallinn-Harku"]
    assert h["t"] == 8.6 and h["vis"] == 31000 and h["n"] == 0 and h["wd"] == 334
    ic = {s["name"]: s for s in nordic.parse_iceland(fixture_bytes("vedur_obs.xml"))}
    r = ic["Reykjavík"]
    assert r["lat"] > 64 and r["lon"] < -21 and r["t"] is not None
    assert r["wd"] is None or 0 <= r["wd"] < 360


def test_geonames_helpers():
    from wx.sources import geonames

    assert geonames.fold("Jyväskylä") == "jyvaskyla" and geonames.fold("Tórshavn") == "torshavn"
    assert geonames.shard("Ähtäri") == "ah" and geonames.shard("Ii") == "ii" and geonames.shard("Ö") == "_"
    assert geonames.finnish_name("Jakobstad", ["Pietarsaari", "Pietasaari"]) == "Pietarsaari"
    assert geonames.finnish_name("Jätkäsaari", ["Busis", "Jätkäsaari"]) == ""
