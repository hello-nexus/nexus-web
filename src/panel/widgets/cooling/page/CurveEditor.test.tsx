import { useState } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CurveCard, sourceCategoryLabel } from './CurveEditor';
import { I18nProvider } from '../../../../lib/i18n';
import { newCurve } from '../../../../types/cooling';
import type { CurveDef } from '../../../../types/cooling';
import type { TemperatureSource } from '../../../../api/cooling';

// Regression guard for the cooling-page fan-curve graph. Commit 534af55 made
// the graph display-only; the call sites stopped passing `editable`/`onChange`,
// so multipoint points could no longer be dragged, added, or removed. These
// tests render the real CurveCard and assert each gesture reaches onChange, so
// dropping `editable` at a call site fails here rather than shipping silently.

// jsdom has no layout/pointer-capture engine. Give the SVG a fixed box so the
// drag math is deterministic, and no-op setPointerCapture so onPointerDown runs.
function stubSvgGeometry() {
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 140, width: 400, height: 140,
    toJSON: () => ({}),
  } as DOMRect);
}

function renderMultipointCard(onChange: (c: CurveDef) => void) {
  const curve = newCurve('curve-test');
  return render(
    <CurveCard
      curve={curve}
      allCurves={[curve]}
      sources={[]}
      onChange={onChange}
      onDelete={() => {}}
    />,
  );
}

describe('cooling fan-curve graph interactivity', () => {
  beforeEach(() => {
    stubSvgGeometry();
  });

  it('renders draggable point markers for a multipoint curve', () => {
    const { container } = renderMultipointCard(() => {});
    const points = container.querySelectorAll('svg circle');
    // newCurve seeds 5 multipoint points; markers must render to be grabbable.
    expect(points.length).toBeGreaterThanOrEqual(5);
  });

  it('dragging a point commits the moved point set via onChange', () => {
    const onChange = vi.fn();
    const { container } = renderMultipointCard(onChange);
    const circle = container.querySelector('svg circle')!;
    fireEvent.pointerDown(circle, { pointerId: 1, clientX: 0, clientY: 120 });
    fireEvent.pointerMove(circle, { pointerId: 1, clientX: 0, clientY: 20 });
    fireEvent.pointerUp(circle, { pointerId: 1 });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0] as CurveDef;
    expect(next.multipoint.points).toHaveLength(5);
    // Moving the handle up the chart raises the duty of the lowest-temp point.
    const moved = [...next.multipoint.points].sort((a, b) => a.temp - b.temp)[0];
    expect(moved.speed).toBeGreaterThan(25);
  });

  it('double-clicking the chart adds a point', () => {
    const onChange = vi.fn();
    const { container } = renderMultipointCard(onChange);
    // The chart svg is the one holding the point markers (the others are chip icons).
    const svg = container.querySelector('circle')!.closest('svg')!;
    fireEvent.doubleClick(svg, { clientX: 200, clientY: 70 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CurveDef;
    expect(next.multipoint.points).toHaveLength(6);
  });

  it('right-clicking a point removes it', () => {
    const onChange = vi.fn();
    const { container } = renderMultipointCard(onChange);
    const circle = container.querySelector('svg circle')!;
    fireEvent.contextMenu(circle);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CurveDef;
    expect(next.multipoint.points).toHaveLength(4);
  });
});

// Real locale strings via I18nProvider so the badge assertions exercise the
// actual axis copy rather than raw i18n keys.
function renderMultipointCardWithI18n(sources: TemperatureSource[] = []) {
  const curve = newCurve('curve-test');
  return render(
    <I18nProvider>
      <CurveCard curve={curve} allCurves={[curve]} sources={sources} onChange={() => {}} onDelete={() => {}} />
    </I18nProvider>,
  );
}

// Commits onChange back into props like the real cooling page, so post-release
// assertions see the committed drag values rather than the initial seed.
function StatefulMultipointCard({ sources = [] }: { sources?: TemperatureSource[] }) {
  const [curve, setCurve] = useState<CurveDef>(() => newCurve('curve-test'));
  return (
    <I18nProvider>
      <CurveCard curve={curve} allCurves={[curve]} sources={sources} onChange={setCurve} onDelete={() => {}} />
    </I18nProvider>
  );
}

describe('curve handle temp/duty readout', () => {
  beforeEach(() => {
    stubSvgGeometry();
  });

  it('hovering a point shows its temp and duty in the hover box, cleared on leave', async () => {
    const { container, findByText, queryByText } = renderMultipointCardWithI18n();
    // Second-lowest seed point (45°, 33%): neither value collides with the
    // static axis legend numbers, so the box text is unambiguous.
    const circle = container.querySelectorAll('svg circle')[1];
    fireEvent.pointerOver(circle);
    await findByText('45°C');
    expect(queryByText('33%')).toBeTruthy();
    // The box names both rows with the real locale strings.
    expect(queryByText('Temperature')).toBeTruthy();
    expect(queryByText('Fan duty')).toBeTruthy();
    fireEvent.pointerOut(circle);
    expect(queryByText('45°C')).toBeNull();
    expect(queryByText('33%')).toBeNull();
  });

  it('dragging a point shows the readout tracking the dragged values, held after release until leave', async () => {
    const { container, findByText, queryByText } = render(<StatefulMultipointCard />);
    const circle = container.querySelector('svg circle')!;
    // Grab shows the point's current coordinates before any movement.
    fireEvent.pointerDown(circle, { pointerId: 1, clientX: 0, clientY: 120 });
    await findByText('30°C');
    // Dragging to the top-left corner clamps to the axis minimum temp and
    // lands on a duty no static legend number shares.
    fireEvent.pointerMove(circle, { pointerId: 1, clientX: 0, clientY: 20 });
    await findByText('20°C');
    expect(queryByText('89%')).toBeTruthy();
    // The cursor still rests on the dot after release, so the readout holds.
    fireEvent.pointerUp(circle, { pointerId: 1 });
    expect(queryByText('20°C')).toBeTruthy();
    expect(queryByText('89%')).toBeTruthy();
    fireEvent.pointerOut(circle);
    expect(queryByText('20°C')).toBeNull();
    expect(queryByText('89%')).toBeNull();
  });

  it('the live-temp indicator stays up while the hover box is open', async () => {
    // newCurve's sourceId is '', so this source drives the live-temp dot.
    const { container, findByText, queryByText } = render(
      <StatefulMultipointCard sources={[{ id: '', name: 'CPU Package', category: 'CPU', value: 70 }]} />,
    );
    await findByText('70.0°C');
    // r=4 is the live-temp dot; r=7 the point markers.
    expect(container.querySelector('svg circle[r="4"]')).toBeTruthy();
    const circle = container.querySelector('svg circle[r="7"]')!;
    fireEvent.pointerDown(circle, { pointerId: 1, clientX: 0, clientY: 120 });
    await findByText('30°C');
    // The box coexists with the live badges and guide dot.
    expect(queryByText('70.0°C')).toBeTruthy();
    expect(container.querySelector('svg circle[r="4"]')).toBeTruthy();
    // Release keeps the pointer on the dot: the box holds.
    fireEvent.pointerUp(circle, { pointerId: 1 });
    expect(queryByText('30°C')).toBeTruthy();
    expect(queryByText('70.0°C')).toBeTruthy();
    fireEvent.pointerOut(circle);
    expect(queryByText('30°C')).toBeNull();
    expect(queryByText('70.0°C')).toBeTruthy();
    expect(container.querySelector('svg circle[r="4"]')).toBeTruthy();
  });

  it('an external points change clears a held hover readout', async () => {
    const curve = newCurve('curve-test');
    const { container, findByText, queryByText, rerender } = render(staticCardUi(curve));
    const circle = container.querySelectorAll('svg circle')[1];
    fireEvent.pointerOver(circle);
    await findByText('45°C');
    rerender(staticCardUi(nudge45(curve)));
    expect(queryByText('45°C')).toBeNull();
  });

  it('a drag release under a non-committing parent cannot swallow a later external clear', async () => {
    const curve = newCurve('curve-test');
    const { container, findByText, queryByText, rerender } = render(staticCardUi(curve));
    const circle = container.querySelector('svg circle')!;
    fireEvent.pointerDown(circle, { pointerId: 1, clientX: 0, clientY: 120 });
    fireEvent.pointerMove(circle, { pointerId: 1, clientX: 0, clientY: 20 });
    fireEvent.pointerUp(circle, { pointerId: 1 });
    // The parent never echoed the commit, so the readout names the prop point.
    await findByText('30°C');
    rerender(staticCardUi(nudge45(curve)));
    expect(queryByText('30°C')).toBeNull();
  });
});

// A CurveHost-shaped caller: onChange goes nowhere, points only move when the
// test rerenders with new content.
function staticCardUi(c: CurveDef) {
  return (
    <I18nProvider>
      <CurveCard curve={c} allCurves={[c]} sources={[]} onChange={() => {}} onDelete={() => {}} />
    </I18nProvider>
  );
}

// External edit unrelated to the dragged point: bump the 45° seed's duty.
function nudge45(curve: CurveDef): CurveDef {
  return {
    ...curve,
    multipoint: {
      ...curve.multipoint,
      points: curve.multipoint.points.map(p => (p.temp === 45 ? { ...p, speed: p.speed + 1 } : p)),
    },
  };
}

describe('sourceCategoryLabel', () => {
  const src = (id: string, category = 'GPU'): TemperatureSource => ({ id, name: 'GPU Core', category, value: 40 });
  const temp = (id: string) => ({ id, name: 'GPU Core', type: 'Temperature', value: 0, units: '°C', formatted: '', parent: { id: '', name: '' } });
  const igpu = { id: '/gpu-amd/0', name: 'AMD Radeon(TM) Graphics', integrated: true, sensors: [temp('/gpu-amd/0/temperature/0')] };
  const dgpu = { id: '/gpu-nvidia/0', name: 'NVIDIA GeForce RTX 5080', integrated: false, sensors: [temp('/gpu-nvidia/0/temperature/0')] };

  it('names the card for a GPU source once two GPUs make "GPU - GPU Core" ambiguous', () => {
    expect(sourceCategoryLabel(src('/gpu-amd/0/temperature/0'), [igpu, dgpu])).toBe('iGPU');
    expect(sourceCategoryLabel(src('/gpu-nvidia/0/temperature/0'), [igpu, dgpu])).toBe('GPU');
  });

  it('leaves the plain category for non-GPU sources, single-GPU boxes and unmatched ids', () => {
    expect(sourceCategoryLabel(src('/lpc/nct6798d/0/temperature/0', 'Motherboard'), [igpu, dgpu])).toBe('Motherboard');
    expect(sourceCategoryLabel(src('/gpu-nvidia/0/temperature/0'), [dgpu])).toBe('GPU');
    expect(sourceCategoryLabel(src('hwmon/hwmon4/temp1'), [igpu, dgpu])).toBe('GPU');
  });
});
