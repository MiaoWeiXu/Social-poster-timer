// Pure session state machine. Every function takes the old state plus a
// timestamp and returns { state, finished } without mutating its input,
// so the background worker can persist state between service-worker restarts.
//
// Two clocks per session:
//   durationMs – wall time from opening the post to leaving it
//   activeMs   – time the post tab was actually in front of you
//                (active tab, browser window focused, not idle/locked)

// Sessions with less attention than this are swipe-pasts / background tabs.
export const MIN_ACTIVE_MS = 1000;

export function createState() {
  return { open: {}, attendedTabId: null, updatedAt: 0 };
}

function pause(session, now) {
  if (session.activeSince == null) return session;
  return {
    ...session,
    activeMs: session.activeMs + Math.max(0, now - session.activeSince),
    activeSince: null,
  };
}

function resume(session, now) {
  return session.activeSince == null ? { ...session, activeSince: now } : session;
}

export function liveActiveMs(session, now) {
  return session.activeMs + (session.activeSince == null ? 0 : Math.max(0, now - session.activeSince));
}

function finalize(session, now) {
  const { activeMs } = pause(session, now);
  return {
    id: `${session.startedAt}-${session.key}`,
    platform: session.platform,
    kind: session.kind,
    postId: session.postId,
    url: session.url,
    startedAt: session.startedAt,
    endedAt: now,
    durationMs: Math.max(0, now - session.startedAt),
    activeMs,
  };
}

function keep(record) {
  return record.activeMs >= MIN_ACTIVE_MS;
}

/** The tab now shows `post` (a matchPost() result) or a non-post page (null). */
export function navigate(state, tabId, post, now) {
  const slot = String(tabId);
  const current = state.open[slot];
  if (current && post && current.key === post.key) {
    return { state: { ...state, updatedAt: now }, finished: [] };
  }

  const open = { ...state.open };
  const finished = [];
  if (current) {
    delete open[slot];
    const record = finalize(current, now);
    if (keep(record)) finished.push(record);
  }
  if (post) {
    open[slot] = {
      ...post,
      tabId,
      startedAt: now,
      activeMs: 0,
      activeSince: state.attendedTabId === tabId ? now : null,
    };
  }
  return { state: { ...state, open, updatedAt: now }, finished };
}

export function closeTab(state, tabId, now) {
  const next = navigate(state, tabId, null, now);
  if (next.state.attendedTabId === tabId) next.state.attendedTabId = null;
  return next;
}

/** `tabId` is the tab the user is looking at right now, or null if none. */
export function setAttended(state, tabId, now) {
  if (state.attendedTabId === tabId) {
    return { state: { ...state, updatedAt: now }, finished: [] };
  }
  const open = { ...state.open };
  const prev = state.attendedTabId == null ? null : String(state.attendedTabId);
  if (prev && open[prev]) open[prev] = pause(open[prev], now);
  const nextSlot = tabId == null ? null : String(tabId);
  if (nextSlot && open[nextSlot]) open[nextSlot] = resume(open[nextSlot], now);
  return { state: { ...state, open, attendedTabId: tabId, updatedAt: now }, finished: [] };
}

/** Close every open session (browser restart / extension reload). */
export function finishAll(state, now) {
  const finished = Object.values(state.open)
    .map((s) => finalize(s, now))
    .filter(keep);
  return { state: { ...createState(), updatedAt: now }, finished };
}
