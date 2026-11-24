/**
 * The time window: presets (6 h, 24 h, 3 days, 7 days, 14 days), an "ending at" slider that
 * moves the window back in time by the hour, down to 14 days ago, and the "Ongoing events" tick
 * box. Built once and updated in place, so dragging the slider is never interrupted by a redraw.
 */

import {
  HISTORY_HOURS,
  RANGE_LABELS,
  RANGES,
  windowOf,
  type FilterState,
  type RangeKey,
} from '../filters';

const HOUR = 3_600_000;
const local = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const utc = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

/** What "Ongoing events" adds, shown while it is ticked. */
export const ONGOING_NOTE =
  'Also shows events that began before this time and are still going on: WHO outbreak ' +
  'reports for 14 days after publication, and internet outages until they end. Their cards ' +
  'say so. News reports have no end date, so they still show only when published.';

export interface Timeline {
  update(state: FilterState, now: number): void;
}

/** How many whole hours before now the window ends. */
export function hoursBack(state: FilterState, now: number): number {
  return state.end === null ? 0 : Math.max(0, Math.round((now - state.end) / HOUR));
}

/** The furthest back the window may end, so it never reaches past the 14 days of data. */
export function maxHoursBack(range: RangeKey): number {
  return HISTORY_HOURS - RANGES[range];
}

export function createTimeline(
  root: HTMLElement,
  onChange: (change: Partial<FilterState>) => void,
): Timeline {
  const presets = document.createElement('div');
  presets.className = 'chips';
  presets.setAttribute('role', 'group');
  presets.setAttribute('aria-label', 'Time window');
  const buttons = new Map<RangeKey, HTMLButtonElement>();
  for (const key of Object.keys(RANGES) as RangeKey[]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = RANGE_LABELS[key];
    button.addEventListener('click', () => onChange({ range: key }));
    buttons.set(key, button);
    presets.append(button);
  }

  const sliderRow = document.createElement('div');
  sliderRow.className = 'timeline-row';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'timeline-slider';
  slider.min = '0';
  slider.step = '1';
  slider.id = 'timeline-slider';
  slider.setAttribute('aria-label', 'Hours before now that the window ends');
  // Right is now, left is further back: the slider's value counts hours back.
  slider.style.direction = 'rtl';
  const nowButton = document.createElement('button');
  nowButton.type = 'button';
  nowButton.className = 'card-back';
  nowButton.textContent = 'Now';
  nowButton.addEventListener('click', () => onChange({ end: null }));
  sliderRow.append(slider, nowButton);

  const readout = document.createElement('p');
  readout.className = 'timeline-readout';
  readout.setAttribute('aria-live', 'polite');

  let pending = 0;
  slider.addEventListener('input', () => {
    // Apply at most once per frame while dragging.
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      const back = Number(slider.value);
      onChange({ end: back === 0 ? null : Date.now() - back * HOUR });
    });
  });

  // "Ongoing events": off by default, so a window shows only what was published in it (owner,
  // 24 Nov 2026). Ticked, reports that are still current count too, and the note says which.
  const ongoingRow = document.createElement('label');
  ongoingRow.className = 'ongoing-toggle';
  const ongoingBox = document.createElement('input');
  ongoingBox.type = 'checkbox';
  ongoingBox.id = 'ongoing-toggle';
  ongoingBox.setAttribute('aria-describedby', 'ongoing-note');
  ongoingBox.addEventListener('change', () => onChange({ ongoing: ongoingBox.checked }));
  const ongoingText = document.createElement('span');
  ongoingText.textContent = 'Ongoing events';
  ongoingRow.append(ongoingBox, ongoingText);
  const ongoingNote = document.createElement('p');
  ongoingNote.className = 'ongoing-note';
  ongoingNote.id = 'ongoing-note';
  ongoingNote.textContent = ONGOING_NOTE;

  root.replaceChildren(presets, sliderRow, readout, ongoingRow, ongoingNote);

  return {
    update(state, now) {
      for (const [key, button] of buttons)
        button.setAttribute('aria-pressed', String(key === state.range));
      slider.max = String(maxHoursBack(state.range));
      const back = Math.min(hoursBack(state, now), maxHoursBack(state.range));
      if (document.activeElement !== slider) slider.value = String(back);
      nowButton.disabled = state.end === null;
      ongoingBox.checked = state.ongoing;
      ongoingNote.hidden = !state.ongoing;
      const { from, to } = windowOf(state, now);
      const ending = state.end === null ? 'now' : local.format(to);
      readout.textContent = `${local.format(from)} → ${ending} · UTC ${utc.format(from)} → ${utc.format(to)}`;
    },
  };
}
