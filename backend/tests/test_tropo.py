import io

import numpy as np
from PIL import Image

from wx import proj
from wx.sources import tropo

Z = np.array([12.0, 36.0, 61.0, 86.0, 140.0, 200.0, 280.0, 360.0, 460.0, 580.0, 990.0, 1580.0])


def column(t_surface_c: float, lapse_c_per_km: float, rh: float, inversion: tuple[float, float, float, float] | None = None):
    """A single column (levels, 1) with a constant lapse rate, optionally a moist-below/dry-above inversion
    (base m, top m, temperature jump °C, RH above)."""
    t = t_surface_c - lapse_c_per_km * Z / 1000.0
    r = np.full_like(Z, rh)
    if inversion:
        base, top, jump, rh_above = inversion
        t = t + np.where(Z >= top, jump, np.where(Z > base, jump * (Z - base) / (top - base), 0.0))
        r = np.where(Z >= top, rh_above, r)
    p = 101325.0 * np.exp(-Z / 8000.0)
    return (t + 273.15)[:, None], r[:, None], p[:, None], Z[:, None]


def test_refractivity_matches_itu_reference_value():
    # 15 °C, 1013.25 hPa, 60 % RH -> about 319 N-units
    n = tropo.refractivity(np.array(288.15), np.array(0.6), np.array(101325.0))
    assert 316 < float(n) < 322


def test_standard_atmosphere_is_index_zero():
    m = tropo.column_metrics(*column(10.0, 6.5, 0.6))
    assert float(m["dm"][0]) <= 0
    assert -60 < float(m["g"][0]) < -25
    assert float(m["index"][0]) < 1.0
    assert float(m["top"][0]) == 0.0


def test_moist_below_dry_warm_above_makes_a_duct():
    # 8 °C warmer and much drier above 280 m: a classic elevated trapping layer
    m = tropo.column_metrics(*column(10.0, 6.5, 0.9, (200.0, 280.0, 8.0, 0.2)))
    assert float(m["g"][0]) < tropo.TRAPPING_G
    assert float(m["dm"][0]) > 3
    assert float(m["index"][0]) > 5
    assert float(m["top"][0]) == 280.0


def test_weak_inversion_is_super_refraction_but_no_duct():
    m = tropo.column_metrics(*column(10.0, 6.5, 0.7, (200.0, 460.0, 2.0, 0.55)))
    assert float(m["dm"][0]) <= 0
    assert 0.5 < float(m["index"][0]) <= 5


def test_missing_column_stays_missing():
    t, r, p, z = column(10.0, 6.5, 0.6)
    t = t.copy()
    t[3, 0] = np.nan
    m = tropo.column_metrics(t, r, p, z)
    assert np.isnan(m["index"][0])


def test_resampler_hits_the_right_lat_lon_cell():
    ext = (300000.0, 6600000.0, 400000.0, 6700000.0)
    rs = tropo.Resampler(ext, step_m=20000.0)
    lats = np.arange(58.0, 62.0001, 0.05)
    lons = np.arange(20.0, 30.0001, 0.1)
    field = lats[:, None] + 0.0 * lons[None, :]  # value = latitude
    out = rs.sample(lats, lons, field)
    assert out.shape == (5, 5)
    assert np.allclose(out, rs.lat, atol=1e-6)
    # descending latitude axis gives the same result
    out2 = rs.sample(lats[::-1], lons, field[::-1])
    assert np.allclose(out2, rs.lat, atol=1e-6)


def test_resampler_outside_source_is_nan():
    rs = tropo.Resampler((300000.0, 6600000.0, 400000.0, 6700000.0), step_m=50000.0)
    lats = np.arange(60.0, 61.0, 0.05)  # covers only part of the extent
    lons = np.arange(20.0, 30.0, 0.1)
    out = rs.sample(lats, lons, np.ones((len(lats), len(lons))))
    assert np.isnan(out).any() and (out == 1).any()


def test_latlon_bbox_contains_the_extent_corners():
    ext = proj.EXTENTS["nordic"]
    lon0, lat0, lon1, lat1 = tropo.latlon_bbox(ext)
    for x in (ext[0], ext[2]):
        for y in (ext[1], ext[3]):
            la, lo = proj.inverse(x, y)
            assert lat0 <= la <= lat1 and lon0 <= lo <= lon1


def test_pack_png_encoding():
    idx = np.array([[0.0, 4.0, 7.5, np.nan]])
    top = np.array([[0.0, np.nan, 280.0, 0.0]])
    px = np.array(Image.open(io.BytesIO(tropo.pack_png(idx, top))).convert("RGB"))[0]
    assert px.tolist() == [[0, 0, 0], [100, 0, 0], [188, 28, 0], [255, 0, 0]]


def test_smooth3_keeps_nan_cells_and_averages_neighbours():
    a = np.array([[0.0, 0.0, 0.0], [0.0, 9.0, 0.0], [0.0, 0.0, np.nan]])
    out = tropo.smooth3(a)
    assert np.isnan(out[2, 2])
    assert out[1, 1] == 9.0 / 8  # 8 valid cells around and including the centre
    assert out[0, 0] == 9.0 / 4
