"""FMI radar composite frames, recoloured with wx.fi's own palette.

We request the raw `raster` style (8-bit: 0 = no echo, 255 = outside coverage,
otherwise dBZ = value * 0.5 - 32) in EPSG:3067 for a map extent, and turn it into a
small palettised PNG with transparency.
"""

import io
import logging
from datetime import datetime, timedelta, timezone

from PIL import Image

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


def fetch_raw(t: datetime, extent: str = "fi") -> Image.Image:
    x0, y0, x1, y1 = EXTENTS[extent]
    w, h = size_for(extent)
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
