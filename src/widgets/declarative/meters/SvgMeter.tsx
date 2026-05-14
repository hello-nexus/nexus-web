// SVG meter: inlines a sanitized SVG asset and applies declarative
// attribute/transform bindings. The author ships their static SVG
// (analog-clock face, lighting glyph, gauge tick marks) and the manifest
// describes which elements to rewrite at render time.
//
// Manifest shape:
//   { "type": "svg", "src": "designs/analog-face.svg",
//     "viewBox": "0 0 100 100",
//     "bindings": [
//       { "selector": ".hour-hand",   "attr": "transform",
//         "value": "rotate({data.now.hourAngle} 50 50)" },
//       { "selector": ".second-hand", "attr": "transform",
//         "value": "rotate({data.now.secondAngle} 50 50)" },
//       { "selector": ".ring", "attr": "stroke", "value": "{settings.color}" }
//     ] }
//
// Security model: the host already sanitises SVGs on serve (drops
// <script>, on* handlers, foreignObject). Here we additionally restrict
// the attribute names a binding may write to a safe-by-construction set
// to prevent post-load injection (e.g. binding a `style` attribute to a
// CSS expression that smuggles a `url(javascript:...)` payload).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { WidgetView } from '../../types';
import { bind, type RenderContext } from '../renderer';

interface SvgBinding {
  selector: string;
  attr: string;
  value: unknown;
}

// Attribute allowlist: only these may be written by a binding. Anything
// else (style, src, href, on*) is rejected to prevent post-sanitize
// injection through the rewrite path.
const ALLOWED_ATTRS = new Set([
  'transform', 'fill', 'stroke', 'stroke-width', 'opacity',
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'width', 'height', 'd', 'points', 'offset', 'stop-color', 'stop-opacity',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
  'visibility', 'class',
]);

export function SvgMeter({ view, ctx }: { view: WidgetView; ctx: RenderContext }) {
  const src = String(bind(view.src, ctx, '') ?? '');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bindings = (view.bindings as SvgBinding[] | undefined) ?? [];

  // Resolve the asset URL. Same convention as ImageMeter.
  const resolvedSrc = useMemo(() => resolveAssetUrl(src, ctx.widgetId), [src, ctx.widgetId]);

  // Fetch + inline the SVG once per src so we can manipulate its DOM.
  // Cached at the module level keyed by URL.
  const svgPromise = useMemo(() => loadSvg(resolvedSrc), [resolvedSrc]);

  // Counter bumped when the async SVG markup actually lands in the DOM.
  // Bindings effect uses it as a dep so the first round of attribute writes
  // happens after the SVG is mounted — without this, the initial render
  // (which has no SVG yet) silently no-ops, and if the parent data is
  // static (e.g. snapshot harness) the bindings never apply.
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    svgPromise.then((markup) => {
      if (cancelled || !containerRef.current) return;
      containerRef.current.innerHTML = markup;
      const svgEl = containerRef.current.querySelector('svg');
      if (!svgEl) return;
      // Stretch to the meter container.
      svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      (svgEl as SVGElement & { style: CSSStyleDeclaration }).style.width = '100%';
      (svgEl as SVGElement & { style: CSSStyleDeclaration }).style.height = '100%';
      (svgEl as SVGElement & { style: CSSStyleDeclaration }).style.display = 'block';
      setLoadCount((n) => n + 1);
    }).catch(() => { /* asset load failed — leave container empty */ });
    return () => { cancelled = true; };
  }, [svgPromise]);

  // Re-apply bindings whenever the load lands OR a render fires (data tick).
  useEffect(() => {
    const root = containerRef.current?.querySelector('svg');
    if (!root) return;
    for (const b of bindings) {
      if (typeof b?.selector !== 'string' || typeof b?.attr !== 'string') continue;
      const attr = b.attr.toLowerCase();
      if (!ALLOWED_ATTRS.has(attr)) continue;
      const targets = root.querySelectorAll(b.selector);
      const value = bind(b.value, ctx);
      const str = value == null ? '' : String(value);
      targets.forEach((el) => {
        if (str === '') el.removeAttribute(attr);
        else el.setAttribute(attr, str);
      });
    }
  }); // no dep array - runs on every render
  // ensure the post-load run fires even when the parent doesn't re-render
  // (e.g. static data sources in a snapshot harness).
  void loadCount;

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 0, minHeight: 0,
      }}
    />
  );
}

function resolveAssetUrl(src: string, widgetId: string): string {
  if (/^(https?:|data:|blob:|\/)/.test(src)) return src;
  return `/widgets-api/installed/${encodeURIComponent(widgetId)}/asset/${src}`;
}

// Module-level cache so multiple widgets / instances don't re-fetch.
const svgCache = new Map<string, Promise<string>>();

function loadSvg(url: string): Promise<string> {
  if (!url) return Promise.resolve('');
  const existing = svgCache.get(url);
  if (existing) return existing;
  const promise = fetch(url, { credentials: 'same-origin' })
    .then((res) => (res.ok ? res.text() : ''))
    .then((text) => sanitizeSvg(text));
  svgCache.set(url, promise);
  return promise;
}

// Defense-in-depth: the host already sanitises on serve, but inlining is
// risky enough that we re-check on the client. Strip <script>, on* event
// handlers, foreignObject, and unknown protocols on href/xlink:href.
//
// This is intentionally conservative; we reject anything not on a small
// allowed-elements list. Authors that need more should stay in their lane
// (use the meter palette) or push for an explicit primitive.
function sanitizeSvg(raw: string): string {
  if (!raw) return '';
  // Use DOMParser to walk the tree. Workers don't have it but this code
  // runs in the page context (main thread renderer).
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
  } catch {
    return '';
  }
  if (doc.querySelector('parsererror')) return '';
  const svg = doc.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== 'svg') return '';
  sanitizeNode(svg);
  return new XMLSerializer().serializeToString(svg);
}

const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'title', 'desc',
  'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
  'text', 'tspan',
  'linearGradient', 'radialGradient', 'stop',
  'clippath', 'clipPath', 'mask', 'pattern', 'use', 'symbol',
  'filter', 'feGaussianBlur', 'feColorMatrix', 'feOffset', 'feMerge',
  'feMergeNode', 'feComposite', 'feFlood', 'feBlend',
]);

function sanitizeNode(node: Element): void {
  const tag = node.tagName.toLowerCase();
  if (!ALLOWED_ELEMENTS.has(tag)) {
    node.remove();
    return;
  }
  // Strip event handlers + risky attrs. Walk attributes via a copy because
  // removing during iteration mutates the live list.
  for (const attr of Array.from(node.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on')) {
      node.removeAttribute(attr.name);
      continue;
    }
    if (name === 'href' || name === 'xlink:href') {
      const v = attr.value.trim().toLowerCase();
      if (v.startsWith('javascript:') || v.startsWith('data:') && !v.startsWith('data:image/')) {
        node.removeAttribute(attr.name);
      }
      continue;
    }
    if (name === 'style') {
      // CSS in style attributes can carry url(javascript:...) — drop.
      if (/javascript:|expression\(|url\(/i.test(attr.value)) {
        node.removeAttribute(attr.name);
      }
    }
  }
  // Recurse into children. Note: getting children before recursion because
  // we may remove nodes mid-iteration.
  for (const child of Array.from(node.children)) {
    sanitizeNode(child);
  }
}
