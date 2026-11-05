"""GeoNames city lists (CC BY 4.0) for the place search in the settings: every city of the
world with 15 000+ inhabitants, plus every place with 1 000+ in the Nordic and Baltic
countries. Finnish places also get their Finnish name (GeoNames often uses the Swedish one
for bilingual towns: Jakobstad / Pietarsaari). Split by the first two letters of the folded
name (both names are indexed) so a search loads only a few KB.

Row: [geonameid, name, lat, lon, country, admin1 name, population, timezone, finnish name or ""]
"""

import csv
import io
import unicodedata
import zipfile

from .. import net

BASE = "https://download.geonames.org/export/dump/"
NEAR = {"FI", "SE", "NO", "DK", "EE", "IS", "LV", "LT", "AX"}


def fold(s: str) -> str:
    """Lower-case ASCII-ish key: 'Jyväskylä' -> 'jyvaskyla', 'Tórshavn' -> 'torshavn'."""
    s = s.replace("ø", "o").replace("Ø", "O").replace("æ", "ae").replace("Æ", "AE").replace("ß", "ss").replace("ð", "d").replace("þ", "th").replace("Þ", "Th")
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).lower()


def shard(name: str) -> str:
    k = "".join(c for c in fold(name) if "a" <= c <= "z")[:2]
    return k if len(k) == 2 else "_"


def _rows(zip_bytes: bytes, member: str):
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z, z.open(member) as f:
        yield from csv.reader(io.TextIOWrapper(f, "utf-8"), delimiter="\t", quoting=csv.QUOTE_NONE)


def admin1_names(text: str) -> dict[str, str]:
    out = {}
    for line in text.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            out[parts[0]] = parts[1]
    return out


def finnish_names(zip_bytes: bytes) -> dict[str, list[str]]:
    """geonameid -> Finnish names from alternatenames/FI.zip, preferred name first."""
    names: dict[str, list[tuple[int, str]]] = {}
    for r in _rows(zip_bytes, "FI.txt"):
        if len(r) < 5 or r[2] != "fi" or not r[3]:
            continue
        if (len(r) > 6 and r[6] == "1") or (len(r) > 7 and r[7] == "1"):  # colloquial / historic
            continue
        names.setdefault(r[1], []).append((0 if r[4] == "1" else 1, r[3]))
    return {k: [n for _, n in sorted(v)] for k, v in names.items()}


def finnish_name(name: str, fi_names: list[str]) -> str:
    """The Finnish name if it differs from the GeoNames name, else ''."""
    if not fi_names or name in fi_names:
        return ""
    return fi_names[0]


def build(big: bytes, small: bytes, admin1: dict[str, str], fi_names: dict[str, list[str]] | None = None) -> dict[str, list[list]]:
    """big = cities15000.zip, small = cities1000.zip (only NEAR countries taken from it)."""
    fi_names = fi_names or {}
    seen: set[str] = set()
    shards: dict[str, list[list]] = {}

    def add(r: list[str]) -> None:
        gid, name, lat, lon, fclass, cc, a1, pop, tz = r[0], r[1], r[4], r[5], r[6], r[8], r[10], r[14], r[17]
        if gid in seen or fclass != "P":
            return
        seen.add(gid)
        fi = finnish_name(name, fi_names.get(gid, [])) if cc == "FI" else ""
        row = [int(gid), name, round(float(lat), 4), round(float(lon), 4), cc, admin1.get(f"{cc}.{a1}", ""), int(pop or 0), tz, fi]
        keys = {shard(name)} | ({shard(fi)} if fi else set())
        for k in keys:
            shards.setdefault(k, []).append(row)

    for r in _rows(big, "cities15000.txt"):
        add(r)
    for r in _rows(small, "cities1000.txt"):
        if r[8] in NEAR:
            add(r)
    for rows in shards.values():
        rows.sort(key=lambda x: -x[6])
    return shards


def cities() -> dict[str, list[list]]:
    big = net.get_bytes(BASE + "cities15000.zip")
    small = net.get_bytes(BASE + "cities1000.zip")
    admin1 = admin1_names(net.get(BASE + "admin1CodesASCII.txt").text)
    fi = finnish_names(net.get_bytes(BASE + "alternatenames/FI.zip"))
    return build(big, small, admin1, fi)
