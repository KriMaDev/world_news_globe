# Severity rules

Every event on the globe has one of four severity levels. The level comes only from the documented rules below, never from a guess. The code is in `pipeline/globe_pipeline/severity.py`, and `pipeline/tests/test_rules.py` tests every rule and its boundaries. Any change to a rule must change this page and the code together, with tests.

Each event also carries a short **reason** in plain words, shown on its card, e.g. "Magnitude 6.2 (USGS)", "GDACS Orange alert (severity derived from it)" or "Headline reports 22 or more deaths".

## The scale

| Level    | Colour                 | Pillar of light on the globe | Pulse  | Rings |
| -------- | ---------------------- | ---------------------------- | ------ | ----- |
| Low      | `#56B4E9` (sky blue)   | shortest, slimmest           | none   | no    |
| Moderate | `#F0E442` (yellow)     | short                        | slow   | no    |
| High     | `#E69F00` (orange)     | tall                         | medium | yes   |
| Critical | `#D55E00` (vermillion) | tallest, widest              | fast   | yes   |

Each event is a pillar of light rising from its location. These are Okabe-Ito colours, chosen to be distinguishable with the common types of colour blindness. Height, width, pulse and rings also change with the level, so colour is never the only signal. With reduced motion turned on, there is no pulse and no rings; height and width still show the level. The legend is always visible.

## Rules by source

### Earthquakes (USGS)

1. If USGS gives a PAGER alert (its estimate of impact on people), it decides the level: green → low, yellow → moderate, orange → high, red → critical.
2. Otherwise the magnitude decides: under 5.0 → low, 5.0–5.9 → moderate, 6.0–6.9 → high, 7.0 and above → critical.

### GDACS alerts

Green → low, Orange → high, Red → critical. GDACS alerts are automated estimates: the card says so and points to official national authorities. This mapping is our change to GDACS's data, stated as required by its CC BY 4.0 licence.

### WHO outbreak reports

The owner's rule (18 Nov 2026), `who_severity`:

- **Critical:** the title names one of these (matched as a word start): Ebola, Marburg, smallpox, plague, Nipah, MERS (Middle East respiratory syndrome), avian or novel influenza in humans (`influenza A(H…`), cholera, yellow fever, mpox, polio, diphtheria, Lassa fever, Crimean-Congo haemorrhagic fever, illness of undetermined cause.
- **High:** any other report whose summary counts 10 or more deaths (the same patterns and threshold as news headlines; the summary is read for this number only and never shown).
- **Moderate:** every other report. WHO only publishes notable outbreaks, so a report is never low.

### Internet outages (Cloudflare Radar)

By the outage's type and cause as Radar gives them (`radar_severity`):

- **Critical:** a nationwide outage whose cause is `GOVERNMENT_DIRECTED` (an internet shutdown).
- **High:** any other nationwide outage.
- **Moderate:** a regional outage.
- **Low:** one network or platform (also any type Radar adds later, until it is listed here).

### The same earthquake from USGS and GDACS

They become one event listing both sources (see `pipeline/globe_pipeline/cluster.py`). It takes the higher of the two levels, with that rule's reason.

### NASA EONET events (milestone 7)

EONET gives no severity, so each event type will have a fixed default level, listed here when EONET is added.

### News reports

Only the headline is read: it is what the reader sees, and the rule can be checked against it.

1. **Deaths stated in the headline.** 1 or more → moderate, 10 or more → high, 100 or more → critical. Recognised forms:
   - "at least 12 killed", "12 people dead", "30 die", "dozens of civilians killed", "kills 22", "death toll rises to 1,250";
   - number words: one to twelve, "a dozen" (12), "dozens" (24), "scores" (40), "hundreds" (200), "thousands" (2,000).
2. **A hazard term in the headline** gives moderate:
   - "state of emergency", "evacuat…", "martial law", "curfew";
   - "air strike"/"airstrike", "missile strike", "drone strike", "shelling", "invasion", "coup", "explosion", "hostage", "massacre";
   - "outbreak", "epidemic", "pandemic", "famine", "tsunami warning".
3. **Otherwise** → low.

When several outlets report the same story, the event takes the highest level any of their headlines gives.

The same news rules apply to every category, Sport included: a headline reporting deaths at a stadium is rated like any other.

### What does not change severity

How many outlets cover a story is shown as **coverage**, separately. It never raises severity, because prominence is not severity.

## On the globe

### News and natural disasters look different

- **News** (every category except Natural disasters) is a **pillar of light**.
- **Natural disasters** (data feeds, and news headlines in Natural disasters) are a **symbol on a glass disc**, floating just above a small glowing spot, with a rim and a soft halo in the severity colour. The symbol shows the type: earthquake (seismograph trace), tsunami (curling wave), tropical cyclone (the weather-map sign), volcano, wildfire (flame), flood (house in water), landslide (rocks on a slope), avalanche, drought (sun over cracked ground), heatwave (thermometer), storm (cloud and bolt), and a warning sign for a disaster of unknown type.
- Severity shows the same way on both: colour, size, pulse speed and (high, critical) rings. The symbol adds the type, a second signal that does not depend on colour.
- The symbols are our own drawings (`frontend/src/globe/hazard-icons.ts`); the legend lists them all under "Disaster symbols".
- The Geography map and the Atlas draw no markers: on Geography the country colours (below) show the news, and tapping a country lists it.
- The legend sums up each level in a few words (`LEVEL_MEANING` in `frontend/src/ui/legend.ts`) and the About page in a table (`frontend/about/index.html`). Any change to a rule must change those too. Its marker samples are grey, so colour only ever means severity.

### Older news (since 1.14.0)

With a time window longer than 3 days (7 or 14 days), news older than the **last 3 days of the window** is drawn as a **still dot** in its severity colour with a dark edge (so a blue dot still shows on a blue coast line): no pillar, no pulse, no rings. The dot is **one step smaller for every day of age**: as big as a pillar's ground spot at 3 days old, 60 % of it from 13 days (a group counts by its newest event; `olderDotScale` in `markers.ts`). Higher severity is still a slightly bigger dot, and the dot opens its card like a pillar. Its card and hover label say how many days old it is and why it is a dot. The 3 days count back from the window's end, so moving the window back in time moves the line with it. A group is a dot only when all its events are older; a report that stays current (WHO, `until`) counts as new while it is current. Natural disasters keep their symbols at every age. With 6 hours, 24 hours or 3 days (the default), nothing is a dot.

Why (owner, 19 Nov 2026): what is new should stand out, and a dot's size should show its age at a glance, and hundreds of overlapping glowing pillars made the 14-day view slow (33 frames a second on a test PC, about 140 with dots). Code: `recentFrom` in `frontend/src/filters.ts`, `isOlder` in `frontend/src/clusters.ts`, the dots in `frontend/src/globe/markers.ts`.

### Markers that stand too close

Zoomed right in, where no grouping happens, markers are laid out like pins on a map, **newest first**, so that none is closer than about 60 screen pixels to another and each can be tapped:

1. a story stands at its true place if that is free, else in the nearest free slot of a ring of six around it, with a thin line back to its place;
2. a story that finds no free slot joins the nearest group of its kind nearby; without one, the oldest nearby story of its kind becomes a group holding both, in that story's slot.

So the newest stories stand alone, and groups form only where room runs out, typically where many stories share one city's coordinates. A group opens as a list. A click where markers still touch (in a tilted view) lists every event under it, within about a fingertip (40 px on touch screens, 28 px with a mouse). History, 18 Nov 2026: rings of more than six had spread into a web of crossing lines; rings landed on their neighbours, so one of two touching markers could not be clicked; the owner: the newest must never be hidden in a group.

Markers keep about the same size on screen at every zoom, and below altitude 1 pillars also get shorter (down to 30 % at the closest zoom), with click areas 1.5 times the glowing spot. Before 18 Nov 2026 they grew about 5 times on screen when zoomed in, and tall pillars leaned over their neighbours. The high and critical rings shrink with the zoom too.

### Groups of events

Where pillars would crowd (closer than 4°, 2° or 1° on screen depending on zoom; zoomed right in only for piles too big to fan out, above), they merge into one pillar (or one symbol: natural disasters and news are grouped separately, so a group is always one or the other). It takes the **highest severity among its events** and stands at that event's place, with a badge showing how many events it holds. Grouping never changes any event's own severity. Code: `frontend/src/clusters.ts`.

Badges never sit on top of each other (since 1.14.0): newer groups claim their place first, then bigger ones; a badge that would overlap one already shown, or that sits near the globe's edge, is hidden until zooming in makes room. Its marker stays and can still be clicked (`declutter` in `frontend/src/globe/globe.ts`).

### Geography view: country colours

Each country takes the **highest severity among its events** that pass the current filters and time window, matched by the event's `geo.country_code`. Countries without such events stay a neutral tint. Events without a country (e.g. remote earthquakes at sea) do not colour any country. Code: `countrySeverity` in `frontend/src/geography.ts`.

### Geography view: country symbols (since 1.13.0)

Each country with news also shows **one symbol**, for the category of its main news, inside its name label (owner's decision, 19 Nov 2026: one symbol per country, no hatching or other extra layer, which older devices would struggle with):

1. Take the country's events that pass the current filters and time window (the same events as the colour). Keep those at the country's highest severity.
2. Count their categories. Only categories the category filter lets through count, and an event with two categories counts for both. The category most of them have wins; a tie goes to the first in the fixed order (War, Politics, Natural disasters, Economic, Technology advancements, Cyber & outages, Health & outbreaks, Climate & environment, Crime & justice, Humanitarian & migration, Science & space, Sport). So colour and symbol always come from the same, most severe news.
3. Natural disasters show the disaster's own symbol (earthquake, flood and so on, as on the News map): that of the newest disaster at the country's highest severity, or the warning sign when its type is unknown.
4. "+2" after the name: the number of other categories among all the country's events. The country's card lists every category with its count.
5. The symbol is drawn in its severity's colour. Small countries whose name doesn't show yet at this zoom show their symbol alone, and only where it fits after every name has been placed; a name with no room is tried as its symbol alone before it is hidden. Symbols never cover a name.

Code: `countryNews` in `frontend/src/geography.ts`, the symbols in `frontend/src/globe/category-icons.ts` (our own drawings).

### Known limits

- Most news is low: a headline without a death count or a listed hazard term is low, however important the story. This keeps the rule checkable rather than guessing importance.
- Headlines sometimes report the same deaths differently across outlets ("22 killed" and "11 dead"); the highest wins.
