import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LightingDevice } from '../../../../api/lighting';
import { ColorTuningModal } from './ColorTuningModal';

const fetchAdjust = vi.hoisted(() => vi.fn());
const setAdjust = vi.hoisted(() => vi.fn());
const setBrightness = vi.hoisted(() => vi.fn());

vi.mock('../../../../api/lighting', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../api/lighting')>()),
  fetchLightingColorAdjust: fetchAdjust,
  setLightingColorAdjust: setAdjust,
  setLightingDeviceBrightness: setBrightness,
}));

// The master-brightness cap is its own fetch; the modal only reads it to draw
// a marker, so a fixed value keeps these cases about the tuning controls.
vi.mock('./useGlobalBrightness', () => ({ useGlobalBrightness: () => 1 }));

function device(id: string, name: string, brightness = 100): LightingDevice {
  return {
    id, name, ledsOn: true, brightness, ledCount: 8,
    canvasX: 0, canvasY: 0, canvasW: 80, canvasH: 40, canvasRotation: 0,
  } as LightingDevice;
}

const DEVICES = [device('a', 'Strip A'), device('b', 'Strip B', 60)];

async function renderModal(initialIds: string[] = ['a']) {
  const onClose = vi.fn();
  await act(async () => {
    render(<ColorTuningModal devices={DEVICES} initialIds={initialIds} onClose={onClose} />);
  });
  return { onClose };
}

// t() falls through to the key with no locale bundle loaded, so the
// queries address controls by their translation key.
const sliderFor = (name: string) => screen.getByRole('slider', { name });

describe('ColorTuningModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAdjust.mockResolvedValue({ adjustments: {} });
    setAdjust.mockResolvedValue(null);
    setBrightness.mockResolvedValue(null);
  });

  it('writes one trim for every scoped device', async () => {
    await renderModal(['a', 'b']);

    fireEvent.change(sliderFor('lighting.colorTuning.red'), { target: { value: '120' } });

    expect(setAdjust).toHaveBeenCalled();
    const [ids, adjust] = setAdjust.mock.calls.at(-1)!;
    expect(ids).toEqual(['a', 'b']);
    expect(adjust.red).toBeCloseTo(1.2);
    // The untouched channels keep their neutral value rather than being dropped.
    expect(adjust.green).toBe(1);
    expect(adjust.saturation).toBe(1);
  });

  it('flags a control the scoped devices disagree on, and clears it on commit', async () => {
    fetchAdjust.mockResolvedValue({
      adjustments: {
        a: { red: 1.4, green: 1, blue: 1, temperature: 0, saturation: 1 },
      },
    });
    await renderModal(['a', 'b']);

    // Red differs (1.4 vs the neutral 1); nothing else does, so exactly one
    // control is marked - brightness differs too (100 vs 60), so two.
    expect(screen.getAllByText('lighting.colorTuning.mixed')).toHaveLength(2);
    // The slider sits at the average of the two, not at either device's value.
    expect(sliderFor('lighting.colorTuning.red')).toHaveValue('120');

    fireEvent.change(sliderFor('lighting.colorTuning.red'), { target: { value: '90' } });
    expect(screen.getAllByText('lighting.colorTuning.mixed')).toHaveLength(1);
  });

  it('scopes to the chips the user picks', async () => {
    await renderModal(['a']);

    fireEvent.click(screen.getByRole('button', { name: 'Strip B' }));
    fireEvent.change(sliderFor('lighting.colorTuning.blue'), { target: { value: '80' } });

    expect(setAdjust.mock.calls.at(-1)![0]).toEqual(['a', 'b']);
  });

  it('sends brightness per device, on the existing per-device route', async () => {
    await renderModal(['a', 'b']);

    fireEvent.change(sliderFor('lighting.devices.brightness'), { target: { value: '40' } });

    expect(setBrightness.mock.calls.map(c => c[0]).sort()).toEqual(['a', 'b']);
    expect(setBrightness.mock.calls.every(c => c[1] === 40)).toBe(true);
  });

  it('reset returns the scope to neutral', async () => {
    fetchAdjust.mockResolvedValue({
      adjustments: { a: { red: 1.4, green: 0.6, blue: 1, temperature: 0.5, saturation: 1.8 } },
    });
    await renderModal(['a']);

    fireEvent.click(screen.getByRole('button', { name: 'lighting.colorTuning.reset' }));

    expect(setAdjust.mock.calls.at(-1)![1]).toEqual({
      red: 1, green: 1, blue: 1, temperature: 0, saturation: 1,
    });
  });
});
