import base64
from array import array

from PIL import Image

from wx import proj
from wx.sources import grid, radar


def test_proj_roundtrip_and_known_point():
    e, n = proj.forward(60.1699, 24.9384)
    assert abs(e - 385611.3) < 1 and abs(n - 6672118.4) < 1
    la, lo = proj.inverse(e, n)
    assert abs(la - 60.1699) < 1e-7 and abs(lo - 24.9384) < 1e-7


def test_grid_north_bearing_sign():
    # east of the central meridian (27°E) true north leans west in grid coordinates
    assert grid.grid_north_bearing(65, 30) < 0
    assert grid.grid_north_bearing(65, 22) > 0
    assert abs(grid.grid_north_bearing(65, 27)) < 1e-9


def test_pack_quantises_and_clamps():
    b64 = grid._pack("b", 0.5, [1.0, -1.0, None, 1000.0])
    vals = array("b", base64.b64decode(b64)).tolist()
    assert vals == [2, -2, 0, 127]


def test_nodes_cover_extent():
    nx, ny, pts = grid.nodes("fi", 50000)
    assert nx * ny == len(pts)
    # first node is the south-west corner
    e, n = proj.forward(*pts[0])
    assert abs(e - proj.EXTENTS["fi"][0]) < 1 and abs(n - proj.EXTENTS["fi"][1]) < 1


def test_radar_colorize():
    # 0 = no echo, 255 = no coverage, 104 -> 20 dBZ, 150 -> 43 dBZ
    raw = Image.frombytes("L", (4, 1), bytes([0, 255, 104, 150]))
    png, st = radar.colorize(raw)
    im = Image.open(__import__("io").BytesIO(png)).convert("RGBA")
    px = [im.getpixel((x, 0)) for x in range(4)]
    assert px[0][3] == 0 and px[1][3] == 0  # transparent
    assert px[2][3] > 0 and px[3][3] > 0
    assert px[3] != px[2]  # different intensity class
    assert st["coverage"] == 3 and st["echo"] == round(2 / 3, 4)
    assert not radar.is_empty(raw)
    assert radar.is_empty(Image.new("L", (3, 3), 255))
