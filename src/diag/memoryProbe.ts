import { postService } from '../api/service';
import { multiplexDiag } from '../hooks/useMultiplexSocket';

// Renderer-side memory/health probe. Samples cheaply on an interval and reports
// to the service log ONLY on a significant change, so a steady-state renderer is
// near-silent while a leak traces its growth curve in a handful of lines.
// performance.memory exposes only the JS heap; a renderer's total working set
// (JS heap + GPU textures + canvas backing) can grow well beyond it, so the
// nexus-overlay host samples working set separately (POSTed to the same
// /diagnostics/client-mem). Comparing the two separates a JS-heap leak from a
// GPU/canvas one.

interface PerfMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

const SAMPLE_MS = 30_000;
const HEARTBEAT_MS = 60 * 60_000; // hourly liveness line even when flat
const HEAP_STEP_MB = 100; // emit when JS heap crosses a 100 MB step
const DOM_STEP = 10_000; // emit when DOM node count crosses a 10k step

export interface MemSample {
  surface: string;
  ageMin: number;
  jsHeapMB: number | null;
  jsHeapLimitMB: number | null;
  domNodes: number;
  reconnects: number;
  transport: string | null;
  connected: boolean;
  topics: number;
  listeners: number;
}

// Decide whether `next` differs from the last EMITTED sample enough to log.
// First sample and the hourly heartbeat always emit; otherwise only a >=100 MB
// heap step (either direction, so a GC reclaim is captured too) or a >=10k
// DOM-node step. Pure so the sparse policy is unit-tested.
export function shouldEmit(prev: MemSample | null, next: MemSample, msSinceEmit: number): boolean {
  if (!prev) return true;
  if (msSinceEmit >= HEARTBEAT_MS) return true;
  const heapStep =
    prev.jsHeapMB !== null &&
    next.jsHeapMB !== null &&
    Math.abs(next.jsHeapMB - prev.jsHeapMB) >= HEAP_STEP_MB;
  const domStep = Math.abs(next.domNodes - prev.domNodes) >= DOM_STEP;
  return heapStep || domStep;
}

function takeSample(startedAt: number): MemSample {
  const mem = (performance as Performance & { memory?: PerfMemory }).memory;
  return {
    surface: window.location.pathname,
    ageMin: Math.round((performance.now() - startedAt) / 60_000),
    jsHeapMB: mem ? Math.round(mem.usedJSHeapSize / 1_048_576) : null,
    jsHeapLimitMB: mem ? Math.round(mem.jsHeapSizeLimit / 1_048_576) : null,
    domNodes: document.getElementsByTagName('*').length,
    reconnects: Math.max(0, multiplexDiag.opens - 1),
    transport: multiplexDiag.transport,
    connected: multiplexDiag.connected,
    topics: multiplexDiag.topics,
    listeners: multiplexDiag.listeners,
  };
}

let started = false;

// Start the probe once. main.tsx gates this on a local origin (the leaking
// surface is always a local WebView2 renderer; the endpoint is loopback-only),
// so phones / the public website never report.
export function initMemoryProbe(): void {
  if (started || typeof performance === 'undefined') return;
  started = true;
  const startedAt = performance.now();
  let lastEmitted: MemSample | null = null;
  let lastEmitAt = 0;

  const emit = (s: MemSample) => {
    lastEmitted = s;
    lastEmitAt = performance.now();
    void postService('/diagnostics/client-mem', s);
  };

  const tick = () => {
    const s = takeSample(startedAt);
    if (shouldEmit(lastEmitted, s, performance.now() - lastEmitAt)) emit(s);
  };

  tick(); // baseline line at load, then sparse on-change sampling
  setInterval(tick, SAMPLE_MS);
}
