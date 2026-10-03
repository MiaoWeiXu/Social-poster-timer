import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketize,
  byPlatform,
  formatClock,
  formatDuration,
  inLastDays,
  summarize,
  timeBins,
  toCSV,
} from '../src/stats.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 10, 3, 18);
const rec = (startedAt, activeMs, platform = 'instagram') => ({
  platform,
  kind: 'post',
  postId: 'X',
  url: 'https://www.instagram.com/p/X/',
  startedAt,
  endedAt: startedAt + activeMs,
  durationMs: activeMs,
  activeMs,
});

test('formatDuration', () => {
  assert.equal(formatDuration(0), '0秒');
  assert.equal(formatDuration(42_400), '42秒');
  assert.equal(formatDuration(65_000), '1分05秒');
  assert.equal(formatDuration(120_000), '2分');
  assert.equal(formatDuration(3_720_000), '1小时2分');
  assert.equal(formatDuration(7_200_000), '2小时');
});

test('formatClock', () => {
  assert.equal(formatClock(5_900), '0:05');
  assert.equal(formatClock(65_000), '1:05');
  assert.equal(formatClock(3_725_000), '1:02:05');
});

test('summarize', () => {
  const s = summarize([rec(NOW, 2_000), rec(NOW, 10_000), rec(NOW, 4_000), rec(NOW, 60_000)]);
  assert.equal(s.count, 4);
  assert.equal(s.totalMs, 76_000);
  assert.equal(s.avgMs, 19_000);
  assert.equal(s.medianMs, 7_000);
  assert.equal(s.maxMs, 60_000);
  assert.equal(s.quickExits, 2);
  assert.deepEqual(summarize([]), { count: 0, totalMs: 0, avgMs: 0, medianMs: 0, maxMs: 0, quickExits: 0 });
});

test('inLastDays uses local calendar days', () => {
  const list = [rec(at(2026, 10, 3, 0), 1), rec(at(2026, 10, 2, 23), 1), rec(at(2026, 9, 27, 1), 1), rec(at(2026, 9, 26, 23), 1)];
  assert.equal(inLastDays(list, 1, NOW).length, 1);
  assert.equal(inLastDays(list, 7, NOW).length, 3);
  assert.equal(inLastDays(list, Infinity, NOW).length, 4);
});

test('byPlatform sorts by total time', () => {
  const rows = byPlatform([rec(NOW, 1_000, 'x'), rec(NOW, 5_000), rec(NOW, 3_000)]);
  assert.deepEqual(rows.map((r) => [r.platform, r.count, r.totalMs, r.avgMs]), [
    ['instagram', 2, 8_000, 4_000],
    ['x', 1, 1_000, 1_000],
  ]);
});

test('bucketize', () => {
  const counts = bucketize([rec(NOW, 1_000), rec(NOW, 2_999), rec(NOW, 3_000), rec(NOW, 45_000), rec(NOW, 600_000)]);
  assert.deepEqual(counts.map((c) => c.count), [2, 1, 0, 1, 0, 1]);
});

test('timeBins: hourly for today, daily otherwise', () => {
  const list = [rec(at(2026, 10, 3, 9), 1_000), rec(at(2026, 10, 3, 9), 2_000), rec(at(2026, 10, 1, 9), 4_000)];
  const hourly = timeBins(inLastDays(list, 1, NOW), 1, NOW);
  assert.equal(hourly.length, 24);
  assert.equal(hourly[9].totalMs, 3_000);

  const daily = timeBins(list, 7, NOW);
  assert.equal(daily.length, 7);
  assert.equal(daily.at(-1).label, '10/3');
  assert.equal(daily.at(-1).totalMs, 3_000);
  assert.equal(daily.at(-3).totalMs, 4_000);

  assert.equal(timeBins(list, Infinity, NOW).length, 3);
});

test('toCSV escapes cells', () => {
  const r = { ...rec(NOW, 1_500), postId: 'a,"b"' };
  const [header, row] = toCSV([r]).split('\n');
  assert.ok(header.startsWith('platform,kind,post_id'));
  assert.ok(row.includes('"a,""b"""'));
  assert.ok(row.endsWith(',1.5,1.5'));
});
