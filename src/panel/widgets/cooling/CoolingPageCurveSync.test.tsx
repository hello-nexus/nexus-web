import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import type { ServiceState } from '../../../types/service';
import { CoolingPage } from './CoolingPage';

// Rendered outside I18nProvider, so t() falls back to raw keys.

// Regression guard for the Discord report "when selecting different fans that
// use a diff curve, the curve editor changes with it". The chip row highlighted
// the selection's curve (effectiveCurveId) while the editor still read
// selectedCurveId, so picking a fan moved the highlight and left the editor on
// the previous curve.

// Two fans, each bound to a curve of a DIFFERENT type, so the editor's checked
// type chip identifies which curve it is showing.
vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [
        {
          id: 'fan-cpu', name: 'CPU Fan', dutyPercent: 42, rpm: 1180, mode: 'Manual',
          classification: 'Controllable', calibrated: true,
        },
        {
          id: 'fan-rear', name: 'Rear Fan', dutyPercent: 30, rpm: 900, mode: 'Manual',
          classification: 'Controllable', calibrated: true,
        },
        // Bound to no curve, the state a fan is in before its first assignment.
        {
          id: 'fan-top', name: 'Top Fan', dutyPercent: 55, rpm: 1400, mode: 'Manual',
          classification: 'Controllable', calibrated: true,
        },
      ],
    })),
    fetchTemperatureSources: vi.fn(async () => ({
      sources: [{ id: 'cpu-package', name: 'CPU Package', category: 'CPU', value: 52 }],
    })),
    fetchCurves: vi.fn(async () => ({
      globalSpeedModifier: 1,
      curves: [
        {
          id: 'curve-alpha', name: 'Alpha', type: 'Flat',
          input: { id: 'cpu-package', type: 'Temperature', device: '' },
          outputs: [{ id: 'fan-cpu', type: 'Fan' }],
          flat: { speed: 40 },
        },
        {
          id: 'curve-bravo', name: 'Bravo', type: 'Linear',
          input: { id: 'cpu-package', type: 'Temperature', device: '' },
          outputs: [{ id: 'fan-rear', type: 'Fan' }],
          linear: { responseTime: 1.5, minTemp: 30, maxTemp: 70, minSpeed: 20, maxSpeed: 80 },
        },
      ],
    })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'custom' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    applyProfile: vi.fn(async () => undefined),
    saveCurves: vi.fn(async () => undefined),
    releaseFanAuto: vi.fn(async () => undefined),
    renameFan: vi.fn(async () => undefined),
    setFanSpeed: vi.fn(async () => undefined),
    setFanLock: vi.fn(async () => undefined),
    setFanOffset: vi.fn(async () => undefined),
    fetchCoolingPresets: vi.fn(async () => ({ presets: [], activeId: null })),
    createCoolingPreset: vi.fn(async () => ({ preset: null, activeId: null, error: false, msg: 'Ok' })),
    updateCoolingPreset: vi.fn(async () => undefined),
    deleteCoolingPreset: vi.fn(async () => ({ activeId: null })),
    activateCoolingPreset: vi.fn(async () => undefined),
  };
});

import { saveCurves } from '../../../api/cooling';

const serviceState = { cooling: { calibrating: false } } as unknown as ServiceState;

function renderAdvanced() {
  localStorage.setItem('nexus_settings', JSON.stringify({
    general: { coolingDashboardMode: 'advanced', lightingDashboardMode: 'advanced' },
  }));
  return render(
    <UiSettingsProvider>
      <CoolingPage serviceOnline serviceState={serviceState} />
    </UiSettingsProvider>,
  );
}

/** The chip row itself - fan cards carry curve names too, so every chip query
 *  has to be scoped to it. */
const chipRow = () => screen.getByRole('group', { name: 'cooling.sections.curves' });

/** The curve chip the selector is highlighting, or null when none is. */
const highlightedCurve = () =>
  within(chipRow()).getAllByRole('button')
    .find(b => b.getAttribute('aria-current') === 'true')?.textContent ?? null;

/** The hint that only renders while the editor is greyed out. */
const inertHint = () => screen.queryByText('cooling.curves.noCurveSelected');

/** The editor's type-chip group - the handle for its dimmed wrapper. */
const editorGroup = () => screen.getByRole('radiogroup', { name: 'cooling.curve.type.label' });

/** The curve type the editor is currently showing. */
const editorType = () =>
  screen.getAllByRole('radio')
    .find(r => r.getAttribute('aria-checked') === 'true')
    ?.getAttribute('aria-label') ?? null;

/**
 * Click a fan card's bare surface. The card root owns the selection click and
 * ignores anything under [data-no-dnd]/button/input/select, so the RPM readout
 * beside the (data-no-dnd) name is the reliable handle.
 */
function selectFanCard(rpm: string) {
  fireEvent.click(screen.getByText(rpm));
}

describe('CoolingPage curve editor follows the fan selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The fan selection persists to localStorage; a leak reads as "fans were
    // already selected" and flips the inert assertions below.
    localStorage.clear();
  });

  it('opens on the first curve with nothing selected', async () => {
    renderAdvanced();
    await waitFor(() => { expect(highlightedCurve()).toContain('Alpha'); });
    expect(editorType()).toBe('cooling.curve.type.fixed');
  });

  it('moves the editor to the curve a newly selected fan wears', async () => {
    renderAdvanced();
    await waitFor(() => { expect(editorType()).toBe('cooling.curve.type.fixed'); });

    selectFanCard('900');

    // The chip row and the editor must land on the same curve: Bravo/linear.
    await waitFor(() => { expect(highlightedCurve()).toContain('Bravo'); });
    expect(editorType()).toBe('cooling.curve.type.linear');
  });

  it('moves back when the other fan is selected', async () => {
    renderAdvanced();
    await waitFor(() => { expect(editorType()).toBe('cooling.curve.type.fixed'); });

    selectFanCard('900');
    await waitFor(() => { expect(editorType()).toBe('cooling.curve.type.linear'); });

    selectFanCard('1,180');
    await waitFor(() => { expect(highlightedCurve()).toContain('Alpha'); });
    expect(editorType()).toBe('cooling.curve.type.fixed');
  });

  it('falls back to the picked curve, not an empty editor, when the fans disagree', async () => {
    renderAdvanced();
    await waitFor(() => { expect(editorType()).toBe('cooling.curve.type.fixed'); });

    selectFanCard('900');
    await waitFor(() => { expect(editorType()).toBe('cooling.curve.type.linear'); });

    // Ctrl-click adds the other fan. The two wear different curves, so there is
    // nothing to highlight; the editor drops back to the curve last picked from
    // the buttons rather than emptying out.
    fireEvent.click(screen.getByText('1,180'), { ctrlKey: true });
    await waitFor(() => { expect(highlightedCurve()).toBeNull(); });
    expect(editorType()).toBe('cooling.curve.type.fixed');
  });

  it('greys the editor out only once the selected fans share no curve', async () => {
    renderAdvanced();
    await waitFor(() => { expect(editorType()).toBe('cooling.curve.type.fixed'); });
    // Nothing selected: the editor is live on the picked curve.
    expect(inertHint()).toBeNull();

    // One fan, and it has a curve - still live.
    selectFanCard('900');
    await waitFor(() => { expect(editorType()).toBe('cooling.curve.type.linear'); });
    expect(inertHint()).toBeNull();

    // Two fans on different curves: nothing to apply an edit to.
    fireEvent.click(screen.getByText('1,180'), { ctrlKey: true });
    await waitFor(() => { expect(inertHint()).toBeTruthy(); });
    // The dimmed wrapper is the curve card's parent, not the header the hint
    // lives in - scoped so an unrelated aria-disabled cannot satisfy this.
    expect(editorGroup().closest('[aria-disabled="true"]')).toBeTruthy();
  });

  it('drops an edit made while the editor is inert', async () => {
    renderAdvanced();
    await waitFor(() => { expect(editorType()).toBe('cooling.curve.type.fixed'); });
    selectFanCard('900');
    fireEvent.click(screen.getByText('1,180'), { ctrlKey: true });
    await waitFor(() => { expect(inertHint()).toBeTruthy(); });

    vi.mocked(saveCurves).mockClear();
    // jsdom ignores pointer-events, so these clicks land the way a keyboard
    // user could still reach them. The stubbed callbacks are what stop them.
    fireEvent.click(screen.getByRole('radio', { name: 'cooling.curve.type.trigger' }));
    fireEvent.click(screen.getByRole('button', { name: /cooling\.curves\.removeBtn/ }));
    // pushCurves calls saveCurves with no debounce, so a flush is enough; a
    // fixed sleep here would be a magic number.
    await act(async () => {});

    expect(vi.mocked(saveCurves)).not.toHaveBeenCalled();
    // Type unchanged, curve still there.
    expect(editorType()).toBe('cooling.curve.type.fixed');
    expect(within(chipRow()).getByRole('button', { name: /Alpha/ })).toBeTruthy();
  });

  it('opens a curve created into a mixed selection editable, not greyed', async () => {
    renderAdvanced();
    await waitFor(() => { expect(editorType()).toBe('cooling.curve.type.fixed'); });

    selectFanCard('900');
    fireEvent.click(screen.getByText('1,180'), { ctrlKey: true });
    await waitFor(() => { expect(inertHint()).toBeTruthy(); });

    // A new curve binds no fan, so without dropping the selection the editor
    // would stay greyed on the very curve the user just asked for.
    fireEvent.click(within(chipRow()).getByRole('button', { name: /cooling\.curves\.add/ }));

    await waitFor(() => { expect(inertHint()).toBeNull(); });
    // newCurve() seeds a multipoint curve - the editor is on the new one.
    expect(editorType()).toBe('cooling.curve.type.custom');
    expect(editorGroup().closest('[aria-disabled="true"]')).toBeNull();
  });

  it('greys the editor for a single fan that wears no curve', async () => {
    renderAdvanced();
    await waitFor(() => { expect(editorType()).toBe('cooling.curve.type.fixed'); });

    // One fan, no multi-select, no disagreement - but nothing to apply an edit
    // to either, so the same inert treatment and the same wording must hold.
    selectFanCard('1,400');
    await waitFor(() => { expect(inertHint()).toBeTruthy(); });
    expect(highlightedCurve()).toBeNull();
    expect(editorGroup().closest('[aria-disabled="true"]')).toBeTruthy();

    // Picking a curve binds it to that fan and brings the editor back.
    fireEvent.click(within(chipRow()).getByRole('button', { name: /Bravo/ }));
    await waitFor(() => { expect(inertHint()).toBeNull(); });
    expect(editorType()).toBe('cooling.curve.type.linear');
  });
});
