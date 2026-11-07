import math
from datetime import datetime, timezone

import pytest

from wx.sources import hf
from wx.vendor.dvoacap.path_geometry import GeoPoint
from wx.vendor.dvoacap.prediction_engine import PredictionEngine


def test_reliability_is_half_at_the_required_snr_and_monotonic():
    assert hf.reliability(44.0, 10.0, 10.0, 44.0) == pytest.approx(0.5)
    assert hf.reliability(54.0, 10.0, 10.0, 44.0) > 0.85
    assert hf.reliability(34.0, 10.0, 10.0, 44.0) < 0.15
    assert hf.reliability(float("nan"), 10.0, 10.0, 44.0) == 0.0


def test_mode_level_thresholds_in_db_hz():
    assert hf.mode_level(50.0, 8.0, 8.0) == 3  # SSB
    assert hf.mode_level(30.0, 8.0, 8.0) == 2  # CW
    assert hf.mode_level(15.0, 8.0, 8.0) == 1  # FT8
    assert hf.mode_level(0.0, 8.0, 8.0) == 0


def test_smoothed_ssn_prefers_this_months_prediction():
    now = datetime(2026, 11, 7, tzinfo=timezone.utc)
    pred = [{"time-tag": "2026-10", "predicted_ssn": 80.0}, {"time-tag": "2026-11", "predicted_ssn": 77.5}]
    assert hf.smoothed_ssn(now, pred, []) == (77.5, "swpc-predicted")
    obs = [{"ssn": v} for v in (60, 70, 80, -1)]
    assert hf.smoothed_ssn(now, [], obs) == (70.0, "swpc-observed-6mo")


DRAP = """# Product Valid At : 2026-11-07 14:25 UTC
#  X-RAY Message : X-ray flux above M5
#  Proton Message : Normal Proton Background
      -178 -174 -170 -166 -162 -158 -154 -150 -146 -142 -138 -134
----------------------------------------------------------------
 63 |  0.0  0.0  0.0  0.0  0.0  0.0  0.0  0.0  0.0  0.0  1.5  2.0
 61 |  0.0  0.0  0.0  0.0  0.0  0.0  0.0  0.0  0.0  0.0  3.5  4.0
"""


def test_parse_drap_header_and_nearest_value():
    d = hf.parse_drap(DRAP, 61.0, -134.0)
    assert d["valid"] == "2026-11-07T14:25:00Z"
    assert d["event"] is True
    assert d["mhz"] == 4.0


def test_engine_reproduces_voacap_online_muf():
    # VOACAP Online, Philadelphia -> London, Nov, SSN 81, 80 W (upstream SampleIO): MUF at 01, 05, 13, 21 UTC
    ref = {1: 10.7, 5: 9.7, 13: 28.5, 21: 14.0}
    e = PredictionEngine()
    e.params.tx_location = GeoPoint(lat=math.radians(39.95), lon=math.radians(-75.17))
    e.params.ssn = 81
    e.params.tx_power = 80
    e.params.month = 11
    for h, muf in ref.items():
        e.predict(GeoPoint(lat=math.radians(51.51), lon=math.radians(-0.13)), h / 24, [14.1])
        assert e.circuit_muf.muf == pytest.approx(muf, abs=0.15)


def test_predict_shape():
    d = hf.predict(80.0, datetime(2026, 11, 7, 12, tzinfo=timezone.utc), hours=2)
    assert len(d["times"]) == 2
    assert [r["id"] for r in d["regions"]] == [r[0] for r in hf.REGIONS]
    for r in d["regions"]:
        assert len(r["levels"]) == 2 and all(len(x) == len(hf.BANDS) and set(x) <= set("0123") for x in r["levels"])
        assert all(m is None or 1 < m < 60 for m in r["muf"])
    # midday November: something is open to Central Europe
    eu = next(r for r in d["regions"] if r["id"] == "eu-c")
    assert any(c != "0" for c in eu["levels"][0])
