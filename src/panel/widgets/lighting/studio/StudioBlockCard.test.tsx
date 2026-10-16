import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioBlockCard } from './StudioBlockCard';
import { studioBlock } from './studioBlocks';
import { makeBlock, type StudioBlock, type StudioMod } from './studioCompiler';
import type { AudioSnapshot } from '../../../../hooks/useAudioState';
import { DEFAULT_SENSOR_BINDING } from '../../../../lib/sensorBinding';

vi.mock('../../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// The picker reads live sensor topics; the card only needs to place it.
vi.mock('../../../../components/common/SensorPicker/SensorBindingEditor', () => ({
  SensorBindingEditor: ({ binding, onChange }: { binding: { sensor: string; max: number }; onChange: (b: unknown) => void }) => (
    <button type="button" data-testid="sensor-editor" onClick={() => onChange({ ...binding, max: 80 })}>{binding.sensor}</button>
  ),
}));

// The rings speed knob with a bass mod at half strength.
function ringsWithBass() {
  const block = makeBlock('rings');
  block.uid = 'r1';
  const p = studioBlock('rings')!.params.find(x => x.key === 'speed')!;
  block.params.speed = p.min;
  block.mods = { speed: { source: 'bass', amount: 0.5 } };
  return { block, p };
}

const noop = () => {};
const render_ = (audioRef?: { current: AudioSnapshot | null }, mod?: StudioMod, onChange: (b: StudioBlock, commit: boolean) => void = noop) => {
  const { block } = ringsWithBass();
  if (mod) block.mods = { speed: mod };
  return render(
    <StudioBlockCard
      block={block} def={studioBlock('rings')!} firstPattern removable={false} canSwitchTo={() => true}
      onChange={onChange} onCommit={noop} onTypeChange={noop} onRemove={noop}
      isPinned={() => false} onTogglePin={noop} audioRef={audioRef}
    />,
  );
};

// Positioned track overlays (band and marker) carry an inline `left`.
const overlays = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('span[style*="left"]')];

describe('StudioBlockCard audio modulation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('draws the span full volume moves a modulated knob across', () => {
    const { container } = render_();
    const band = overlays(container).find(el => el.style.width);
    expect(band?.style.left).toBe('0%');
    expect(band?.style.width).toBe('50%');
  });

  it('marks where the music has the knob now', async () => {
    const audioRef = { current: { level: 0, bass: 0.5, mid: 0, high: 0, beat: 0, spectrum: [], spectrum64: [] } as AudioSnapshot };
    const { container } = render_(audioRef);
    const lefts = () => overlays(container).filter(el => !el.style.width).map(el => el.style.left);
    expect(lefts()).not.toContain('25%');
    await act(async () => { vi.advanceTimersByTime(100); });
    // Half the bass moves it half of the band.
    expect(lefts()).toContain('25%');
  });
});

describe('StudioBlockCard mod shaping', () => {
  it('offers a threshold for music and a rate for a wave', () => {
    const { unmount } = render_(undefined, { source: 'bass', amount: 0.5 });
    expect(screen.getByText('lighting.studio.mod.gate')).toBeInTheDocument();
    expect(screen.queryByText('lighting.studio.mod.rate')).toBeNull();
    unmount();
    render_(undefined, { source: 'sine', amount: 0.5, rate: 1 });
    expect(screen.getByText('lighting.studio.mod.rate')).toBeInTheDocument();
    expect(screen.queryByText('lighting.studio.mod.gate')).toBeNull();
  });

  it('drops the threshold and starts a default rate when music becomes a wave', () => {
    const onChange = vi.fn();
    render_(undefined, { source: 'bass', amount: 0.5, gate: 0.4 }, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.mod.source' }));
    fireEvent.click(screen.getByRole('option', { name: 'lighting.studio.mod.triangle' }));
    const next = onChange.mock.calls.at(-1)![0] as StudioBlock;
    expect(next.mods?.speed).toEqual({ source: 'triangle', amount: 0.5, rate: 0.5 });
  });

  it('draws no live marker for a wave, which moves without audio', async () => {
    vi.useFakeTimers();
    const audioRef = { current: { level: 1, bass: 1, mid: 1, high: 1, beat: 1, spectrum: [], spectrum64: [] } as AudioSnapshot };
    const { container } = render_(audioRef, { source: 'sine', amount: 0.5, rate: 1 });
    // The amount slider's zero tick is the only unsized overlay before audio is sampled.
    const ticks = () => overlays(container).filter(el => !el.style.width).length;
    const before = ticks();
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(ticks()).toBe(before);
    vi.useRealTimers();
  });
});

describe('StudioBlockCard sensor modulation', () => {
  it('starts the default sensor and drops a gate when music becomes a sensor', () => {
    const onChange = vi.fn();
    render_(undefined, { source: 'bass', amount: 0.5, gate: 0.4 }, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.mod.source' }));
    fireEvent.click(screen.getByRole('option', { name: 'lighting.studio.mod.sensor' }));
    const next = onChange.mock.calls.at(-1)![0] as StudioBlock;
    expect(next.mods?.speed).toEqual({ source: 'sensor', amount: 0.5, sensor: DEFAULT_SENSOR_BINDING });
  });

  it('drops the sensor binding when it becomes a wave', () => {
    const onChange = vi.fn();
    render_(undefined, { source: 'sensor', amount: 0.5, sensor: DEFAULT_SENSOR_BINDING }, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.mod.source' }));
    fireEvent.click(screen.getByRole('option', { name: 'lighting.studio.mod.sine' }));
    expect((onChange.mock.calls.at(-1)![0] as StudioBlock).mods?.speed).toEqual({ source: 'sine', amount: 0.5, rate: 0.5 });
  });

  it('shows the picker, not a threshold or rate, and saves an edited range', () => {
    const onChange = vi.fn();
    render_(undefined, { source: 'sensor', amount: 0.5, sensor: DEFAULT_SENSOR_BINDING }, onChange);
    expect(screen.queryByText('lighting.studio.mod.gate')).toBeNull();
    expect(screen.queryByText('lighting.studio.mod.rate')).toBeNull();
    fireEvent.click(screen.getByTestId('sensor-editor'));
    const next = onChange.mock.calls.at(-1)![0] as StudioBlock;
    expect(next.mods?.speed.sensor).toEqual({ ...DEFAULT_SENSOR_BINDING, max: 80 });
    expect(onChange.mock.calls.at(-1)![1]).toBe(true);
  });

  it('marks where the sensor has the knob now', async () => {
    vi.useFakeTimers();
    try {
      const sensorRef = { current: () => 0.5 };
      const { block } = ringsWithBass();
      block.mods = { speed: { source: 'sensor', amount: 0.5, sensor: DEFAULT_SENSOR_BINDING } };
      const { container } = render(
        <StudioBlockCard
          block={block} def={studioBlock('rings')!} firstPattern removable={false} canSwitchTo={() => true}
          onChange={noop} onCommit={noop} onTypeChange={noop} onRemove={noop}
          isPinned={() => false} onTogglePin={noop} sensorRef={sensorRef}
        />,
      );
      const lefts = () => overlays(container).filter(el => !el.style.width).map(el => el.style.left);
      expect(lefts()).not.toContain('25%');
      await act(async () => { vi.advanceTimersByTime(300); });
      // Half the reading moves the knob half of the band, which is half the span.
      expect(lefts()).toContain('25%');
    } finally {
      vi.useRealTimers();
    }
  });
});
