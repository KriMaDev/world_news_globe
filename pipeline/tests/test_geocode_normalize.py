from globe_pipeline.geocode import City, Gazetteer, distance_km, place_name
from globe_pipeline.normalize import clean_text, snippet


def test_distance_sofia_tokyo() -> None:
    assert 9_100 < distance_km(42.6975, 23.3242, 35.6895, 139.6917) < 9_300


def test_reverse_city_with_hierarchy(gazetteer) -> None:
    geo = gazetteer.reverse(42.70, 23.32)
    assert (geo.continent, geo.region, geo.country, geo.admin1, geo.city, geo.precision) == (
        "Europe",
        "Eastern Europe",
        "Bulgaria",
        "Sofia-Capital",
        "Sofia",
        "city",
    )
    assert place_name(geo, "?") == "Sofia, Bulgaria"


def test_reverse_prefers_the_metropolis_over_its_district(gazetteer) -> None:
    assert gazetteer.reverse(35.684, 139.70).city == "Tokyo"


def _border_gazetteer(gazetteer: Gazetteer) -> Gazetteer:
    """The test gazetteer plus a big city near a border, with small towns across it."""
    extra = [
        City("Jerusalem", 31.769, 35.2163, "IL", "06", 971_800),
        City("Ramallah", 31.8996, 35.2042, "PS", "WE", 43_880),
        City("Al Bireh", 31.9097, 35.2186, "PS", "WE", 45_975),
        City("Nablus", 32.2211, 35.2544, "PS", "WE", 130_326),
    ]
    return Gazetteer(
        gazetteer.cities + extra, gazetteer.countries, gazetteer.admin1, gazetteer.m49
    )


def test_reverse_never_crosses_a_border_to_a_bigger_city(gazetteer) -> None:
    border = _border_gazetteer(gazetteer)
    ramallah = border.reverse(31.902, 35.206)  # 15 km from Jerusalem, which is far bigger
    assert ramallah.country_code == "PS"
    assert ramallah.city in ("Ramallah", "Al Bireh")  # twin towns: the larger one wins
    assert border.reverse(32.22, 35.25).country_code == "PS"  # Nablus


def test_reverse_metropolis_rule_still_applies_within_a_country(gazetteer) -> None:
    border = _border_gazetteer(gazetteer)
    assert border.reverse(31.77, 35.22).city == "Jerusalem"
    assert border.reverse(35.684, 139.70).city == "Tokyo"


def test_reverse_offshore_is_region_level(gazetteer) -> None:
    geo = gazetteer.reverse(-33.5, -72.9)  # about 130 km off Valparaiso
    assert geo.precision == "region"
    assert geo.city is None
    assert place_name(geo, "?") == "Valparaiso, Chile"


def test_reverse_remote_is_none(gazetteer) -> None:
    assert gazetteer.reverse(-18.25, -12.94) is None  # Mid-Atlantic Ridge


def test_fips_to_iso(gazetteer) -> None:
    assert gazetteer.iso_from_fips("BU") == "BG"
    assert gazetteer.iso_from_fips("XX") is None


def test_clean_text_removes_tags_entities_and_space() -> None:
    assert (
        clean_text("  Floods &amp;amp; <b>storms</b>\n hit   coast ") == "Floods & storms hit coast"
    )


def test_snippet_cuts_at_a_word_with_an_ellipsis() -> None:
    text = "word " * 100
    cut = snippet(text, 30)
    assert len(cut) <= 30
    assert cut.endswith("…")
    assert not cut[:-1].endswith(" ")
    assert snippet("short", 30) == "short"
