// Small DOM helpers shared by the popup and dashboard.

import { PLATFORMS, KIND_LABELS } from './platforms.js';

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') Object.assign(node.style, v);
    else node[k] = v;
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

export function platformChip(platform) {
  const meta = PLATFORMS[platform] ?? { name: platform, color: '#888' };
  return el('span', { class: 'chip', style: { background: meta.color }, textContent: meta.name });
}

export function postLabel(session) {
  const kind = KIND_LABELS[session.kind] ?? session.kind;
  const id = session.postId.length > 14 ? `${session.postId.slice(0, 12)}…` : session.postId;
  return `${kind} ${id}`;
}

export function postLink(session) {
  return el('a', { href: session.url, target: '_blank', rel: 'noopener', title: session.url, textContent: postLabel(session) });
}
