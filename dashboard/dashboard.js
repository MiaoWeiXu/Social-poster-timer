import { clearSessions, getSessions, STORAGE_KEYS } from '../src/storage.js';
import { PLATFORMS } from '../src/platforms.js';
import {
  bucketize,
  byPlatform,
  dayKey,
  formatDuration,
  formatTime,
  inLastDays,
  summarize,
  timeBins,
  toCSV,
} from '../src/stats.js';
import { el, platformChip, postLink } from '../src/ui.js';

const $ = (id) => document.getElementById(id);
const TABLE_LIMIT = 300;

let days = 1;
let all = [];

function renderStats(list) {
  const s = summarize(list);
  $('s-count').textContent = s.count;
  $('s-total').textContent = formatDuration(s.totalMs);
  $('s-avg').textContent = `${formatDuration(s.avgMs)} / ${formatDuration(s.medianMs)}`;
  $('s-max').textContent = formatDuration(s.maxMs);
  $('s-quick').textContent = s.count ? `${s.quickExits} (${Math.round((s.quickExits / s.count) * 100)}%)` : '0';
}

function renderBins(list) {
  const bins = timeBins(list, days, Date.now());
  $('bins-title').textContent = days === 1 ? '今天每小时停留' : '每日停留';
  const max = Math.max(1, ...bins.map((b) => b.totalMs));
  const every = Math.ceil(bins.length / 15); // keep labels readable
  $('bins').replaceChildren(
    ...bins.map((b, i) =>
      el(
        'div',
        { class: 'col', title: `${b.label}${days === 1 ? ' 点' : ''}：${b.count} 个帖子，${formatDuration(b.totalMs)}` },
        el('div', { class: b.totalMs ? 'bar' : 'bar zero', style: { height: `${(b.totalMs / max) * 100}%` } }),
        el('div', { class: i % every ? 'lbl skip' : 'lbl', textContent: b.label }),
      ),
    ),
  );
}

function renderBuckets(list) {
  const buckets = bucketize(list);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = list.length || 1;
  $('buckets').replaceChildren(
    ...buckets.map((b) =>
      el(
        'div',
        { class: 'hbar' },
        el('span', { textContent: b.label }),
        el('div', { class: 'track' }, el('div', { class: 'fill', style: { width: `${(b.count / max) * 100}%` } })),
        el('span', { class: 'v num', textContent: `${b.count} · ${Math.round((b.count / total) * 100)}%` }),
      ),
    ),
  );
}

function renderPlatforms(list) {
  const rows = byPlatform(list);
  $('platforms').replaceChildren(
    ...(rows.length
      ? rows.map((r) =>
          el(
            'tr',
            {},
            el('td', {}, platformChip(r.platform)),
            el('td', { class: 'r', textContent: r.count }),
            el('td', { class: 'r', textContent: formatDuration(r.totalMs) }),
            el('td', { class: 'r', textContent: formatDuration(r.avgMs) }),
          ),
        )
      : [el('tr', {}, el('td', { colSpan: 4, class: 'muted', textContent: '暂无数据' }))]),
  );
}

function renderTable(list) {
  const sorted = $('sort').value === 'longest'
    ? list.slice().sort((a, b) => b.activeMs - a.activeMs)
    : list.slice().reverse();
  const shown = sorted.slice(0, TABLE_LIMIT);
  const today = dayKey(Date.now());
  $('sessions').replaceChildren(
    ...shown.map((s) =>
      el(
        'tr',
        {},
        el('td', {}, platformChip(s.platform)),
        el('td', {}, postLink(s)),
        el('td', { class: 'muted', textContent: dayKey(s.startedAt) === today ? formatTime(s.startedAt) : `${dayKey(s.startedAt)} ${formatTime(s.startedAt)}` }),
        el('td', { class: 'r', textContent: formatDuration(s.activeMs) }),
        el('td', { class: 'r muted', textContent: formatDuration(s.durationMs) }),
      ),
    ),
  );
  $('empty').hidden = list.length > 0;
  $('more').hidden = sorted.length <= TABLE_LIMIT;
  $('more').textContent = `只显示前 ${TABLE_LIMIT} 条，共 ${sorted.length} 条。完整数据请导出 CSV。`;
}

function render() {
  const list = inLastDays(all, days, Date.now());
  renderStats(list);
  renderBins(list);
  renderBuckets(list);
  renderPlatforms(list);
  renderTable(list);
}

async function reload() {
  all = await getSessions();
  render();
}

$('range').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-days]');
  if (!btn) return;
  days = btn.dataset.days === 'all' ? Infinity : Number(btn.dataset.days);
  for (const b of $('range').querySelectorAll('button')) b.classList.toggle('active', b === btn);
  render();
});

$('sort').addEventListener('change', render);

$('export').addEventListener('click', () => {
  const list = inLastDays(all, days, Date.now());
  // BOM so Excel opens the UTF-8 file correctly.
  const blob = new Blob(['﻿', toCSV(list)], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `post-dwell-${dayKey(Date.now())}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('clear').addEventListener('click', async () => {
  if (!confirm('确定清空所有记录？此操作无法撤销。')) return;
  await clearSessions();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && STORAGE_KEYS.SESSIONS in changes) reload();
});

// Show every supported platform in the empty state so users know what's tracked.
$('empty').textContent = `这个时间段还没有记录。支持：${Object.values(PLATFORMS).map((p) => p.name).join('、')}。`;
reload();
