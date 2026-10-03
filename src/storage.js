// chrome.storage.local wrapper. Everything stays on this device.

const SESSIONS = 'sessions';
const TRACKER = 'trackerState';
// ~250 bytes each → well under the 10 MB storage.local quota.
const MAX_SESSIONS = 20_000;

export async function getSessions() {
  const { [SESSIONS]: sessions = [] } = await chrome.storage.local.get(SESSIONS);
  return sessions;
}

export async function appendSessions(records) {
  if (!records.length) return;
  const sessions = (await getSessions()).concat(records);
  if (sessions.length > MAX_SESSIONS) sessions.splice(0, sessions.length - MAX_SESSIONS);
  await chrome.storage.local.set({ [SESSIONS]: sessions });
}

export async function clearSessions() {
  await chrome.storage.local.set({ [SESSIONS]: [] });
}

export async function getTrackerState() {
  const { [TRACKER]: state = null } = await chrome.storage.local.get(TRACKER);
  return state;
}

export async function setTrackerState(state) {
  await chrome.storage.local.set({ [TRACKER]: state });
}

export const STORAGE_KEYS = { SESSIONS, TRACKER };
