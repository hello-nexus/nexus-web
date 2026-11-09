import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CurveGraph } from './CurveEditor';

// Opt-in props for a fixed-grid graph (an equalizer): its own y range, labels only at chosen
// values, ticks on exact x values and keyboard steps. Without them the cooling graph is as before.

const pts = [0, 1, 2].map(temp => ({ temp, speed: 0 }));
const verticalDrag = {
  isLocked: () => false,
  apply: (p: { temp: number; speed: number }[], i: number, v: number) => p.map((pt, k) => (k === i ? { ...pt, speed: v } : pt)),
};
const eq = {
  tempMin: -0.5, tempMax: 2.5,
  axis: { xTicks: [0, 1, 2], formatX: (v: number) => `${v}Hz` },
  yAxis: { min: -20, max: 6, step: 0.5, lines: [0], labels: [{ value: 6, label: '+6dB' }, { value: -20, label: '-20dB' }] },
};
const labels = (c: HTMLElement) => Array.from(c.querySelectorAll('span')).map(s => s.textContent);

describe('CurveGraph y axis and ticks', () => {
  it('labels only the given y values and the given x ticks', () => {
    const { container } = render(<CurveGraph points={pts} {...eq} />);
    expect(labels(container)).toEqual(expect.arrayContaining(['+6dB', '-20dB', '0Hz', '1Hz', '2Hz']));
    expect(labels(container)).not.toContain('50%');
    expect(labels(container)).not.toContain('20°');
  });

  it('keeps the cooling labels and 0-100 scale without them', () => {
    const { container } = render(<CurveGraph points={[{ temp: 30, speed: 20 }, { temp: 90, speed: 80 }]} />);
    expect(labels(container)).toEqual(expect.arrayContaining(['0%', '50%', '100%', '20°']));
  });

  it('places a value on the given y range', () => {
    const { container } = render(<CurveGraph points={[{ temp: 0, speed: 6 }, { temp: 1, speed: -20 }]} height={216} {...eq} editable verticalDrag={verticalDrag} />);
    const dots = container.querySelectorAll('svg[preserveAspectRatio] circle');
    expect(Number(dots[0].getAttribute('cy'))).toBeCloseTo(8, 0);
    expect(Number(dots[1].getAttribute('cy'))).toBeCloseTo(208, 0);
  });
});

describe('CurveGraph keyboard', () => {
  it('makes points focusable and steps them with the arrows, within the range', () => {
    const onChange = vi.fn();
    render(<CurveGraph points={[{ temp: 0, speed: 5.5 }, { temp: 1, speed: 0 }]} {...eq} editable verticalDrag={verticalDrag} keyboardStep={0.5} onChange={onChange} />);
    const first = screen.getByRole('slider', { name: '0Hz' });
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith([{ temp: 0, speed: 6 }, { temp: 1, speed: 0 }]);
    onChange.mockClear();
    fireEvent.keyDown(screen.getByRole('slider', { name: '0Hz' }), { key: 'ArrowUp', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith([{ temp: 0, speed: 6 }, { temp: 1, speed: 0 }]);
    fireEvent.keyDown(screen.getByRole('slider', { name: '1Hz' }), { key: 'ArrowDown', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith([{ temp: 0, speed: 5.5 }, { temp: 1, speed: -2.5 }]);
  });

  it('steps a Shift press by the multiplier', () => {
    const onChange = vi.fn();
    render(<CurveGraph points={pts} {...eq} editable verticalDrag={verticalDrag} keyboardStep={0.5} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: '0Hz' }), { key: 'ArrowUp', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith([{ temp: 0, speed: 2.5 }, pts[1], pts[2]]);
  });

  it('keeps the value tooltip after a key step commits', () => {
    function Host() {
      const [p, setP] = useState(pts);
      return <CurveGraph points={p} {...eq} editable verticalDrag={verticalDrag} keyboardStep={0.5} onChange={setP} yAxis={{ ...eq.yAxis, formatValue: v => `${v}dB` }} />;
    }
    render(<Host />);
    const first = screen.getByRole('slider', { name: '0Hz' });
    fireEvent.focus(first);
    expect(screen.getByText('0dB')).toBeInTheDocument();
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(screen.getByText('0.5dB')).toBeInTheDocument();
  });

  it('adds no focus stops without keyboardStep, or when not editable', () => {
    const a = render(<CurveGraph points={pts} {...eq} editable verticalDrag={verticalDrag} />);
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
    a.unmount();
    render(<CurveGraph points={pts} {...eq} keyboardStep={0.5} />);
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
  });
});

describe('CurveGraph live readout', () => {
  it('uses the y axis formatter when given, and percent otherwise', () => {
    const a = render(<CurveGraph points={pts} {...eq} currentTemp={1} yAxis={{ ...eq.yAxis, formatValue: v => `${v} dB` }} />);
    expect(labels(a.container)).toContain('0 dB');
    a.unmount();
    const b = render(<CurveGraph points={[{ temp: 30, speed: 20 }, { temp: 90, speed: 80 }]} currentTemp={60} />);
    expect(labels(b.container)).toContain('50%');
  });
});

describe('CurveGraph pointer cancel', () => {
  it('ends a drag like a release', () => {
    Element.prototype.setPointerCapture = vi.fn();
    const onChange = vi.fn();
    render(<CurveGraph points={pts} {...eq} editable verticalDrag={verticalDrag} keyboardStep={0.5} onChange={onChange} />);
    const dot = screen.getByRole('slider', { name: '0Hz' });
    fireEvent.pointerDown(dot, { pointerId: 1 });
    fireEvent.pointerCancel(dot, { pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.pointerCancel(dot, { pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('CurveGraph easing is only drawn', () => {
  it('draws a smooth line that stays within the points values', () => {
    const p = [{ temp: 0, speed: -10 }, { temp: 1, speed: 4 }, { temp: 2, speed: -10 }];
    const { container } = render(<CurveGraph points={p} {...eq} easing="smooth" height={216} />);
    const line = Array.from(container.querySelectorAll('svg path')).find(x => x.getAttribute('fill') === 'none')!.getAttribute('d')!;
    const ys = (line.match(/L [-\d.]+ ([-\d.]+)/g) ?? []).map(s => Number(s.split(' ')[2]));
    expect(ys.length).toBeGreaterThan(50);
    const top = 8 + 200 * (1 - (4 + 20) / 26);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(top - 0.01);
  });
});
