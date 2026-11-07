"""FMI radar composite frames, recoloured with wx.fi's own palette.

We request the raw `raster` style (8-bit: 0 = no echo, 255 = outside coverage,
otherwise dBZ = value * 0.5 - 32) in EPSG:3067 for a map extent, and turn it into a
small palettised PNG with transparency.
"""

import io
import logging
from datetime import datetime, timedelta, timezone

from PIL import Image, ImageChops

from .. import net
from ..proj import EXTENTS

log = logging.getLogger(__name__)

WMS = "https://openwms.fmi.fi/geoserver/Radar/wms"
LAYER = "Radar:suomi_dbz_eureffin"
STEP = timedelta(minutes=5)

# (min dBZ, RGBA). Below the first threshold: transparent.
PALETTE = [
    (8, (120, 210, 255, 150)),   # very light
    (15, (40, 180, 110, 205)),   # light
    (22, (40, 215, 60, 230)),
    (30, (255, 232, 40, 240)),   # moderate
    (38, (255, 150, 20, 250)),
    (45, (235, 35, 35, 255)),    # heavy
    (52, (225, 50, 225, 255)),   # very heavy / hail
]


def _lut() -> list[int]:
    """raw byte -> palette index (0 = transparent)."""
    lut = []
    for raw in range(256):
        idx = 0
        if 0 < raw < 255:
            dbz = raw * 0.5 - 32
            for i, (lo, _) in enumerate(PALETTE, 1):
                if dbz >= lo:
                    idx = i
        lut.append(idx)
    return lut


_LUT = _lut()


def size_for(extent: str, km_per_px: float = 2.0) -> tuple[int, int]:
    x0, y0, x1, y1 = EXTENTS[extent]
    return round((x1 - x0) / 1000 / km_per_px), round((y1 - y0) / 1000 / km_per_px)


NATIVE_KM = 0.5  # FMI composite resolution


def fetch_raw(t: datetime, extent: str = "fi", km_per_px: float = 2.0) -> Image.Image:
    x0, y0, x1, y1 = EXTENTS[extent]
    w, h = size_for(extent, km_per_px)
    data = net.get_bytes(
        WMS,
        {
            "service": "WMS",
            "version": "1.3.0",
            "request": "GetMap",
            "layers": LAYER,
            "styles": "raster",
            "crs": "EPSG:3067",
            "bbox": f"{x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}",
            "width": str(w),
            "height": str(h),
            "format": "image/png",
            "time": t.strftime("%Y-%m-%dT%H:%M:00Z"),
        },
    )
    return Image.open(io.BytesIO(data)).convert("L")


def colorize(raw: Image.Image) -> tuple[bytes, dict]:
    """Return palettised PNG bytes + simple stats (fraction of covered pixels with echo)."""
    idx = raw.point(_LUT)
    out = Image.frombytes("P", raw.size, idx.tobytes())
    pal = [0, 0, 0] + [c for _, rgba in PALETTE for c in rgba[:3]]
    out.putpalette(pal + [0] * (768 - len(pal)))
    alpha = bytes([0] + [rgba[3] for _, rgba in PALETTE])
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True, transparency=alpha)
    hist = raw.histogram()
    covered = sum(hist[:255])
    echo = sum(c for v, c in enumerate(hist) if _LUT[v] > 0)
    return buf.getvalue(), {"coverage": covered, "echo": round(echo / covered, 4) if covered else 0.0}


def latest_slot(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    # composites appear ~5 min after nominal time
    t = now - timedelta(minutes=5)
    return t.replace(minute=t.minute - t.minute % 5, second=0, microsecond=0)


def is_empty(raw: Image.Image) -> bool:
    """No coverage at all = frame not available yet (WMS returns an all-nodata image)."""
    return raw.histogram()[255] == raw.size[0] * raw.size[1]


def downsample(raw: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Shrink a raw frame keeping the strongest echo per block (so small cells don't vanish).

    Raw 255 (= no coverage) would win a plain max filter, so it is mapped below 0 first.
    """
    # shift: 255 -> 0 (nodata), 0 -> 1 (no echo), v -> v+1 ; MaxFilter-equivalent via reduce
    shifted = raw.point([1 + v if v < 255 else 0 for v in range(256)])
    fx = raw.size[0] // size[0]
    fy = raw.size[1] // size[1]
    if fx * size[0] != raw.size[0] or fy * size[1] != raw.size[1]:
        return raw.resize(size, Image.NEAREST)
    # max over fx*fy blocks: PIL has no block-max, so take the max of the shifted sub-grids
    out = None
    for dy in range(fy):
        for dx in range(fx):
            sub = shifted.transform(size, Image.AFFINE, (fx, 0, dx + 0.5 - fx / 2, 0, fy, dy + 0.5 - fy / 2), resample=Image.NEAREST)
            out = sub if out is None else ImageChops.lighter(out, sub)
    assert out is not None
    return out.point([255 if v == 0 else v - 1 for v in range(256)])


def local_view(lat: float, lon: float, extent: str = "fi", half: float = 125_000) -> tuple[float, float, float, float]:
    """Square window around a place, clamped inside the radar extent (metres, EPSG:3067)."""
    from ..proj import forward

    x0, y0, x1, y1 = EXTENTS[extent]
    e, n = forward(lat, lon)
    cx = min(x1 - half, max(x0 + half, e))
    cy = min(y1 - half, max(y0 + half, n))
    return (cx - half, cy - half, cx + half, cy + half)


def crop(raw_hi: Image.Image, view: tuple[float, float, float, float], extent: str = "fi", km_per_px: float = NATIVE_KM) -> Image.Image:
    x0, _, _, y1 = EXTENTS[extent]
    m = km_per_px * 1000
    box = (round((view[0] - x0) / m), round((y1 - view[3]) / m), round((view[2] - x0) / m), round((y1 - view[1]) / m))
    return raw_hi.crop(box)
