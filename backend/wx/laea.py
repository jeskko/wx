"""Spherical Lambert azimuthal equal-area projection (world map views). Mirrors frontend/src/map/laea.ts."""

import math

R = 6371008.8


class Laea:
    def __init__(self, lat0: float, lon0: float):
        self.lat0, self.lon0 = lat0, lon0
        self.p0 = math.radians(lat0)
        self.l0 = math.radians(lon0)
        self.s0, self.c0 = math.sin(self.p0), math.cos(self.p0)

    def forward(self, lat: float, lon: float) -> tuple[float, float]:
        p = math.radians(lat)
        dl = math.radians(lon) - self.l0
        sp, cp, cd = math.sin(p), math.cos(p), math.cos(dl)
        den = 1 + self.s0 * sp + self.c0 * cp * cd
        k = math.sqrt(2 / den) if den > 1e-12 else 0.0
        return R * k * cp * math.sin(dl), R * k * (self.c0 * sp - self.s0 * cp * cd)

    def inverse(self, x: float, y: float) -> tuple[float, float]:
        rho = math.hypot(x, y)
        if rho < 1e-9:
            return self.lat0, self.lon0
        c = 2 * math.asin(min(1.0, rho / (2 * R)))
        sc, cc = math.sin(c), math.cos(c)
        lat = math.asin(max(-1.0, min(1.0, cc * self.s0 + y * sc * self.c0 / rho)))
        lon = self.l0 + math.atan2(x * sc, rho * self.c0 * cc - y * self.s0 * sc)
        lon = (math.degrees(lon) + 540) % 360 - 180
        return math.degrees(lat), lon

    def inverse_np(self, x, y):
        """Vectorised inverse for numpy arrays (metres) -> (lat, lon) degrees."""
        import numpy as np

        rho = np.hypot(x, y)
        rho_safe = np.where(rho < 1e-9, 1e-9, rho)
        c = 2 * np.arcsin(np.clip(rho_safe / (2 * R), -1, 1))
        sc, cc = np.sin(c), np.cos(c)
        lat = np.arcsin(np.clip(cc * self.s0 + y * sc * self.c0 / rho_safe, -1, 1))
        lon = self.l0 + np.arctan2(x * sc, rho_safe * self.c0 * cc - y * self.s0 * sc)
        lon = (np.degrees(lon) + 540) % 360 - 180
        return np.degrees(lat), lon

    def forward_np(self, lat, lon):
        import numpy as np

        p = np.radians(lat)
        dl = np.radians(lon) - self.l0
        sp, cp, cd = np.sin(p), np.cos(p), np.cos(dl)
        den = 1 + self.s0 * sp + self.c0 * cp * cd
        k = np.sqrt(2 / np.maximum(den, 1e-12))
        return R * k * cp * np.sin(dl), R * k * (self.c0 * sp - self.s0 * cp * cd)
