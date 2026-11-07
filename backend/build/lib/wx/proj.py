"""ETRS-TM35FIN (EPSG:3067) transverse Mercator, Krüger series. Mirrors frontend/src/map/proj.ts.

Accuracy is well below a metre within Fennoscandia, far more than a weather map needs.
"""

import math

A_GRS80 = 6378137.0
F_GRS80 = 1 / 298.257222101
LON0 = math.radians(27.0)
K0 = 0.9996
FE = 500000.0

_n = F_GRS80 / (2 - F_GRS80)
_A = A_GRS80 / (1 + _n) * (1 + _n**2 / 4 + _n**4 / 64)
_ALPHA = (_n / 2 - 2 / 3 * _n**2 + 5 / 16 * _n**3, 13 / 48 * _n**2 - 3 / 5 * _n**3, 61 / 240 * _n**3)
_BETA = (_n / 2 - 2 / 3 * _n**2 + 37 / 96 * _n**3, 1 / 48 * _n**2 + 1 / 15 * _n**3, 17 / 480 * _n**3)
_DELTA = (2 * _n - 2 / 3 * _n**2 - 2 * _n**3, 7 / 3 * _n**2 - 8 / 5 * _n**3, 56 / 15 * _n**3)
_E2N = 2 * math.sqrt(_n) / (1 + _n)


def forward(lat: float, lon: float) -> tuple[float, float]:
    """(lat, lon) degrees -> (E, N) metres."""
    phi = math.radians(lat)
    dl = math.radians(lon) - LON0
    t = math.sinh(math.atanh(math.sin(phi)) - _E2N * math.atanh(_E2N * math.sin(phi)))
    xi = math.atan2(t, math.cos(dl))
    eta = math.atanh(math.sin(dl) / math.sqrt(1 + t * t))
    e = eta + sum(a * math.cos(2 * j * xi) * math.sinh(2 * j * eta) for j, a in enumerate(_ALPHA, 1))
    n = xi + sum(a * math.sin(2 * j * xi) * math.cosh(2 * j * eta) for j, a in enumerate(_ALPHA, 1))
    return FE + K0 * _A * e, K0 * _A * n


def inverse(e: float, n: float) -> tuple[float, float]:
    """(E, N) metres -> (lat, lon) degrees."""
    xi = n / (K0 * _A)
    eta = (e - FE) / (K0 * _A)
    xi_ = xi - sum(b * math.sin(2 * j * xi) * math.cosh(2 * j * eta) for j, b in enumerate(_BETA, 1))
    eta_ = eta - sum(b * math.cos(2 * j * xi) * math.sinh(2 * j * eta) for j, b in enumerate(_BETA, 1))
    chi = math.asin(math.sin(xi_) / math.cosh(eta_))
    phi = chi + sum(d * math.sin(2 * j * chi) for j, d in enumerate(_DELTA, 1))
    lam = LON0 + math.atan2(math.sinh(eta_), math.cos(xi_))
    return math.degrees(phi), math.degrees(lam)


def convergence(lat: float, lon: float) -> float:
    """Meridian convergence (radians): angle from grid north to true north, positive east of CM."""
    return math.atan(math.tan(math.radians(lon) - LON0) * math.sin(math.radians(lat)))


# Map extents (metres, EPSG:3067): [xmin, ymin, xmax, ymax]
EXTENTS = {
    # Finland with the Swedish Bothnian coast, Estonia's north coast and Karelia
    "fi": (-280000.0, 6560000.0, 1120000.0, 7840000.0),
    # Fennoscandia for the aurora oval
    "nordic": (-900000.0, 6150000.0, 1500000.0, 8050000.0),
}
