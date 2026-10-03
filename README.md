<div align="center">

# Post Dwell Timer

**Measure how long you actually stay on each social media post before leaving.**

A privacy-first Chrome / Edge extension (Manifest V3) for Instagram, X, Reddit, TikTok and Xiaohongshu.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-success)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)

English · [简体中文](README.zh-CN.md)

</div>

<p align="center">
  <img src="docs/dashboard.png" alt="Dashboard: summary cards, daily dwell time chart, exit-speed distribution, per-platform breakdown and session log" width="720">
</p>

## Why

Feeds are built for scrolling, so it's hard to notice your own habits: how many posts you open, how quickly you bail, and which ones actually hold your attention. Post Dwell Timer records a session every time you open a post and leave it, then turns those sessions into simple statistics. Nothing leaves your machine.

## Features

- **Automatic per-post sessions.** Opening a post, reel, story, tweet, thread, video or note starts a session. Navigating away, opening a different post or closing the tab ends it.
- **Attention-aware timing.** Two clocks per session: *dwell* (time the post was actually in front of you) and *open* (wall-clock time from open to exit).
- **Live popup.** Today's totals, median dwell, "left within 5 s" rate and a ticking timer for the post you're on.
- **Dashboard.** Today, 7-day, 30-day and all-time views with an hourly/daily chart, a dwell-time distribution, a per-platform breakdown and a sortable session log.
- **CSV export.** Opens cleanly in Excel, Numbers or pandas.
- **Private by design.** No content scripts, no network requests, no analytics. Data lives in `chrome.storage.local`.

<p align="center">
  <img src="docs/popup.png" alt="Popup showing the post being viewed with a live timer, today's stats and recent sessions" width="300">
</p>

## Supported platforms

| Platform | Tracked pages |
|---|---|
| Instagram | `/p/{id}`, `/reel/{id}`, `/reels/{id}`, `/stories/{user}/{id}`, `/{user}/p/{id}` |
| X / Twitter | `/{user}/status/{id}` (including `/photo/n`) |
| Reddit | `/r/{sub}/comments/{id}` (www and old) |
| TikTok | `/@{user}/video/{id}`, `/@{user}/photo/{id}` |
| Xiaohongshu | `/explore/{id}`, `/discovery/item/{id}`, `/user/profile/{uid}/{id}` |

## Installation

The extension isn't on the Chrome Web Store yet. To load it from source:

1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/social-post-timer.git
   ```
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the cloned folder.
5. Pin the extension, open any Instagram post, then click the toolbar icon.

Requires Chrome or Edge 116 or later.

## How time is measured

| Metric | Definition |
|---|---|
| **Dwell** (primary) | Time while the post's tab is the active tab, the browser window has focus and there was keyboard/mouse input in the last 2 minutes |
| **Open** | Wall-clock time from opening the post until leaving it |

Rules:

- Changing the URL inside the same post (carousel `?img_index=2`, `/photo/1`) does **not** split the session.
- Sessions with less than **1 second** of dwell aren't recorded. These are swipe-pasts in the Reels feed and posts opened in background tabs that you never looked at.
- The 2-minute idle threshold is generous on purpose, because watching a video involves no input.

## Architecture

```
 Browser events                         Pure logic (unit-tested)
 ───────────────                        ────────────────────────
 tabs.onUpdated / onRemoved             platforms.js  URL → { platform, postId } | null
 tabs.onActivated                       tracker.js    session state machine
 windows.onFocusChanged         ──►                   (navigate / setAttended / finishAll)
 idle.onStateChanged                    stats.js      aggregation & formatting
 alarms (30 s heartbeat)
          │
          ▼
 background.js — serial queue: load state → reduce → save state → append finished sessions
          │
          ▼
 chrome.storage.local { trackerState, sessions[] }
          │
          ├──► popup/       today + live timer
          └──► dashboard/   charts, breakdowns, log, CSV export
```

### Design decisions

- **No content scripts.** Instagram and the other sites are single-page apps, but Chrome still fires `tabs.onUpdated` for their `history.pushState` navigations. Watching URLs from the service worker is enough. The extension never touches page DOM, so site redesigns don't break it, and it needs fewer permissions.
- **Survives service-worker suspension.** MV3 workers can be killed at any moment, so all state is persisted to `chrome.storage.local`. Time is computed from timestamps and nothing depends on in-memory timers.
- **Serialized event processing.** Bursts of tab events run through a single promise queue, so read-modify-write cycles never interleave.
- **Crash recovery.** A 30-second heartbeat keeps `updatedAt` fresh. If the browser exits uncleanly, open sessions are closed at the last heartbeat on the next startup, so at most about 30 seconds are lost.
- **Minimal permissions.** The extension asks for `storage`, `idle`, `alarms` and host access to the five supported sites only. It deliberately does **not** request `tabs`, so it can't see URLs on any other site. When you navigate somewhere else the URL becomes invisible to it, and that's treated as leaving the post.

### Project layout

```
├── manifest.json
├── src/
│   ├── background.js   # service worker: event wiring and persistence
│   ├── platforms.js    # URL matchers per platform (pure)
│   ├── tracker.js      # session state machine (pure)
│   ├── stats.js        # aggregation, formatting, CSV (pure)
│   ├── storage.js      # chrome.storage.local wrapper
│   ├── ui.js           # shared DOM helpers
│   └── theme.css       # shared design tokens, light/dark
├── popup/              # toolbar popup
├── dashboard/          # full statistics page (options page)
├── tests/              # node:test unit tests
└── docs/               # screenshots
```

## Development

No build step and no dependencies. Edit the files, then press the reload button on the extension's card in `chrome://extensions`.

```bash
npm test
```

Tests use Node's built-in `node:test` (Node 20+) and cover URL matching, the session state machine (focus changes, background tabs, swipe-pasts, input immutability) and the statistics helpers.

### Adding a platform

1. Add an entry to `PLATFORMS` and a rule to `RULES` in [`src/platforms.js`](src/platforms.js).
2. Add the host to `host_permissions` in [`manifest.json`](manifest.json).
3. Add matcher cases to [`tests/platforms.test.js`](tests/platforms.test.js).

## Privacy

- All data is stored locally in `chrome.storage.local` and never transmitted.
- The extension stores only platform, post ID, canonical post URL and timestamps. It doesn't store post content, captions, usernames you view or anything from the page.
- You can delete everything with **Clear data** on the dashboard, or by removing the extension.

## Limitations

- Desktop browsers only. Usage in the native mobile apps isn't visible.
- Posts you scroll past in the home feed **without opening them** aren't sessions, because the URL never changes.
- If a platform changes its URL scheme, the matcher in `src/platforms.js` needs updating.

## Roadmap

- [ ] Optional nudges, such as a notification after N minutes on a single post
- [ ] Configurable idle threshold and minimum dwell
- [ ] Per-platform enable/disable toggles
- [ ] Chrome Web Store release

## License

[MIT](LICENSE) © MiaoWeiXu
