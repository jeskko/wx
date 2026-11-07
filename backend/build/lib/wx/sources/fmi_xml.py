"""Parsers for FMI WFS responses (multipointcoverage and simple formats)."""

import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone

NS = {
    "wfs": "http://www.opengis.net/wfs/2.0",
    "gml": "http://www.opengis.net/gml/3.2",
    "gmlcov": "http://www.opengis.net/gmlcov/1.0",
    "swe": "http://www.opengis.net/swe/2.0",
    "target": "http://xml.fmi.fi/namespace/om/atmosphericfeatures/1.1",
    "BsWfs": "http://xml.fmi.fi/schema/wfs/2.0",
    "xlink": "http://www.w3.org/1999/xlink",
}
GML_ID = "{%s}id" % NS["gml"]
XLINK_HREF = "{%s}href" % NS["xlink"]


class FmiError(Exception):
    pass


@dataclass
class Series:
    """One location's time series."""

    lat: float
    lon: float
    name: str | None = None
    fmisid: str | None = None
    region: str | None = None
    # list of (datetime, {param: value|None})
    rows: list[tuple[datetime, dict[str, float | None]]] = field(default_factory=list)


def _key(lat: float, lon: float) -> tuple[float, float]:
    return (round(lat, 4), round(lon, 4))


def _num(s: str) -> float | None:
    v = float(s)
    return None if math.isnan(v) else v


def check_exception(root: ET.Element) -> None:
    if root.tag.endswith("ExceptionReport"):
        texts = [t.text.strip() for t in root.iter() if t.tag.endswith("ExceptionText") and t.text and t.text.strip()]
        raise FmiError("; ".join(texts) or "FMI exception")


def parse_multipointcoverage(xml: bytes) -> list[Series]:
    root = ET.fromstring(xml)
    check_exception(root)
    out: dict[tuple[float, float], Series] = {}

    for member in root.findall("wfs:member", NS):
        # point id -> (lat, lon)
        points: dict[str, tuple[float, float]] = {}
        for pt in member.iter("{%s}Point" % NS["gml"]):
            pos = pt.find("gml:pos", NS)
            if pos is not None and pos.text:
                la, lo = pos.text.split()[:2]
                points[pt.get(GML_ID, "")] = (float(la), float(lo))

        locs: dict[tuple[float, float], Series] = {}
        for loc in member.iter("{%s}Location" % NS["target"]):
            rp = loc.find("target:representativePoint", NS)
            ref = rp.get(XLINK_HREF, "").lstrip("#") if rp is not None else ""
            if ref not in points:
                continue
            lat, lon = points[ref]
            s = Series(lat=lat, lon=lon)
            ident = loc.find("gml:identifier", NS)
            if ident is not None and "fmisid" in (ident.get("codeSpace") or ""):
                s.fmisid = (ident.text or "").strip()
            for n in loc.findall("gml:name", NS):
                if (n.get("codeSpace") or "").endswith("/name"):
                    s.name = (n.text or "").strip()
            reg = loc.find("target:region", NS)
            if reg is not None and reg.text:
                s.region = reg.text.strip()
            locs[_key(lat, lon)] = s

        fields = [f.get("name") for f in member.iter("{%s}field" % NS["swe"])]
        pos_el = member.find(".//gmlcov:positions", NS)
        val_el = member.find(".//gml:doubleOrNilReasonTupleList", NS)
        if pos_el is None or val_el is None or not fields:
            continue
        ptoks = (pos_el.text or "").split()
        vtoks = (val_el.text or "").split()
        nf = len(fields)
        nrows = len(ptoks) // 3
        if len(vtoks) != nrows * nf:
            raise FmiError(f"value count mismatch: {len(vtoks)} != {nrows}*{nf}")
        for i in range(nrows):
            lat, lon, epoch = float(ptoks[3 * i]), float(ptoks[3 * i + 1]), int(ptoks[3 * i + 2])
            k = _key(lat, lon)
            s = locs.get(k) or out.get(k)
            if s is None:
                s = Series(lat=lat, lon=lon)
                locs[k] = s
            vals = {fields[j]: _num(vtoks[i * nf + j]) for j in range(nf)}
            s.rows.append((datetime.fromtimestamp(epoch, timezone.utc), vals))
        for k, s in locs.items():
            if k in out:
                out[k].rows.extend(s.rows)
            else:
                out[k] = s

    for s in out.values():
        s.rows.sort(key=lambda r: r[0])
    return list(out.values())


def parse_simple(xml: bytes) -> list[Series]:
    """BsWfs simple format: one element per (location, time, parameter)."""
    root = ET.fromstring(xml)
    check_exception(root)
    out: dict[tuple[float, float], Series] = {}
    rows: dict[tuple[tuple[float, float], datetime], dict] = {}
    for el in root.iter("{%s}BsWfsElement" % NS["BsWfs"]):
        pos = el.find(".//gml:pos", NS)
        t = el.find("BsWfs:Time", NS)
        pn = el.find("BsWfs:ParameterName", NS)
        pv = el.find("BsWfs:ParameterValue", NS)
        if pos is None or t is None or pn is None or pv is None:
            continue
        la, lo = (float(x) for x in (pos.text or "").split()[:2])
        k = _key(la, lo)
        if k not in out:
            out[k] = Series(lat=la, lon=lo)
        ts = datetime.fromisoformat((t.text or "").strip().replace("Z", "+00:00"))
        rows.setdefault((k, ts), {})[(pn.text or "").strip()] = _num((pv.text or "nan").strip())
    for (k, ts), vals in rows.items():
        out[k].rows.append((ts, vals))
    for s in out.values():
        s.rows.sort(key=lambda r: r[0])
    return list(out.values())
