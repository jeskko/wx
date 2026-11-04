import json

from wx import bake, jobs
from wx.daily import daily
from wx.jobs import Job


def _hours(start_hour_utc: int, n: int, **kw):
    out = []
    for i in range(n):
        h = start_hour_utc + i
        out.append({"time": f"2026-11-{5 + h // 24:02d}T{h % 24:02d}:00:00Z", "h": 1, "t": float(i % 10), "ws": 3.0,
                    "wd": 180, "pr": kw.get("pr", 0.0), "sym": kw.get("sym", "cloudy")})
    return out


def test_daily_local_days():
    # 22:00 UTC = 00:00 Helsinki (EET, UTC+2 in November)
    d = daily(_hours(22, 48), "Europe/Helsinki")
    assert [x["date"] for x in d] == ["2026-11-06", "2026-11-07"]
    assert not d[0]["partial"]
    assert d[0]["tmin"] == 0.0 and d[0]["tmax"] == 9.0


def test_daily_wet_day_takes_severest_symbol():
    steps = _hours(22, 24, pr=0.5)
    steps[12]["sym"] = "rain-2"
    steps[13]["sym"] = "snow-1"
    d = daily(steps, "Europe/Helsinki")
    assert d[0]["sym"] == "snow-1"
    assert d[0]["pr"] == 12.0


def test_runner_schedule_and_health(tmp_dirs, monkeypatch):
    data, state = tmp_dirs
    calls = []

    def ok():
        calls.append("ok")
        return {"n": 1}

    def boom():
        calls.append("boom")
        raise RuntimeError("upstream down")

    monkeypatch.setattr(bake, "JOBS", [Job("good", 600, ok), Job("bad", 600, boom)])
    monkeypatch.setattr(jobs, "JOBS", bake.JOBS)

    assert bake.run() == 1
    assert calls == ["ok", "boom"]
    # immediately again: good is not due; bad was just tried -> not due either (retry after ~5 min)
    assert bake.run() == 0
    assert calls == ["ok", "boom"]

    health = json.loads((data / "health.json").read_text())
    assert health["jobs"]["good"]["stale"] is False
    assert health["jobs"]["bad"]["stale"] is True
    assert "upstream down" in health["jobs"]["bad"]["last_error"]

    # force runs everything
    bake.run(force=True)
    assert calls[-2:] == ["ok", "boom"]
