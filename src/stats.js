// Formatting and aggregation for popup/dashboard. Pure, Node-testable.
// All "time spent" numbers use activeMs (time the post was actually in front of you).

export function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}分${String(rs).padStart(2, '0')}秒` : `${m}分`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}小时${rm}分` : `${h}小时`;
}

export function formatClock(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function formatTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sessions whose start falls in the last `days` local calendar days (1 = today). */
export function inLastDays(sessions, days, now) {
  if (!Number.isFinite(days)) return sessions.slice();
  const from = new Date(startOfDay(now));
  from.setDate(from.getDate() - (days - 1));
  return sessions.filter((s) => s.startedAt >= from.getTime());
}

export const QUICK_EXIT_MS = 5000;

export function summarize(sessions) {
  const times = sessions.map((s) => s.activeMs).sort((a, b) => a - b);
  const count = times.length;
  const totalMs = times.reduce((a, b) => a + b, 0);
  let medianMs = 0;
  if (count) {
    const mid = Math.floor(count / 2);
    medianMs = count % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
  }
  return {
    count,
    totalMs,
    avgMs: count ? totalMs / count : 0,
    medianMs,
    maxMs: count ? times[count - 1] : 0,
    quickExits: times.filter((t) => t < QUICK_EXIT_MS).length,
  };
}

export function byPlatform(sessions) {
  const map = new Map();
  for (const s of sessions) {
    const row = map.get(s.platform) ?? { platform: s.platform, count: 0, totalMs: 0 };
    row.count += 1;
    row.totalMs += s.activeMs;
    map.set(s.platform, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, avgMs: r.totalMs / r.count }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

export const BUCKETS = [
  { label: '< 3 秒', maxMs: 3_000 },
  { label: '3–10 秒', maxMs: 10_000 },
  { label: '10–30 秒', maxMs: 30_000 },
  { label: '30 秒–1 分', maxMs: 60_000 },
  { label: '1–3 分', maxMs: 180_000 },
  { label: '> 3 分', maxMs: Infinity },
];

export function bucketize(sessions) {
  const counts = BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const s of sessions) {
    const i = BUCKETS.findIndex((b) => s.activeMs < b.maxMs);
    counts[i].count += 1;
  }
  return counts;
}

/** One bin per hour of today (days === 1) or per calendar day otherwise. */
export function timeBins(sessions, days, now) {
  if (days === 1) {
    const base = startOfDay(now);
    const bins = Array.from({ length: 24 }, (_, h) => ({ label: `${h}`, count: 0, totalMs: 0 }));
    for (const s of sessions) {
      const h = Math.floor((s.startedAt - base) / 3_600_000);
      if (h >= 0 && h < 24) {
        bins[h].count += 1;
        bins[h].totalMs += s.activeMs;
      }
    }
    return bins;
  }
  let span = days;
  if (!Number.isFinite(span)) {
    const first = sessions.reduce((m, s) => Math.min(m, s.startedAt), now);
    span = Math.min(90, Math.round((startOfDay(now) - startOfDay(first)) / 86_400_000) + 1);
  }
  const bins = [];
  const index = new Map();
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(startOfDay(now));
    d.setDate(d.getDate() - i);
    const key = dayKey(d.getTime());
    index.set(key, bins.length);
    bins.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count: 0, totalMs: 0 });
  }
  for (const s of sessions) {
    const i = index.get(dayKey(s.startedAt));
    if (i !== undefined) {
      bins[i].count += 1;
      bins[i].totalMs += s.activeMs;
    }
  }
  return bins;
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(sessions) {
  const header = ['platform', 'kind', 'post_id', 'url', 'opened_at', 'closed_at', 'active_seconds', 'open_seconds'];
  const rows = sessions.map((s) => [
    s.platform,
    s.kind,
    s.postId,
    s.url,
    new Date(s.startedAt).toISOString(),
    new Date(s.endedAt).toISOString(),
    (s.activeMs / 1000).toFixed(1),
    (s.durationMs / 1000).toFixed(1),
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}
