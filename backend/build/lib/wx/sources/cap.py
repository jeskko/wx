"""FMI weather warnings from the CAP Atom feed (alerts embedded, fi/sv/en infos)."""

import xml.etree.ElementTree as ET

from .. import net

FEED = "https://alerts.fmi.fi/cap/feed/atom_fi-FI.xml"
ATOM = "{http://www.w3.org/2005/Atom}"
CAP = "{urn:oasis:names:tc:emergency:cap:1.2}"

# FMI/MetCoOp colour scale
SEVERITY_COLOR = {"Minor": "green", "Moderate": "yellow", "Severe": "orange", "Extreme": "red"}
LANG = {"fi-FI": "fi", "sv-FI": "sv", "en-GB": "en", "en-US": "en"}


def _t(el, name: str) -> str | None:
    x = el.find(CAP + name)
    return x.text.strip() if x is not None and x.text else None


def _polygon(text: str, nd: int = 3) -> list[list[float]]:
    pts = []
    for pair in text.split():
        la, lo = pair.split(",")
        p = [round(float(la), nd), round(float(lo), nd)]
        if not pts or pts[-1] != p:
            pts.append(p)
    return pts


def parse(xml: bytes) -> list[dict]:
    root = ET.fromstring(xml)
    out = []
    for entry in root.iter(ATOM + "entry"):
        alert = entry.find(f".//{CAP}alert")
        if alert is None:
            continue
        if _t(alert, "status") != "Actual" or _t(alert, "msgType") == "Cancel":
            continue
        texts: dict[str, dict] = {}
        areas: list[dict] = []
        base = None
        for info in alert.findall(CAP + "info"):
            lang = LANG.get(_t(info, "language") or "", (_t(info, "language") or "fi")[:2])
            texts[lang] = {
                "event": _t(info, "event"),
                "headline": _t(info, "headline"),
                "description": _t(info, "description"),
                "instruction": _t(info, "instruction"),
            }
            infos_areas = info.findall(CAP + "area")
            if not areas:
                for a in infos_areas:
                    polys = [_polygon(p.text) for p in a.findall(CAP + "polygon") if p.text]
                    areas.append({"name": {}, "polygons": polys})
            for i, a in enumerate(infos_areas):
                if i < len(areas):
                    areas[i]["name"][lang] = _t(a, "areaDesc")
            if base is None:
                code = None
                ec = info.find(CAP + "eventCode")
                if ec is not None:
                    code = _t(ec, "value")
                base = {
                    "code": code,
                    "severity": _t(info, "severity"),
                    "urgency": _t(info, "urgency"),
                    "certainty": _t(info, "certainty"),
                    "onset": _t(info, "onset") or _t(info, "effective"),
                    "expires": _t(info, "expires"),
                }
        if base is None:
            continue
        out.append(
            {
                "id": _t(alert, "identifier"),
                "sent": _t(alert, "sent"),
                **base,
                "color": SEVERITY_COLOR.get(base["severity"] or "", "yellow"),
                "text": texts,
                "areas": areas,
            }
        )
    rank = {sev: i for i, sev in enumerate(SEVERITY_COLOR)}
    out.sort(key=lambda w: (-rank.get(w["severity"] or "", 0), w["onset"] or ""))
    return out


def warnings() -> list[dict]:
    return parse(net.get_bytes(FEED))
