"""Normalize provider weather symbols to wx.fi's own vocabulary.

Normalized symbol: "<kind>" or "<kind>-<intensity>", where kind is one of
clear, partly, cloudy, fog, showers, rain, snowshowers, snow, sleet, thunder
and intensity is 1 (light) .. 3 (heavy). Day/night is decided by the client
from sun elevation, so symbols here are day/night agnostic.
"""

import re

# FMI WeatherSymbol3
_WS3 = {
    1: "clear", 2: "partly", 3: "cloudy",
    21: "showers-1", 22: "showers-2", 23: "showers-3",
    31: "rain-1", 32: "rain-2", 33: "rain-3",
    41: "snowshowers-1", 42: "snowshowers-2", 43: "snowshowers-3",
    51: "snow-1", 52: "snow-2", 53: "snow-3",
    61: "thunder-1", 62: "thunder-2", 63: "thunder-1", 64: "thunder-2",
    71: "sleet-1", 72: "sleet-2", 73: "sleet-3",
    81: "sleet-1", 82: "sleet-2", 83: "sleet-3",
    91: "fog", 92: "fog",
}


def from_fmi_ws3(code: float | None) -> str | None:
    if code is None:
        return None
    return _WS3.get(int(code))


def from_metno(code: str | None) -> str | None:
    """MET Norway symbol_code, e.g. 'lightrainshowers_day', 'heavysnow', 'fair_night'."""
    if not code:
        return None
    c = code.split("_")[0]
    if c in ("clearsky",):
        return "clear"
    if c in ("fair", "partlycloudy"):
        return "partly"
    if c == "cloudy":
        return "cloudy"
    if c == "fog":
        return "fog"
    m = re.fullmatch(r"(light|heavy)?(rain|sleet|snow)(showers)?(andthunder)?", c)
    if not m:
        return "cloudy"
    level, kind, showers, thunder = m.groups()
    inten = {"light": 1, None: 2, "heavy": 3}[level]
    if thunder:
        return f"thunder-{1 if inten < 3 else 2}"
    if kind == "rain":
        return f"{'showers' if showers else 'rain'}-{inten}"
    if kind == "snow":
        return f"{'snowshowers' if showers else 'snow'}-{inten}"
    return f"sleet-{inten}"
