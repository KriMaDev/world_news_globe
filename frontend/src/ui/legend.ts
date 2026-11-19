/**
 * The always-visible legend: what each severity means and what the markers are. Built from
 * SEVERITY_STYLES so the samples can never drift from the globe. Severity rows and marker rows
 * share one set of columns (sample, name, explanation).
 */

import { CATEGORY_ICONS } from '../globe/category-icons';
import { HAZARD_ICONS, iconSvg, type HazardIcon } from '../globe/hazard-icons';
import { SEVERITY_STYLES } from '../severity';
import { SEVERITIES, type Severity } from '../types';

/** Pillar height in pixels for the lowest level; grows like the pillars on the globe. */
const PILLAR_PX = 7;

/** What a level means, in short. The full rules are in docs/severity.md (keep in step). */
export const LEVEL_MEANING: Record<Severity, string> = {
  critical: '100+ dead · red alert',
  high: '10+ dead · orange alert',
  moderate: '1+ dead · listed danger',
  low: 'everything else',
};

/** Marker samples are grey: on the legend, as on the globe, colour only ever means severity. */
const SAMPLE_COLOR = '#a6a8a3';

function span(className: string, text?: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function paragraph(className: string, text: string): HTMLParagraphElement {
  const node = document.createElement('p');
  node.className = className;
  node.textContent = text;
  return node;
}

function heading(text: string, className = 'legend-title'): HTMLHeadingElement {
  const node = document.createElement('h2');
  node.className = className;
  node.textContent = text;
  return node;
}

/** One row: a sample of the marker, its name, and what it means. */
function row(sample: HTMLElement, name: string, how: string): HTMLLIElement {
  sample.setAttribute('aria-hidden', 'true');
  const item = document.createElement('li');
  item.append(sample, span('legend-name', name), span('legend-how', how));
  return item;
}

function rows(items: HTMLLIElement[]): HTMLUListElement {
  const list = document.createElement('ul');
  list.className = 'legend-list';
  list.append(...items);
  return list;
}

/** A small pillar of light, like those on the globe. */
function pillar(
  height: number,
  width: number,
  color: string,
  pulseSeconds: number | null = null,
): HTMLSpanElement {
  const node = span(pulseSeconds === null ? 'legend-pillar' : 'legend-pillar pulsing');
  node.style.setProperty('--pillar-h', `${height}px`);
  node.style.setProperty('--pillar-w', `${width.toFixed(1)}px`);
  node.style.setProperty('--dot-color', color);
  if (pulseSeconds !== null) node.style.setProperty('--pulse', `${pulseSeconds}s`);
  return node;
}

/** A small glass disc with a symbol, like those on the globe. */
export function symbolBadge(code: string): HTMLSpanElement {
  const icon = HAZARD_ICONS.find((i) => i.code === code) ?? HAZARD_ICONS[HAZARD_ICONS.length - 1];
  return badgeOf(icon);
}

function badgeOf(icon: HazardIcon): HTMLSpanElement {
  const badge = span('legend-symbol');
  badge.setAttribute('aria-hidden', 'true');
  badge.append(iconSvg(icon, SAMPLE_COLOR));
  return badge;
}

function severityRows(): HTMLUListElement {
  return rows(
    [...SEVERITIES].reverse().map((level) => {
      const style = SEVERITY_STYLES[level];
      const sample = pillar(
        Math.round(PILLAR_PX * style.size ** 1.6),
        3 * Math.sqrt(style.size),
        style.color,
        style.pulseSeconds,
      );
      return row(sample, style.label, LEVEL_MEANING[level]);
    }),
  );
}

function markerRows(): HTMLUListElement {
  // Shown only for windows longer than 3 days (by CSS, body.long-window; filters.ts, recentFrom).
  const older = row(olderDot(SAMPLE_COLOR), 'Older news', 'a small dot after 3 days');
  older.className = 'legend-older';
  return rows([
    row(pillar(16, 3, SAMPLE_COLOR), 'News', 'pillar of light'),
    older,
    row(symbolBadge('EQ'), 'Natural disaster', 'symbol shows its type'),
    row(span('legend-count', '3'), 'Group', 'events close together'),
  ]);
}

/** A small still dot, like older news on the globe. */
function olderDot(color: string): HTMLSpanElement {
  const node = span('legend-dot');
  node.style.setProperty('--dot-color', color);
  return node;
}

/** Every symbol by name, on request: the disasters' (News map) or the categories' (Geography
 * map, where natural disasters show their own type's symbol). */
function symbolList(
  icons: (HazardIcon | string)[],
  what: string,
  className = '',
): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = `legend-symbols ${className}`.trim();
  const summary = document.createElement('summary');
  summary.textContent = `Show ${what}`;
  details.addEventListener('toggle', () => {
    summary.textContent = `${details.open ? 'Hide' : 'Show'} ${what}`;
  });
  const list = document.createElement('ul');
  for (const icon of icons) {
    const item = document.createElement('li');
    // A string is a heading for the symbols after it.
    if (typeof icon === 'string') {
      item.className = 'legend-symbols-group';
      item.textContent = icon;
    } else item.append(badgeOf(icon), span('', icon.label));
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

const OPEN_KEY = 'wng-legend-open';

/** The screens that get the phone layout (the same query as in style.css). */
const PHONE_LAYOUT = '(max-width: 640px), (max-height: 520px), (any-pointer: coarse)';

/** Whether the legend starts open: as the visitor left it ("1" open, "0" closed), else open
 * on wider screens and closed to one row on phones. */
function startsOpen(): boolean {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(OPEN_KEY);
  } catch {
    // Storage may be blocked: use the default.
  }
  if (stored === '1' || stored === '0') return stored === '1';
  return !window.matchMedia(PHONE_LAYOUT).matches;
}

function rememberOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    // Storage may be blocked; the button still works for this visit.
  }
}

/** The arrow that opens or closes the legend: on phones at the end of its one row, on wider
 * screens in its top right corner, folding it to the four severity levels (style.css). */
function openButton(root: HTMLElement): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'legend-toggle';
  button.setAttribute('aria-controls', 'legend-more');
  button.append(span('legend-arrow'));
  const apply = (open: boolean): void => {
    root.classList.toggle('collapsed', !open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Show less of the legend' : 'Show the whole legend');
  };
  apply(startsOpen());
  button.addEventListener('click', () => {
    const open = root.classList.contains('collapsed');
    apply(open);
    rememberOpen(open);
  });
  return button;
}

export function renderLegend(root: HTMLElement): void {
  const link = document.createElement('a');
  link.className = 'legend-link';
  link.href = '/about/#severity';
  link.textContent = 'How severity is decided';

  const summary = document.createElement('p');
  summary.className = 'legend-summary';
  summary.id = 'legend-summary';
  summary.hidden = true;

  const head = document.createElement('div');
  head.className = 'legend-head';
  head.append(
    heading('Severity'),
    paragraph('legend-note', 'How serious an event is. Each card says why it got its level.'),
    severityRows(),
    openButton(root),
  );

  const more = document.createElement('div');
  more.className = 'legend-more';
  more.id = 'legend-more';
  // About the markers: the News map only (hidden by CSS on the others).
  const markers = document.createElement('div');
  markers.className = 'legend-markers';
  markers.append(
    paragraph(
      'legend-note',
      'Deaths as stated in the headline; alerts from USGS and GDACS. More severe events are taller and pulse faster; high and critical also send out rings.',
    ),
    heading('On the globe', 'legend-title legend-section'),
    markerRows(),
    symbolList(HAZARD_ICONS, 'disaster symbols'),
  );
  more.append(
    markers,
    // Shown on the Geography map only (by CSS, body.geo-view).
    paragraph(
      'legend-geo-note',
      'Countries take the colour of their most severe event and the symbol of its category ("+2": two more categories). Tap a country for its news.',
    ),
    // The categories, then the disasters' own symbols, which a country shows for its disaster.
    symbolList(
      [
        ...Object.values(CATEGORY_ICONS).filter((icon) => icon.code !== 'natural-disasters'),
        'Natural disasters, by type',
        ...HAZARD_ICONS,
      ],
      'country symbols',
      'legend-country-symbols',
    ),
    link,
  );

  // The Atlas has no news, so it has this short key instead (by CSS, body.atlas-view).
  const atlas = document.createElement('div');
  atlas.className = 'legend-atlas';
  atlas.append(
    heading('Atlas'),
    paragraph('legend-note', 'Tap any name to read about the place.'),
    paragraph('legend-key', 'Capital city'),
  );

  root.replaceChildren(head, more, summary, atlas);
}

/** "Showing 37 of 412 events · Clear filters" while filters are on; hidden otherwise. */
export function renderSummary(
  shown: number,
  total: number,
  filtered: boolean,
  onClear: () => void,
): void {
  const summary = document.getElementById('legend-summary');
  if (!summary) return;
  summary.hidden = !filtered;
  if (!filtered) return;
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear';
  clear.addEventListener('click', onClear);
  summary.replaceChildren(`Showing ${shown} of ${total} events`, clear);
}
