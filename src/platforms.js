// Decides whether a URL is "inside a single post" and, if so, which one.
// Pure module: no chrome.* APIs, so it can be unit-tested in Node.

export const PLATFORMS = {
  instagram: { name: 'Instagram', color: '#d62976' },
  x: { name: 'X / Twitter', color: '#1d9bf0' },
  reddit: { name: 'Reddit', color: '#ff4500' },
  tiktok: { name: 'TikTok', color: '#25c2c2' },
  xiaohongshu: { name: '小红书', color: '#ff2442' },
};

export const KIND_LABELS = {
  post: '帖子',
  reel: 'Reel',
  story: '快拍',
  tweet: '推文',
  thread: '帖子',
  video: '视频',
  note: '笔记',
};

// Each rule: which hosts it applies to, and path regexes that capture the post id.
// `id` capture group is the stable post identifier; extra path segments
// (e.g. /photo/1, ?img_index=2) stay within the same post.
const RULES = [
  {
    platform: 'instagram',
    hosts: ['instagram.com'],
    patterns: [
      { kind: 'post', re: /^\/(?:[\w.]+\/)?p\/([\w-]+)/ },
      { kind: 'reel', re: /^\/(?:[\w.]+\/)?(?:reels?|tv)\/([\w-]+)/ },
      { kind: 'story', re: /^\/stories\/([\w.]+\/\d+)/ },
    ],
    canonical: (kind, id) =>
      kind === 'story'
        ? `https://www.instagram.com/stories/${id}/`
        : `https://www.instagram.com/${kind === 'reel' ? 'reel' : 'p'}/${id}/`,
  },
  {
    platform: 'x',
    hosts: ['x.com', 'twitter.com'],
    patterns: [{ kind: 'tweet', re: /^\/[\w]+\/status\/(\d+)/ }],
    canonical: (_kind, id) => `https://x.com/i/status/${id}`,
  },
  {
    platform: 'reddit',
    hosts: ['reddit.com'],
    patterns: [{ kind: 'thread', re: /^\/r\/[\w]+\/comments\/([a-z0-9]+)/i }],
    canonical: (_kind, id) => `https://www.reddit.com/comments/${id}/`,
  },
  {
    platform: 'tiktok',
    hosts: ['tiktok.com'],
    // No author-free canonical URL exists, so the link keeps the page's own path.
    patterns: [{ kind: 'video', re: /^\/@[\w.-]+\/(?:video|photo)\/(\d+)/ }],
  },
  {
    platform: 'xiaohongshu',
    hosts: ['xiaohongshu.com'],
    patterns: [
      { kind: 'note', re: /^\/(?:explore|discovery\/item)\/([0-9a-f]{24})/i },
      { kind: 'note', re: /^\/user\/profile\/[0-9a-f]{24}\/([0-9a-f]{24})/i },
    ],
    canonical: (_kind, id) => `https://www.xiaohongshu.com/explore/${id}`,
  },
];

function hostMatches(hostname, host) {
  return hostname === host || hostname.endsWith(`.${host}`);
}

/**
 * @param {string | undefined | null} rawUrl
 * @returns {null | { key: string, platform: string, kind: string, postId: string, url: string }}
 */
export function matchPost(rawUrl) {
  if (!rawUrl) return null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const hostname = url.hostname.toLowerCase();

  for (const rule of RULES) {
    if (!rule.hosts.some((h) => hostMatches(hostname, h))) continue;
    for (const { kind, re } of rule.patterns) {
      const m = url.pathname.match(re);
      if (m) {
        const postId = m[1];
        return {
          key: `${rule.platform}:${postId}`,
          platform: rule.platform,
          kind,
          postId,
          url: rule.canonical ? rule.canonical(kind, postId) : `${url.origin}${m[0]}`,
        };
      }
    }
    return null;
  }
  return null;
}
