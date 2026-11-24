# Changelog

Every release of World News Globe, newest first. The footer shows the version and the build date, such as "Version 1.9.0 · 2026-11-14", and links here. Each version has a git tag (`v1.9.0`) on the commit that went live.

Numbers are MAJOR.MINOR.PATCH: a new feature or a visible change raises the middle number, fixes, texts and maintenance the last. 1.0.0 is the first version with real events (milestone 3); 0.1.0 and 0.2.0 are milestones 1 and 2. Changes to tests, CI and notes alone are listed with the release they shipped in.

## 1.14.1 · 2026-11-24

- Time filters now mean exactly what they say: "6 h" shows only what was published in the last 6 hours, and the same for 24 hours, 3, 7 and 14 days. Before, WHO outbreak reports stayed in every time window for 14 days after publication, and Cloudflare Radar outages until they ended, so "6 h" could show a report from 11 days ago. They now count only at their publication date, like all other news. The WHO card and the About and Sources pages no longer say "shown for 14 days".

## 1.14.0 · 2026-11-19

- Less crowding with long time windows. With 7 or 14 days, news older than the window's last 3 days is a still dot in its severity colour, without a pillar, pulse or rings, and one step smaller for every day of age. It still opens its card, and the card and hover label say how many days old it is and why it is a dot. The newest 3 days stand tall as before, and the default 3-day window is unchanged. The legend explains the dot. On a test PC, 14 days now draws about 140 frames a second instead of 33.
- Low-severity markers on a shore or an island, or on the night side, are drawn as a soft disc with a faint dark edge, so their blue no longer vanishes into blue coast lines or bright city lights.
- Count badges no longer pile up: where two would overlap, the newer and bigger group's badge shows and the other waits until zooming in makes room; badges near the globe's edge are hidden. Their markers can still be clicked.
- On any device that can't keep up (under about 25 frames a second), the globe's picture may now get slightly softer (down to 75 % sharpness) instead of stuttering. Before, only high-density screens did this.
- The legend no longer shows a sideways scrollbar in some browsers.

## 1.13.0 · 2026-11-19

- Country symbols on the Geography map: each country with news shows the symbol of its main news (the category of its most severe event) in that severity's colour, with "+2" for two more categories. Small countries show their symbol alone where it fits, until their name appears. A country's card lists every category in its news with a count, and the legend lists every symbol.

## 1.12.0 · 2026-11-18

- Markers stay apart and clickable when zoomed in. They keep about the same size on screen at every zoom, instead of growing about five times. Pillars get shorter close up, so they no longer lean over their neighbours. Rings shrink with the zoom.
- Markers close together are laid out like pins on a map, newest first: each at its place or in a free slot beside it, never on top of another. Where room runs out, only the oldest stories form a group, which opens as a list. A click where markers still touch lists every event there.
- The zoom always goes all the way in. It used to stop until NASA's close-up images had loaded.
- The legend can be folded on wider screens too, with an arrow in its top right corner.

## 1.11.0 · 2026-11-18

- New category, Cyber & outages: hacks, ransomware, data breaches, internet shutdowns, power cuts and big service outages. It takes the cyber and outage words from Technology advancements.
- Internet outages from Cloudflare Radar's Outage Center, as a data feed: one event per country, while the outage lasts. A government-ordered nationwide shutdown is critical, other nationwide outages high, regional ones moderate, single networks low.

## 1.10.0 · 2026-11-18

- WHO outbreak reports: the World Health Organization's Disease Outbreak News, in Health & outbreaks, shown in every country a report names for 14 days after publication. The most dangerous diseases are critical; other reports are high with 10 or more deaths, otherwise moderate (rule on the About page).
- The timeline reaches back 14 days, with a 14 days choice. Earthquakes and disaster alerts are kept for the 14 days too.
- Places near a border stay in their own country: news from the West Bank no longer lands in Israel. Cards say a place found by software can land across a border, and About says borders and names take no side.
- Categories reviewed for 2026: new words for air attacks, elections and local politics, labour strikes, outages and cyber attacks, this year's outbreaks, and climate.
- Licence: the code is under the PolyForm Noncommercial License 1.0.0 from this version (free for any non-commercial use). Earlier versions stay under MIT.
- The update tries the deploy again when Cloudflare is briefly unable to find the new version.

## 1.9.0 · 2026-11-14

- The footer shows a version number and the build date, and links to this changelog, instead of the commit.
- Development tools: wrangler 4.156.1.

## 1.8.2 · 2026-11-14

- The legal page after a GDPR review: every right is listed, people named in a headline can ask for its removal, messages are handled under krimadev.com's privacy policy, and Cloudflare's request logs and the EU-US Data Privacy Framework are named.
- Development tools: wrangler 4.155.0, typescript-eslint 8.72.1, @types/node 26.6.6.

## 1.8.1 · 2026-11-10

- GDELT is reported as partly read only when a file is an hour overdue.
- Security fix in the development tools (minimatch 11.0.1).

## 1.8.0 · 2026-11-10

- Atlas: big cities, islands and every other feature, with matched descriptions; better river matching. Milestone 6 finished.

## 1.7.0 · 2026-11-10

- Three maps: News, Geography with capitals, and a news-free Atlas; stacked news fans out when zoomed in; US states and their capitals; more room on the top row.

## 1.6.0 · 2026-11-09

- Accessibility: automatic checks and fixes, Escape returns from Info, filter changes are announced; no text under 11 px, with an A / A+ size switch; plainer words; Geography labels; an event opened close up stays in view.

## 1.5.0 · 2026-11-08

- Faster: Geography drawn as one object, a smaller download, an earlier start; the globe button also returns to the starting view.

## 1.4.0 · 2026-11-08

- Every touch screen gets the touch layout, and panels fit any screen. Browser tests for filters, cards, Headlines, pages and Geography.

## 1.3.0 · 2026-11-08

- Phones: one row of controls, a compact footer, safe zoom; touch drags start anywhere on the globe; a failsafe for GDELT.

## 1.2.2 · 2026-11-08

- The standards shared with krimadev.com and Star Teller: security headers, a script policy and a locked-down deploy.

## 1.2.1 · 2026-11-08

- GDELT files that fail, or arrive damaged, are tried again, and the status says so.

## 1.2.0 · 2026-11-08

- Milestone 5: the Headlines panel, source attribution, About and Sources pages, more categories, and plain pages for search engines and AI assistants.

## 1.1.1 · 2026-11-08

- Updates on time: a Cloudflare Cron Trigger in its own Worker starts the data update every 30 minutes.

## 1.1.0 · 2026-11-07

- Milestone 4: filters, timeline, groups, the geography view, place cards, sharp NASA close-ups and the legal page.

## 1.0.0 · 2026-11-07

- Milestone 3: real events every 30 minutes from USGS, GDACS and GDELT news from allowlisted outlets, with an attribution card and the data time.

## 0.2.0 · 2026-11-07

- Milestone 2: the globe with sample events and severity lights, pillars of light and the krimadev.com look.

## 0.1.0 · 2026-11-07

- Milestone 1: a placeholder page at globe.krimadev.com, the project skeleton and CI.
