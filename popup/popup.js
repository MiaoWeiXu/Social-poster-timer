import { getSessions, getTrackerState, STORAGE_KEYS } from '../src/storage.js';
import { liveActiveMs } from '../src/tracker.js';
import { formatClock, formatDuration, formatTime, inLastDays, summarize } from '../src/stats.js';
import { el, platformChip, postLabel, postLink } from '../src/ui.js';

const $ = (id) => document.getElementById(id);
let tracker = null;

function liveSession() {
  if (!tracker || tracker.attendedTabId == null) return null;
  return tracker.open[String(tracker.attendedTabId)] ?? null;
}

function renderLive() {
  const session = liveSession();
  $('live').hidden = !session;
  if (!session) return;
  $('live-title').replaceChildren(platformChip(session.platform), ' ', postLabel(session));
  $('live-time').textContent = formatClock(liveActiveMs(session, Date.now()));
}

async function render() {
  tracker = await getTrackerState();
  const today = inLastDays(await getSessions(), 1, Date.now());
  const s = summarize(today);

  $('s-count').textContent = s.count;
  $('s-total').textContent = formatDuration(s.totalMs);
  $('s-median').textContent = formatDuration(s.medianMs);
  $('s-quick').textContent = s.count ? `${s.quickExits} (${Math.round((s.quickExits / s.count) * 100)}%)` : '0';

  const recent = today.slice(-8).reverse();
  $('empty').hidden = recent.length > 0;
  $('recent').replaceChildren(
    ...recent.map((r) =>
      el(
        'li',
        {},
        platformChip(r.platform),
        postLink(r),
        el('span', {}, el('span', { class: 'when', textContent: formatTime(r.startedAt) }), el('span', { class: 'dur num', textContent: formatDuration(r.activeMs) })),
      ),
    ),
  );
  renderLive();
}

$('open-dashboard').addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (STORAGE_KEYS.SESSIONS in changes || STORAGE_KEYS.TRACKER in changes)) render();
});
setInterval(renderLive, 1000);
render();
