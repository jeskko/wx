from datetime import datetime, timezone

import numpy as np

from wx.sources import space


def test_b0_and_radius_follow_the_seasons():
    b_mar, r_jan = space.sun_geometry(datetime(2026, 3, 7, tzinfo=timezone.utc))[0], space.sun_geometry(datetime(2026, 1, 3, tzinfo=timezone.utc))[1]
    b_sep, r_jul = space.sun_geometry(datetime(2026, 9, 8, tzinfo=timezone.utc))[0], space.sun_geometry(datetime(2026, 7, 4, tzinfo=timezone.utc))[1]
    assert -7.3 < b_mar < -7.0 and 7.0 < b_sep < 7.3
    assert 975 < r_jan < 977 and 943 < r_jul < 945


def test_disk_projection():
    x, y, front = space.disk_xy(0, 0, 0)
    assert (round(x, 6), round(y, 6), front) == (0, 0, True)
    x, _, _ = space.disk_xy(0, 90, 0)
    assert abs(x - 1) < 1e-9  # west limb on the right
    assert space.disk_xy(0, 120, 0)[2] is False
    assert space.disk_xy(10, 0, 5)[1] > 0


def test_rotation_is_differential():
    assert 13.0 < space.rotation_deg_per_day(0) < 13.8
    assert space.rotation_deg_per_day(30) < space.rotation_deg_per_day(0)


def _disk(spots):
    h = w = 400
    yy, xx = np.mgrid[0:h, 0:w]
    rho = np.hypot(xx - 200, yy - 200) / 180
    lum = np.where(rho < 1, 200 * (0.4 + 0.6 * np.sqrt(np.clip(1 - rho**2, 0, 1))), 0).astype(np.float32)
    for sx, sy in spots:
        lum[(np.hypot(xx - sx, yy - sy) < 5)] *= 0.4
    return lum


def test_find_spots_groups_and_positions():
    lum = _disk([(120, 220), (128, 226), (290, 140)])  # one pair and a single spot
    s = space.find_spots(lum, 200, 200, 180)
    assert len(s) == 2
    big = s[0]
    assert abs(big["x"] - (124 - 200) / 180) < 0.03 and abs(big["y"] - (200 - 223) / 180) < 0.03
    assert space.find_spots(_disk([]), 200, 200, 180) == []


def test_place_regions_snaps_to_spots():
    t = datetime(2026, 11, 7, 15, 0, tzinfo=timezone.utc)
    regs = [{"num": 1, "lat": -6, "lon": -6, "spots": 20}, {"num": 2, "lat": 10, "lon": 85, "spots": 0}, {"num": 3, "lat": 0, "lon": 100, "spots": 1}]
    x0, y0, _ = space.disk_xy(-6, -6 + space.rotation_deg_per_day(-6) * (-9 / 24), space.sun_geometry(t)[0])
    spots = [{"x": x0 + 0.05, "y": y0 - 0.02, "px": 50}]
    out = space.place_regions(regs, "2026-11-07", t, spots)
    assert [r["num"] for r in out] == [1, 2]  # 3 is behind the limb
    assert out[0]["snapped"] and out[0]["dx"] == round(x0 + 0.05, 4)
    assert not out[1]["snapped"]


def test_parse_regions_latest_day_west_positive():
    rows = [
        {"observed_date": "2026-11-06", "region": 1, "latitude": 5, "longitude": 10},
        {"observed_date": "2026-11-07", "region": 1, "latitude": 5, "longitude": -3, "area": 100, "number_spots": 4, "spot_class": "Cso", "m_flare_probability": 5},
        {"observed_date": "2026-11-07", "region": 2, "latitude": None, "longitude": None},
    ]
    day, regs = space.parse_regions(rows)
    assert day == "2026-11-07" and len(regs) == 1 and regs[0]["lon"] == 3 and regs[0]["m"] == 5


def test_series_keeps_peaks():
    rows = [{"time_tag": f"2026-11-07T10:0{m}:00Z", "energy": "0.1-0.8nm", "flux": f} for m, f in enumerate([1e-7, 1e-5, 1e-7, 1e-6, 1e-7, 1e-6])]
    rows.append({"time_tag": "2026-11-07T10:00:00Z", "energy": "0.05-0.4nm", "flux": 1e-3})
    s = space.series(rows, ("energy", "0.1-0.8nm"), "flux")
    assert s["start"] == "2026-11-07T10:00:00Z" and s["log"] == [-5.0, -6.0]


def test_flares_and_classes():
    now = datetime(2026, 11, 7, 15, tzinfo=timezone.utc)
    rows = [
        {"max_time": "2026-11-07T14:46:00Z", "max_class": "C1.8", "begin_time": "2026-11-07T14:38:00Z"},
        {"max_time": "2026-11-07T12:00:00Z", "max_class": "B9.0"},
        {"max_time": "2026-10-20T12:00:00Z", "max_class": "X1.0"},
        {"max_time": "2026-11-06T12:00:00Z", "max_class": "M2.0"},
    ]
    assert [f["cls"] for f in space.flares(rows, now)] == ["C1.8", "M2.0"]
    assert abs(space.flare_class_value("M2.4") - 2.4e-5) < 1e-12


def test_parse_scales():
    d = {
        "-1": {"DateStamp": "2026-11-06", "R": {"Scale": "1"}, "S": {"Scale": "0"}, "G": {"Scale": "0"}},
        "0": {"DateStamp": "2026-11-07", "R": {"Scale": "0"}, "S": {"Scale": "0"}, "G": {"Scale": "2"}},
        "1": {"DateStamp": "2026-11-07", "R": {"Scale": None, "MinorProb": "35", "MajorProb": "10"}, "S": {"Scale": None, "Prob": "5"}, "G": {"Scale": "1"}},
    }
    s = space.parse_scales(d)
    assert s["yesterday"]["r"] == 1 and s["now"]["g"] == 2
    assert s["forecast"][0] == {"date": "2026-11-07", "r": None, "s": None, "g": 1, "rMinor": 35, "rMajor": 10, "sProb": 5}
    assert s["forecast"][2]["g"] is None
