import { describe, expect, it } from 'vitest';
import { createDisplayDivider, createFramePacer, framePacingQuery, panelDisplayHz, streamFrameCap } from './framePacer';

function drawsOver(pacer: (ts: number) => boolean, tickMs: number, durationMs: number): number[] {
  const drawn: number[] = [];
  const ticks = Math.round(durationMs / tickMs);
  for (let i = 0; i < ticks; i++) { const ts = 1000 + i * tickMs; if (pacer(ts)) drawn.push(ts); }
  return drawn;
}

describe('createFramePacer', () => {
  it('passes every tick without a cap', () => {
    expect(drawsOver(createFramePacer(null), 1000 / 144, 1000)).toHaveLength(144);
  });

  it('holds a 144 Hz loop to the cap', () => {
    const n = drawsOver(createFramePacer(44), 1000 / 144, 10_000).length;
    expect(n).toBeGreaterThanOrEqual(435);
    expect(n).toBeLessThanOrEqual(441);
  });

  it('never leaves more than one tick beyond the cap interval between draws', () => {
    const tick = 1000 / 144;
    const draws = drawsOver(createFramePacer(44), tick, 10_000);
    const gaps = draws.slice(1).map((ts, i) => ts - draws[i]);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(1000 / 44 + tick + 0.001);
  });

  it('never draws two frames closer than one tick apart after a stall', () => {
    const pacer = createFramePacer(48);
    expect(pacer(1000)).toBe(true);
    expect(pacer(3000)).toBe(true);
    expect(pacer(3000 + 1000 / 144)).toBe(false);
  });

  it('passes every tick when the cap is above the tick rate', () => {
    expect(drawsOver(createFramePacer(44), 1000 / 30, 1000)).toHaveLength(30);
  });
});

describe('streamFrameCap', () => {
  it('adds headroom to the stream fps', () => {
    expect(streamFrameCap('?streamFps=44')).toBe(44);
  });

  it('is off without a valid streamFps', () => {
    expect(streamFrameCap('')).toBeNull();
    expect(streamFrameCap('?streamFps=abc')).toBeNull();
    expect(streamFrameCap('?streamFps=0')).toBeNull();
    expect(streamFrameCap('?streamFps=1000')).toBeNull();
  });
});

describe('createDisplayDivider', () => {
  it('halves a 144 Hz clock for a 60 Hz panel', () => {
    const n = drawsOver(createDisplayDivider(60), 1000 / 144, 10_000).length;
    expect(n).toBeGreaterThanOrEqual(715);
    expect(n).toBeLessThanOrEqual(725);
  });

  it('never drops below the panel refresh', () => {
    for (const hostHz of [60, 75, 100, 120, 144, 165, 240, 280, 300, 360]) {
      const draws = drawsOver(createDisplayDivider(60), 1000 / hostHz, 10_000);
      expect(draws.length / 10).toBeGreaterThanOrEqual(59.5);
    }
  });

  it('divides fast hosts down to the panel refresh', () => {
    for (const [hostHz, expected] of [[240, 60], [360, 60], [165, 82.5]] as const) {
      const n = drawsOver(createDisplayDivider(60), 1000 / hostHz, 10_000).length / 10;
      expect(n).toBeCloseTo(expected, 0);
    }
  });

  it('passes every tick when the clock already matches the panel', () => {
    expect(drawsOver(createDisplayDivider(60), 1000 / 60, 1000)).toHaveLength(60);
  });

  it('passes every tick without a panel rate', () => {
    expect(drawsOver(createDisplayDivider(null), 1000 / 144, 1000)).toHaveLength(144);
  });
});

describe('panelDisplayHz', () => {
  it('reads a valid rate', () => {
    expect(panelDisplayHz('?backdrop=desktop&displayHz=60')).toBe(60);
  });

  it('rejects missing or absurd rates', () => {
    expect(panelDisplayHz('')).toBeNull();
    expect(panelDisplayHz('?displayHz=1')).toBeNull();
    expect(panelDisplayHz('?displayHz=x')).toBeNull();
  });
});

describe('framePacingQuery', () => {
  it('keeps only the pacing params', () => {
    expect(framePacingQuery('?backdrop=desktop&displayHz=60&x=1')).toBe('?displayHz=60');
    expect(framePacingQuery('?streamFps=44')).toBe('?streamFps=44');
    expect(framePacingQuery('?backdrop=desktop')).toBe('');
  });
});
