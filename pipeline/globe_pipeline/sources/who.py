"""WHO Disease Outbreak News: the World Health Organization's official reports on outbreaks.

Only each report's title, date and link are shown: no text, no logo. Its summary is read
for one number, the deaths it counts (severity), and is never stored or shown. WHO content is under
CC BY-NC-SA 3.0 IGO (non-commercial use with credit; docs/sources.md).

Rules (docs/sources.md, "WHO Disease Outbreak News"):
- A report stays current for 14 days after WHO publishes it (`until`), or until WHO publishes
  a newer report with the same title: then only the newest is kept.
- It is placed in every country its title names after the disease ("Ebola disease …,
  Democratic Republic of the Congo, Kenya and Nigeria" gives three events with the same link),
  at country level, on Natural Earth's label point for that country. A title that names only a
  WHO region, "Global" or "Multi-country" is not placed (counted in the feed's stats).
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import quote

from ..geocode import Gazetteer, label_points
from ..http import get_json
from ..models import Event, Source, parse_iso
from ..normalize import clean_text
from ..severity import who_severity

ID = "who"
NAME = "WHO Disease Outbreak News"
HOMEPAGE = "https://www.who.int/emergencies/disease-outbreak-news"
#: The source name on events, and the credit WHO asks for (docs/sources.md).
SOURCE = "World Health Organization"
CREDIT = "World Health Organization (Disease Outbreak News)"
URL = (
    "https://www.who.int/api/news/diseaseoutbreaknews"
    "?$top=40&$orderby=PublicationDate%20desc&$select=Title,PublicationDate,UrlName,Summary"
)
REPORT_URL = "https://www.who.int/emergencies/disease-outbreak-news/item/{slug}"
#: How long a report stays current after WHO publishes it.
CURRENT_FOR = timedelta(days=14)

#: WHO's formal names for countries whose short name in the gazetteer differs, by ISO code.
ALIASES: dict[str, str] = {
    "Russian Federation": "RU",
    "Syrian Arab Republic": "SY",
    "Democratic People's Republic of Korea": "KP",
    "Republic of Korea": "KR",
    "Viet Nam": "VN",
    "Lao People's Democratic Republic": "LA",
    "Türkiye": "TR",
    "Turkiye": "TR",
    "Côte d'Ivoire": "CI",
    "Cote d'Ivoire": "CI",
    "Czech Republic": "CZ",
    "Netherlands": "NL",
    "Timor-Leste": "TL",
    "Palestine": "PS",
    "occupied Palestinian territory": "PS",
    "Congo": "CG",
    "United States of America": "US",
}

#: Between the disease and the places in a title: a hyphen or dash with a space, or a comma.
_SPLIT = re.compile(r"\s*[-–—]\s+|\s+[-–—]\s*|,\s+")


def places_part(title: str) -> str:
    """The part of a WHO title after the disease ("Measles - Bangladesh" -> "Bangladesh")."""
    parts = _SPLIT.split(title, maxsplit=1)
    return parts[1] if len(parts) == 2 else ""


def countries_named(title: str, gazetteer: Gazetteer) -> list[str]:
    """ISO codes of the countries a WHO title names after its disease, in title order. Longer
    names are matched first, so "Democratic Republic of the Congo" is never also "Congo"."""
    text = places_part(title)
    names = {info["name"]: iso2 for iso2, info in gazetteer.countries.items()}
    names.update(ALIASES)
    found: list[tuple[int, str]] = []
    for name in sorted(names, key=len, reverse=True):
        pattern = re.compile(r"(?<![\w-])" + re.escape(name) + r"(?![\w-])", re.I)
        for match in pattern.finditer(text):
            found.append((match.start(), names[name]))
            text = text[: match.start()] + " " * len(match.group()) + text[match.end() :]
    ordered: list[str] = []
    for _, iso2 in sorted(found):
        if iso2 not in ordered and iso2 in gazetteer.countries:
            ordered.append(iso2)
    return ordered


def _report_key(title: str) -> str:
    return re.sub(r"\W+", " ", title).strip().lower()


def parse(
    reports: list[dict[str, Any]],
    gazetteer: Gazetteer,
    now: datetime,
    points: Mapping[str, tuple[float, float]] | None = None,
) -> tuple[list[Event], dict[str, int]]:
    """Events from WHO's report list, and stats (reports read, current, not placed)."""
    points = label_points() if points is None else points
    newest: dict[str, dict[str, Any]] = {}
    for report in reports:
        title = clean_text(report.get("Title"))
        slug = str(report.get("UrlName") or "")
        if not title or not slug or not report.get("PublicationDate"):
            continue
        published = parse_iso(str(report["PublicationDate"]))
        if not timedelta(0) <= now - published <= CURRENT_FOR:
            continue
        key = _report_key(title)
        if key not in newest or published > newest[key]["published"]:
            summary = clean_text(report.get("Summary"))
            newest[key] = {"title": title, "slug": slug, "published": published, "summary": summary}

    events: list[Event] = []
    unplaced = 0
    for report in newest.values():
        title, slug, published = report["title"], report["slug"], report["published"]
        codes = [code for code in countries_named(title, gazetteer) if code in points]
        if not codes:
            unplaced += 1
            continue
        severity, reason = who_severity(title, report["summary"])
        for iso2 in codes:
            lat, lng = points[iso2]
            geo = gazetteer.geo_for_country(iso2, "country")
            events.append(
                Event(
                    id=f"who:{slug}:{iso2}",
                    title=title,
                    place=geo.country or iso2,
                    lat=lat,
                    lng=lng,
                    severity=severity,
                    severity_reason=reason,
                    categories=["health"],
                    kind="data-feed",
                    feed=ID,
                    published=published,
                    first_seen=now,
                    sources=[Source(SOURCE, REPORT_URL.format(slug=quote(slug)))],
                    geo=geo,
                    location_method="source",
                    until=published + CURRENT_FOR,
                )
            )
    stats = {"reports": len(reports), "current": len(newest), "not_placed": unplaced}
    return events, stats


def fetch(gazetteer: Gazetteer, now: datetime) -> tuple[list[Event], dict[str, int]]:
    doc = get_json(URL)
    reports = doc.get("value", []) if isinstance(doc, dict) else []
    return parse(reports, gazetteer, now)
