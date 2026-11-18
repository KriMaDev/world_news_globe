"""Cloudflare Radar: internet outages seen in Cloudflare's network traffic (the Outage Center).

Radar's API data is under CC BY-NC 4.0 (non-commercial use, with credit; docs/sources.md). The
API needs a token, which the pipeline never sees: a separate job in update.yml saves the API's
answer to a file (only `curl` runs with the token), and this module reads that file. Locally,
tools/fetch_radar.py does the same from the git-ignored .env.

Rules (docs/sources.md, "Cloudflare Radar"):
- One event per country the outage lists, at country level, on Natural Earth's label point.
- The title is built from Radar's own fields only ("Internet outage in Cuba: power outage
  (nationwide)"); Radar's description is the card's snippet, credited.
- It starts at Radar's start date and stays current until its end date, or for as long as
  Radar lists it as ongoing.
- Severity by reach and cause (severity.radar_severity).
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import datetime
from pathlib import Path
from typing import Any

from ..geocode import Gazetteer, label_points
from ..http import FetchError
from ..models import Event, Source, parse_iso
from ..normalize import clean_text, snippet
from ..severity import radar_severity

ID = "radar"
NAME = "Cloudflare Radar Outage Center"
HOMEPAGE = "https://radar.cloudflare.com/outage-center"
#: The source name on events, and the credit (docs/sources.md).
SOURCE = "Cloudflare Radar"
CREDIT = "Cloudflare Radar (CC BY-NC 4.0)"
#: What the radar job in update.yml asks for (also tools/fetch_radar.py).
API_URL = (
    "https://api.cloudflare.com/client/v4/radar/annotations/outages"
    "?dateRange=14d&limit=200&format=json"
)
#: Where a local run finds the saved answer (tools/fetch_radar.py writes it).
DEFAULT_FILE = Path(__file__).resolve().parents[3] / ".cache" / "radar" / "outages.json"


def _words(code: str) -> str:
    """Radar's codes in plain words: "POWER_OUTAGE" -> "power outage"."""
    return code.replace("_", " ").strip().lower()


def _countries(annotation: dict[str, Any]) -> list[str]:
    """The ISO codes an outage lists; for an outage of single networks, their countries."""
    codes = [str(c).upper() for c in annotation.get("locations") or [] if c]
    if not codes:
        for asn in annotation.get("asnsDetails") or []:
            code = str((asn.get("location") or {}).get("code") or "").upper()
            if code:
                codes.append(code)
    return list(dict.fromkeys(codes))


def title_for(country: str, cause: str, kind: str) -> str:
    """ "Internet outage in Cuba: power outage (nationwide)", from Radar's fields only."""
    title = f"Internet outage in {country}"
    if cause and cause.upper() not in ("UNKNOWN", ""):
        title += f": {_words(cause)}"
    if kind:
        title += f" ({_words(kind)})"
    return title


def parse(
    doc: dict[str, Any],
    gazetteer: Gazetteer,
    now: datetime,
    points: Mapping[str, tuple[float, float]] | None = None,
) -> tuple[list[Event], dict[str, int]]:
    """Events from Radar's outage annotations, and stats (outages, ongoing, not placed)."""
    if not doc.get("success", False):
        raise FetchError("Cloudflare Radar answered without success")
    points = label_points() if points is None else points
    annotations = (doc.get("result") or {}).get("annotations") or []
    events: list[Event] = []
    ongoing = unplaced = 0
    for annotation in annotations:
        if not annotation.get("id") or not annotation.get("startDate"):
            continue
        outage = annotation.get("outage") or {}
        cause = str(outage.get("outageCause") or "")
        kind = str(outage.get("outageType") or "")
        start = parse_iso(str(annotation["startDate"]))
        end = annotation.get("endDate")
        until = parse_iso(str(end)) if end else now
        ongoing += 0 if end else 1
        codes = [c for c in _countries(annotation) if c in points and c in gazetteer.countries]
        if not codes:
            unplaced += 1
            continue
        severity, reason = radar_severity(kind, cause)
        scope = clean_text(annotation.get("scope"))
        for iso2 in codes:
            geo = gazetteer.geo_for_country(iso2, "country")
            country = geo.country or iso2
            lat, lng = points[iso2]
            events.append(
                Event(
                    id=f"radar:{annotation['id']}:{iso2}",
                    title=title_for(country, cause, kind),
                    snippet=snippet(annotation.get("description")),
                    place=f"{country} ({scope})" if scope else country,
                    lat=lat,
                    lng=lng,
                    severity=severity,
                    severity_reason=reason,
                    categories=["cyber"],
                    kind="data-feed",
                    feed=ID,
                    published=start,
                    first_seen=now,
                    sources=[Source(SOURCE, HOMEPAGE)],
                    geo=geo,
                    location_method="source",
                    until=until,
                )
            )
    stats = {"outages": len(annotations), "ongoing": ongoing, "not_placed": unplaced}
    return events, stats


def fetch(
    gazetteer: Gazetteer, now: datetime, path: Path | None = None
) -> tuple[list[Event], dict[str, int]]:
    """Reads the answer saved by the radar job (or tools/fetch_radar.py)."""
    path = path or DEFAULT_FILE
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise FetchError(f"no Cloudflare Radar file at {path}") from error
    except (OSError, json.JSONDecodeError) as error:
        raise FetchError(f"unreadable Cloudflare Radar file: {error}") from error
    if not isinstance(doc, dict):
        raise FetchError("Cloudflare Radar file is not a JSON object")
    return parse(doc, gazetteer, now)
