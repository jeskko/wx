"""Curated place and airport list (wx/places.yaml)."""

from dataclasses import dataclass
from functools import cache
from importlib import resources

import yaml


@dataclass(frozen=True)
class Place:
    id: str
    fi: str
    en: str
    lat: float
    lon: float
    country: str
    region: str
    icao: str | None = None

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "name": {"fi": self.fi, "en": self.en},
            "lat": self.lat,
            "lon": self.lon,
            "country": self.country,
            "region": self.region,
            "icao": self.icao,
        }


@cache
def _load() -> dict:
    return yaml.safe_load(resources.files("wx").joinpath("places.yaml").read_text(encoding="utf-8"))


def places() -> list[Place]:
    return [Place(**p) for p in _load()["places"]]


def airports() -> list[str]:
    codes = list(_load().get("airports", []))
    for p in places():
        if p.icao and p.icao not in codes:
            codes.append(p.icao)
    return codes
