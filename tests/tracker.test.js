import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, navigate, closeTab, setAttended, finishAll, liveActiveMs } from '../src/tracker.js';
import { matchPost } from '../src/platforms.js';

const POST_A = matchPost('https://www.instagram.com/p/AAA/');
const POST_B = matchPost('https://www.instagram.com/reel/BBB/');
const POST_A_SLIDE2 = matchPost('https://www.instagram.com/p/AAA/?img_index=2');

// Run a sequence of steps, collecting finished sessions.
function run(steps) {
  let state = createState();
  const finished = [];
  for (const step of steps) {
    const out = step(state);
    state = out.state;
    finished.push(...out.finished);
  }
  return { state, finished };
}

test('open a post in the focused tab, then leave', () => {
  const { finished, state } = run([
    (s) => setAttended(s, 1, 0),
    (s) => navigate(s, 1, POST_A, 1_000),
    (s) => navigate(s, 1, null, 13_000),
  ]);
  assert.equal(finished.length, 1);
  assert.equal(finished[0].postId, 'AAA');
  assert.equal(finished[0].activeMs, 12_000);
  assert.equal(finished[0].durationMs, 12_000);
  assert.deepEqual(state.open, {});
});

test('navigating within the same post does not split the session', () => {
  const { finished } = run([
    (s) => setAttended(s, 1, 0),
    (s) => navigate(s, 1, POST_A, 0),
    (s) => navigate(s, 1, POST_A_SLIDE2, 4_000),
    (s) => navigate(s, 1, null, 9_000),
  ]);
  assert.equal(finished.length, 1);
  assert.equal(finished[0].activeMs, 9_000);
});

test('going straight from one post to another ends the first', () => {
  const { finished, state } = run([
    (s) => setAttended(s, 1, 0),
    (s) => navigate(s, 1, POST_A, 0),
    (s) => navigate(s, 1, POST_B, 5_000),
  ]);
  assert.equal(finished.length, 1);
  assert.equal(finished[0].postId, 'AAA');
  assert.equal(state.open['1'].postId, 'BBB');
  assert.equal(state.open['1'].activeSince, 5_000);
});

test('switching away pauses attention but not wall time', () => {
  const { finished } = run([
    (s) => setAttended(s, 1, 0),
    (s) => navigate(s, 1, POST_A, 0),
    (s) => setAttended(s, 2, 10_000), // switched to another tab
    (s) => setAttended(s, null, 20_000), // browser lost focus
    (s) => setAttended(s, 1, 60_000), // back to the post
    (s) => navigate(s, 1, null, 65_000),
  ]);
  assert.equal(finished[0].activeMs, 15_000);
  assert.equal(finished[0].durationMs, 65_000);
});

test('post opened in a background tab and closed unseen is dropped', () => {
  const { finished } = run([
    (s) => setAttended(s, 1, 0),
    (s) => navigate(s, 2, POST_A, 0),
    (s) => closeTab(s, 2, 30_000),
  ]);
  assert.equal(finished.length, 0);
});

test('background tab starts counting once you switch to it', () => {
  const { finished } = run([
    (s) => setAttended(s, 1, 0),
    (s) => navigate(s, 2, POST_A, 0),
    (s) => setAttended(s, 2, 30_000),
    (s) => closeTab(s, 2, 37_000),
  ]);
  assert.equal(finished[0].activeMs, 7_000);
  assert.equal(finished[0].durationMs, 37_000);
});

test('sub-second swipe-pasts are dropped', () => {
  const { finished } = run([
    (s) => setAttended(s, 1, 0),
    (s) => navigate(s, 1, POST_A, 0),
    (s) => navigate(s, 1, POST_B, 400),
    (s) => navigate(s, 1, null, 3_400),
  ]);
  assert.deepEqual(finished.map((f) => f.postId), ['BBB']);
});

test('closing the attended tab clears attention', () => {
  const { state } = run([
    (s) => setAttended(s, 1, 0),
    (s) => navigate(s, 1, POST_A, 0),
    (s) => closeTab(s, 1, 5_000),
  ]);
  assert.equal(state.attendedTabId, null);
});

test('finishAll closes every open session', () => {
  const { state } = run([
    (s) => setAttended(s, 1, 0),
    (s) => navigate(s, 1, POST_A, 0),
    (s) => navigate(s, 2, POST_B, 0),
  ]);
  const out = finishAll(state, 8_000);
  assert.deepEqual(out.finished.map((f) => f.postId), ['AAA']); // BBB never seen
  assert.deepEqual(out.state.open, {});
});

test('functions do not mutate their input', () => {
  const s0 = setAttended(createState(), 1, 0).state;
  const s1 = navigate(s0, 1, POST_A, 0).state;
  const snapshot = structuredClone(s1);
  navigate(s1, 1, null, 5_000);
  setAttended(s1, 2, 5_000);
  closeTab(s1, 1, 5_000);
  assert.deepEqual(s1, snapshot);
});

test('liveActiveMs includes the running segment', () => {
  const { state } = run([(s) => setAttended(s, 1, 0), (s) => navigate(s, 1, POST_A, 1_000)]);
  assert.equal(liveActiveMs(state.open['1'], 4_500), 3_500);
});
