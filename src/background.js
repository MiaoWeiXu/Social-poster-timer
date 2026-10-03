// Service worker: turns browser tab/focus/idle events into post sessions.
//
// No content script is injected. Instagram & co. are single-page apps, but
// chrome.tabs.onUpdated still fires on their history.pushState URL changes,
// which is all we need to see "opened a post" / "left the post".
//
// MV3 workers get suspended at any time, so state lives in storage.local and
// every event is processed through one serial queue (load → reduce → save).

import { matchPost } from './platforms.js';
import { createState, navigate, closeTab, setAttended, finishAll } from './tracker.js';
import { appendSessions, getTrackerState, setTrackerState } from './storage.js';

// Seconds without keyboard/mouse input before we stop counting attention.
// Generous on purpose: watching a reel involves no input.
const IDLE_SECONDS = 120;
const HEARTBEAT = 'heartbeat';

chrome.idle.setDetectionInterval(IDLE_SECONDS);

let queue = Promise.resolve();

/** Run `reducer(state, now)` serially; it returns { state, finished }. */
function apply(reducer) {
  const now = Date.now();
  queue = queue
    .then(async () => {
      const state = (await getTrackerState()) ?? createState();
      const { state: next, finished } = await reducer(state, now);
      await setTrackerState(next);
      await appendSessions(finished);
    })
    .catch((err) => console.error('[post-timer]', err));
  return queue;
}

function chain(...steps) {
  return async (state, now) => {
    let current = state;
    const finished = [];
    for (const step of steps) {
      const out = await step(current, now);
      current = out.state;
      finished.push(...out.finished);
    }
    return { state: current, finished };
  };
}

async function attendedTabId() {
  try {
    const win = await chrome.windows.getLastFocused();
    if (!win?.focused) return null;
    if ((await chrome.idle.queryState(IDLE_SECONDS)) !== 'active') return null;
    const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    return tab?.id ?? null;
  } catch {
    return null;
  }
}

const refreshAttention = async (state, now) => setAttended(state, await attendedTabId(), now);

// `tab.url` is only visible to us on sites in host_permissions; anywhere else
// it is undefined, which matchPost() treats as "not a post" → session ends.
const visit = (tabId, url) => (state, now) => navigate(state, tabId, matchPost(url), now);

async function rebuildFromOpenTabs(state, now) {
  let current = state;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id != null) current = visit(tab.id, tab.url)(current, now).state;
  }
  return { state: current, finished: [] };
}

// Close whatever was open before; `endAt` picks the timestamp to close it at.
const restart = (endAt) =>
  chain(
    (state, now) => finishAll(state, endAt(state, now)),
    rebuildFromOpenTabs,
    refreshAttention,
  );

// Browser was restarted: last heartbeat is our best guess of when it closed.
chrome.runtime.onStartup.addListener(() => {
  apply(restart((state, now) => (state.updatedAt > 0 ? Math.min(state.updatedAt, now) : now)));
});

// Install / update / reload during development: the browser kept running.
chrome.runtime.onInstalled.addListener(() => {
  apply(restart((_state, now) => now));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Ignore title/favicon/audio churn; URL changes and loads are what matter.
  if (!('url' in changeInfo) && !('status' in changeInfo)) return;
  apply(chain(visit(tabId, tab.url), refreshAttention));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  apply(chain((state, now) => closeTab(state, tabId, now), refreshAttention));
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  apply(
    chain(
      (state, now) => closeTab(state, removedTabId, now),
      async (state, now) => {
        const tab = await chrome.tabs.get(addedTabId).catch(() => null);
        return visit(addedTabId, tab?.url)(state, now);
      },
      refreshAttention,
    ),
  );
});

chrome.tabs.onActivated.addListener(() => apply(refreshAttention));
chrome.windows.onFocusChanged.addListener(() => apply(refreshAttention));
chrome.idle.onStateChanged.addListener(() => apply(refreshAttention));

// Keeps updatedAt fresh so a browser crash loses at most ~30 s of a session.
chrome.alarms.get(HEARTBEAT).then((existing) => {
  if (!existing) chrome.alarms.create(HEARTBEAT, { periodInMinutes: 0.5 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT) apply(refreshAttention);
});
