"""Upcoming Finnish elections and referendums from Wikidata (CC0), for the flag days in the
header. Regular elections are also computed in the frontend (lib/flagdays.ts) from the
election act; this adds the ones rules cannot predict (European Parliament elections,
early elections, referendums, second presidential rounds) once Wikidata has them.

Only dates with day precision are used. Several items on the same day (e.g. separate
municipal and regional election items plus a combined one) become one entry.
"""

import re
from datetime import date, datetime, timedelta, timezone

from .. import net

SPARQL_URL = "https://query.wikidata.org/sparql"
QUERY = """SELECT ?e ?fi ?en ?date ?prec WHERE {
  { ?e wdt:P31/wdt:P279* wd:Q40231 } UNION { ?e wdt:P31/wdt:P279* wd:Q43109 }
  { ?e wdt:P17 wd:Q33 } UNION { ?e wdt:P1001 wd:Q33 }
  ?e p:P585/psv:P585 [ wikibase:timeValue ?date; wikibase:timePrecision ?prec ].
  FILTER(?date >= "%s"^^xsd:dateTime)
  OPTIONAL { ?e rdfs:label ?fi FILTER(LANG(?fi) = "fi") }
  OPTIONAL { ?e rdfs:label ?en FILTER(LANG(?en) = "en") }
} ORDER BY ?date"""


def kind(fi: str) -> str:
    s = fi.lower()
    if "kansanäänestys" in s:
        return "referendum"
    if "europarlamentti" in s or "euroopan parlamentin" in s:
        return "eu"
    if "presidentinvaali" in s:
        return "presidential2" if "toinen kierros" in s else "presidential"
    if "eduskuntavaalit" in s:
        return "parliamentary"
    if "kuntavaalit" in s or "aluevaalit" in s:
        return "municipal"
    return "other"


def clean_fi(s: str) -> str:
    """'Suomen presidentinvaalin 2024 toinen kierros' -> 'Presidentinvaalin toinen kierros'."""
    s = re.sub(r"\b(19|20)\d\d\b", "", s)
    s = re.sub(r"^Suomen\s+", "", s.strip())
    s = re.sub(r"\s+", " ", s).strip(" ,")
    return s[:1].upper() + s[1:]


def clean_en(s: str) -> str:
    """'2027 Finnish parliamentary election' -> 'Parliamentary election'."""
    s = re.sub(r"\b(19|20)\d\d\b", "", s)
    s = re.sub(r"\b(in )?Finland\b|\bFinnish\b", "", s)
    s = re.sub(r"\s+", " ", s).strip(" ,")
    return s[:1].upper() + s[1:]


def parse(doc: dict) -> list[dict]:
    by_date: dict[str, list[dict]] = {}
    for b in doc.get("results", {}).get("bindings", []):
        if b.get("prec", {}).get("value") != "11":  # day precision only
            continue
        fi = b.get("fi", {}).get("value")
        if not fi:
            continue
        d = b["date"]["value"][:10]
        item = {"qid": b["e"]["value"].rsplit("/", 1)[-1], "fi": fi, "en": b.get("en", {}).get("value") or ""}
        lst = by_date.setdefault(d, [])
        if not any(x["qid"] == item["qid"] for x in lst):
            lst.append(item)
    out = []
    for d, items in sorted(by_date.items()):
        # prefer a combined item ("alue- ja kuntavaalit"), then a specific round, then the longest name
        best = max(items, key=lambda x: (" ja " in x["fi"], "kierros" in x["fi"], len(x["fi"])))
        out.append(
            {
                "date": d,
                "kind": kind(best["fi"]),
                "name": {"fi": clean_fi(best["fi"]), "en": clean_en(best["en"]) if best["en"] else clean_fi(best["fi"])},
                "qid": best["qid"],
            }
        )
    return out


def upcoming(today: date | None = None) -> list[dict]:
    today = today or datetime.now(timezone.utc).date()
    since = (today - timedelta(days=1)).isoformat() + "T00:00:00Z"
    doc = net.get_json(SPARQL_URL, {"query": QUERY % since, "format": "json"}, headers={"Accept": "application/sparql-results+json"})
    return parse(doc)
