#!/usr/bin/env node
// Drives the nexus-web dashboard against a live nexus-service instance and
// reports a small set of render/memory metrics over a fixed window.
// Used to compare before/after a React perf change.
//
// Usage:
//   node scripts/bench-dashboard.mjs --target http://192.168.1.110:9400 --duration 60 --runs 3 --label baseline
//
// Output is appended to scripts/bench-results.jsonl so multiple runs
// can be diffed.

import { chromium } from 'playwright';
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = join(__dirname, 'bench-results.jsonl');
mkdirSync(dirname(RESULTS_PATH), { recursive: true });

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { target: 'http://192.168.1.110:9400', duration: 60, runs: 3, label: 'run', headless: true, viewport: { width: 1440, height: 900 } };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--target') out.target = args[++i];
    else if (a === '--duration') out.duration = Number(args[++i]);
    else if (a === '--runs') out.runs = Number(args[++i]);
    else if (a === '--label') out.label = args[++i];
    else if (a === '--headed') out.headless = false;
    else if (a === '--path') out.path = args[++i];
  }
  return out;
}

const cfg = parseArgs();

// In-page instrumentation: tracks frame timing + long tasks during the window.
const INIT_SCRIPT = `
  (() => {
    const state = {
      frames: [],
      longTasks: [],
      starting: performance.now(),
    };
    let last = performance.now();
    function frame(now) {
      state.frames.push(now - last);
      last = now;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.longTasks.push({ duration: entry.duration, startTime: entry.startTime });
      });
      obs.observe({ type: 'longtask', buffered: true });
    } catch (_) { /* unsupported */ }
    window.__bench = state;
    window.__benchReset = () => {
      state.frames.length = 0;
      state.longTasks.length = 0;
      state.starting = performance.now();
      last = performance.now();
    };
  })();
`;

function summarizeFrames(frames) {
  if (frames.length === 0) return { count: 0 };
  const sorted = [...frames].sort((a, b) => a - b);
  const sum = frames.reduce((s, x) => s + x, 0);
  const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return {
    count: frames.length,
    avgMs: +(sum / frames.length).toFixed(3),
    p50Ms: +p(0.5).toFixed(3),
    p95Ms: +p(0.95).toFixed(3),
    p99Ms: +p(0.99).toFixed(3),
    maxMs: +sorted[sorted.length - 1].toFixed(3),
    jankFrames16: frames.filter(f => f > 16.7).length,
    jankFrames33: frames.filter(f => f > 33.3).length,
  };
}

function summarizeLongTasks(tasks) {
  if (tasks.length === 0) return { count: 0, totalMs: 0, maxMs: 0 };
  const total = tasks.reduce((s, t) => s + t.duration, 0);
  const max = tasks.reduce((m, t) => Math.max(m, t.duration), 0);
  return { count: tasks.length, totalMs: +total.toFixed(2), maxMs: +max.toFixed(2) };
}

function diffPerfMetrics(start, end) {
  const map = (arr) => Object.fromEntries(arr.map(m => [m.name, m.value]));
  const a = map(start);
  const b = map(end);
  const keys = [
    'JSHeapUsedSize', 'JSHeapTotalSize',
    'Nodes', 'Documents', 'Frames',
    'LayoutCount', 'RecalcStyleCount',
    'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration',
  ];
  const out = {};
  for (const k of keys) {
    out[k] = { start: a[k], end: b[k], delta: (b[k] ?? 0) - (a[k] ?? 0) };
  }
  return out;
}

async function runOnce(runIdx) {
  const browser = await chromium.launch({
    headless: cfg.headless,
    args: [
      // Keep the renderer foregrounded so RAF runs at full rate and React doesn't
      // get demoted into a low-priority isolate.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      // Otherwise headless Chrome reports the page as not visible.
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  // Anything that throws between here and the matching close() must still
  // release the browser handle, or we leak a chromium process per failure.
  try {
    const context = await browser.newContext({ viewport: cfg.viewport });
    await context.addInitScript(INIT_SCRIPT);
    const page = await context.newPage();

    // Stub out the service worker so a cached old build can't serve stale assets
    // to the benchmark. Mirrors the e2e pattern in panel-drag.spec.ts.
    await context.addInitScript(() => {
      if ('serviceWorker' in navigator) {
        try {
          Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get: () => undefined });
        } catch (_) { /* ignore */ }
      }
    });
    page.on('pageerror', (err) => console.warn('  [pageerror]', err.message));
    page.on('console', (msg) => { if (msg.type() === 'error') console.warn('  [console.error]', msg.text()); });

    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');

    // Force the page to report visible so RAFs run at full rate even in headless.
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

    const navStart = Date.now();
    // Land directly on the monitoring overview where sensor charts/sparklines are dense.
    const targetUrl = cfg.path ? cfg.target + cfg.path : cfg.target + '/my-computer/monitoring/overview';
    await page.goto(targetUrl, { waitUntil: 'commit', timeout: 30_000 });
    await page.waitForSelector('body', { timeout: 10_000 }).catch(() => {});
    try {
      await page.waitForSelector('#root > div', { timeout: 20_000 });
    } catch (_) { /* continue anyway */ }
    // Warm-up window: 10s to let websocket connect and sensors start streaming.
    await page.waitForTimeout(10_000);
    // Reset in-page counters so warm-up doesn't pollute.
    await page.evaluate(() => window.__benchReset && window.__benchReset());
    const startMetrics = (await cdp.send('Performance.getMetrics')).metrics;
    const startedAt = Date.now();

    // The measurement window.
    await page.waitForTimeout(cfg.duration * 1000);

    const endMetrics = (await cdp.send('Performance.getMetrics')).metrics;
    const inPage = await page.evaluate(() => ({
      frames: window.__bench?.frames ?? [],
      longTasks: window.__bench?.longTasks ?? [],
      endedAt: performance.now(),
      started: window.__bench?.starting ?? 0,
    }));

    const url = page.url();

    // Hoist the body of the original post-close result builder back here so
    // it runs *before* we release the browser.
    return buildResult({ runIdx, navStart, startedAt, startMetrics, endMetrics, inPage, url });
  } finally {
    await browser.close().catch(() => { /* best-effort */ });
  }
}

function buildResult({ runIdx, navStart, startedAt, startMetrics, endMetrics, inPage, url }) {
  const wallSeconds = (Date.now() - startedAt) / 1000;
  const perf = diffPerfMetrics(startMetrics, endMetrics);
  const result = {
    runIdx,
    label: cfg.label,
    target: cfg.target,
    url,
    timestamp: new Date().toISOString(),
    bootMs: startedAt - navStart,
    wallSeconds,
    frames: summarizeFrames(inPage.frames),
    longTasks: summarizeLongTasks(inPage.longTasks),
    heapMB: {
      startMB: +(perf.JSHeapUsedSize.start / 1024 / 1024).toFixed(2),
      endMB: +(perf.JSHeapUsedSize.end / 1024 / 1024).toFixed(2),
      deltaMB: +(perf.JSHeapUsedSize.delta / 1024 / 1024).toFixed(2),
    },
    nodes: perf.Nodes,
    layoutCount: perf.LayoutCount.delta,
    recalcStyleCount: perf.RecalcStyleCount.delta,
    layoutMs: +(perf.LayoutDuration.delta * 1000).toFixed(2),
    recalcStyleMs: +(perf.RecalcStyleDuration.delta * 1000).toFixed(2),
    scriptMs: +(perf.ScriptDuration.delta * 1000).toFixed(2),
    taskMs: +(perf.TaskDuration.delta * 1000).toFixed(2),
  };
  return result;
}

(async () => {
  console.log(`\nBench → ${cfg.target}  duration=${cfg.duration}s  runs=${cfg.runs}  label=${cfg.label}`);
  const all = [];
  for (let i = 0; i < cfg.runs; i++) {
    console.log(`\n--- run ${i + 1}/${cfg.runs} ---`);
    const r = await runOnce(i + 1);
    appendFileSync(RESULTS_PATH, JSON.stringify(r) + '\n');
    all.push(r);
    console.log(`  frames=${r.frames.count} avg=${r.frames.avgMs}ms p95=${r.frames.p95Ms}ms p99=${r.frames.p99Ms}ms jank16=${r.frames.jankFrames16} jank33=${r.frames.jankFrames33}`);
    console.log(`  longTasks count=${r.longTasks.count} totalMs=${r.longTasks.totalMs} maxMs=${r.longTasks.maxMs}`);
    console.log(`  heap start=${r.heapMB.startMB}MB end=${r.heapMB.endMB}MB Δ=${r.heapMB.deltaMB}MB`);
    console.log(`  layouts=${r.layoutCount} recalcStyles=${r.recalcStyleCount} scriptMs=${r.scriptMs} taskMs=${r.taskMs}`);
  }

  // Aggregate across runs (median of medians-ish: average of per-run values).
  const avg = (sel) => +(all.reduce((s, r) => s + sel(r), 0) / all.length).toFixed(3);
  const summary = {
    label: cfg.label,
    target: cfg.target,
    runs: all.length,
    durationS: cfg.duration,
    avgFrameMs: avg(r => r.frames.avgMs),
    p95FrameMs: avg(r => r.frames.p95Ms),
    p99FrameMs: avg(r => r.frames.p99Ms),
    jank16PerRun: avg(r => r.frames.jankFrames16),
    jank33PerRun: avg(r => r.frames.jankFrames33),
    longTaskTotalMs: avg(r => r.longTasks.totalMs),
    longTaskMaxMs: avg(r => r.longTasks.maxMs),
    heapDeltaMB: avg(r => r.heapMB.deltaMB),
    heapEndMB: avg(r => r.heapMB.endMB),
    layoutCount: avg(r => r.layoutCount),
    recalcStyleCount: avg(r => r.recalcStyleCount),
    scriptMs: avg(r => r.scriptMs),
    taskMs: avg(r => r.taskMs),
  };
  console.log('\n=== Aggregated ===');
  console.log(JSON.stringify(summary, null, 2));
  writeFileSync(join(__dirname, `bench-summary-${cfg.label}.json`), JSON.stringify(summary, null, 2));
})().catch(err => { console.error(err); process.exit(1); });
