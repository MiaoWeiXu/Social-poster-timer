import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPost } from '../src/platforms.js';

const key = (url) => matchPost(url)?.key ?? null;

test('instagram posts, reels, stories', () => {
  assert.equal(key('https://www.instagram.com/p/C1a2B3c4D5e/'), 'instagram:C1a2B3c4D5e');
  assert.equal(key('https://www.instagram.com/p/C1a2B3c4D5e/?img_index=2'), 'instagram:C1a2B3c4D5e');
  assert.equal(key('https://www.instagram.com/some.user/p/C1a2B3c4D5e/'), 'instagram:C1a2B3c4D5e');
  assert.equal(key('https://www.instagram.com/reel/DAbc_-123/'), 'instagram:DAbc_-123');
  assert.equal(key('https://www.instagram.com/reels/DAbc_-123/'), 'instagram:DAbc_-123');
  assert.equal(key('https://instagram.com/stories/some.user/3456789012345/'), 'instagram:some.user/3456789012345');
  assert.equal(matchPost('https://www.instagram.com/reel/DAbc/').kind, 'reel');
  assert.equal(matchPost('https://www.instagram.com/p/X1/').url, 'https://www.instagram.com/p/X1/');
});

test('instagram non-post pages', () => {
  for (const url of [
    'https://www.instagram.com/',
    'https://www.instagram.com/explore/',
    'https://www.instagram.com/reels/',
    'https://www.instagram.com/some.user/',
    'https://www.instagram.com/direct/inbox/',
    'https://www.instagram.com/stories/some.user/',
  ]) {
    assert.equal(matchPost(url), null, url);
  }
});

test('other platforms', () => {
  assert.equal(key('https://x.com/jack/status/20'), 'x:20');
  assert.equal(key('https://twitter.com/jack/status/20/photo/1'), 'x:20');
  assert.equal(key('https://mobile.twitter.com/jack/status/20'), 'x:20');
  assert.equal(key('https://www.reddit.com/r/pics/comments/abc123/some_title/'), 'reddit:abc123');
  assert.equal(key('https://old.reddit.com/r/pics/comments/abc123/'), 'reddit:abc123');
  assert.equal(key('https://www.tiktok.com/@some.user/video/7234567890123456789'), 'tiktok:7234567890123456789');
  assert.equal(
    matchPost('https://www.tiktok.com/@some.user/video/7234567890123456789?lang=en').url,
    'https://www.tiktok.com/@some.user/video/7234567890123456789',
  );
  assert.equal(key('https://www.xiaohongshu.com/explore/64a1b2c3d4e5f60718293a4b'), 'xiaohongshu:64a1b2c3d4e5f60718293a4b');
  assert.equal(key('https://www.xiaohongshu.com/discovery/item/64a1b2c3d4e5f60718293a4b?xsec=1'), 'xiaohongshu:64a1b2c3d4e5f60718293a4b');
  assert.equal(key('https://x.com/home'), null);
  assert.equal(key('https://www.reddit.com/r/pics/'), null);
  assert.equal(key('https://www.xiaohongshu.com/explore'), null);
});

test('unsupported and bad input', () => {
  assert.equal(matchPost(undefined), null);
  assert.equal(matchPost(''), null);
  assert.equal(matchPost('not a url'), null);
  assert.equal(matchPost('https://evilinstagram.com/p/abc/'), null);
  assert.equal(matchPost('https://instagram.com.evil.com/p/abc/'), null);
  assert.equal(matchPost('chrome://extensions'), null);
});
