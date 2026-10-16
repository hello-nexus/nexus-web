import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_DEFAULTS, type EffectState } from '../../../../types/lighting';
import type { SensorBinding } from '../../../../lib/sensorBinding';
import { EffectControls } from './EffectControls';

vi.mock('../../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const gpu: SensorBinding = { category: 'quick', sensor: 'summary/gpu-usage', min: 0, max: 100 };
let shipped: Record<string, unknown> | null = null;
vi.mock('../../../../api/lighting', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../api/lighting')>()),
  cachedAnimateDefaults: () => shipped,
}));

const shaderDefault: SensorBinding = { category: 'quick', sensor: 'summary/cpu-usage', min: 0, max: 100 };
const spec = (name: string, min: number, max: number, step = 1) => ({ name, min, max, step, defaultValue: min, declared: true });

vi.mock('../../../../hooks/useShaderParams', () => ({
  useShaderParams: () => ({
    loaded: true,
    specs: Object.fromEntries([
      spec('u_fill_angle', 0, 360), spec('u_fill_flip', 0, 1),
      spec('u_speed', -2, 2, 0.02), spec('u_saturation', 0, 4, 0.01), spec('u_contrast', 0, 4, 0.01),
    ].map(s => [s.name, s])),
    sensors: [{ name: 'u_fill_level_s', binding: shaderDefault }],
  }),
}));

// The picker reads live sensor topics; here it only reports what the controls hand it and what they do with the answer.
vi.mock('../../monitoring/picker/SensorBindingEditor', () => ({
  SensorBindingEditor: ({ binding, onChange, onReset, showReset }: { binding: SensorBinding; onChange: (b: SensorBinding) => void; onReset?: () => void; showReset?: boolean }) => (
    <div data-testid="editor" data-sensor={binding.sensor} data-max={binding.max}>
      <button type="button" onClick={() => onChange({ category: 'cpu', sensor: 'cpu/load/0', min: 0, max: 100 })}>pick</button>
      <button type="button" onClick={() => onChange({ ...shaderDefault })}>pick-default</button>
      {showReset && <button type="button" onClick={onReset} disabled={!onReset}>reset</button>}
    </div>
  ),
}));

const baseState = (sensors?: EffectState['sensors']): EffectState => ({ ...BASE_DEFAULTS, params: {}, sensors });

function setup(state: EffectState) {
  const onChange = vi.fn();
  render(
    <EffectControls
      effect="sensorbar" state={state} bundle={{ selected: 0, slots: [state] }} onTemplateSelect={() => {}}
      canReset={false} onChange={onChange} onCommit={() => {}} onReset={() => {}} noPresets
    />,
  );
  return onChange;
}

describe('EffectControls sensor uniforms', () => {
  it('shows the shader default under the effect-defined label, with no way back yet', () => {
    setup(baseState());
    expect(screen.getByText('lighting.sensor.level')).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toHaveAttribute('data-sensor', 'summary/cpu-usage');
    expect(screen.getByRole('button', { name: 'reset' })).toBeDisabled();
  });

  it('saves a pick into the effect state at once, leaving other uniforms alone', () => {
    const other = { category: 'gpu', sensor: 'g', min: 0, max: 10 };
    const onChange = setup(baseState({ u_other_s: other }));
    fireEvent.click(screen.getByRole('button', { name: 'pick' }));
    expect(onChange).toHaveBeenCalledWith({
      sensors: { u_other_s: other, u_fill_level_s: { category: 'cpu', sensor: 'cpu/load/0', min: 0, max: 100 } },
    }, true);
  });

  it('renders and resets an override', () => {
    const mine = { category: 'cpu', sensor: 'cpu/load/0', min: 0, max: 50 };
    const onChange = setup(baseState({ u_fill_level_s: mine }));
    expect(screen.getByTestId('editor')).toHaveAttribute('data-max', '50');
    fireEvent.click(screen.getByRole('button', { name: 'reset' }));
    // The last override going away clears the field, so the state matches one never touched.
    expect(onChange).toHaveBeenCalledWith({ sensors: undefined }, true);
  });

  it('stores a pick that equals the shader default, so it outlives a change of that default', () => {
    const mine = { category: 'cpu', sensor: 'cpu/load/0', min: 0, max: 50 };
    const onChange = setup(baseState({ u_fill_level_s: mine }));
    fireEvent.click(screen.getByRole('button', { name: 'pick-default' }));
    expect(onChange).toHaveBeenCalledWith({ sensors: { u_fill_level_s: shaderDefault } }, true);
  });
});

describe('EffectControls sensor row reset against the preset default', () => {
  afterEach(() => { shipped = null; });

  const preset2 = () => {
    shipped = { sensorbar: { selected: 0, slots: [{}, { sensors: { u_fill_level_s: gpu } }, {}, {}] } };
  };
  const render2 = (state: EffectState) => {
    const onChange = vi.fn();
    render(
      <EffectControls
        effect="sensorbar" state={state} bundle={{ selected: 1, slots: [state, state] }} onTemplateSelect={() => {}}
        canReset={false} onChange={onChange} onCommit={() => {}} onReset={() => {}}
      />,
    );
    return onChange;
  };

  it('returns a changed row to the preset default, not the shader default', () => {
    preset2();
    const mem = { category: 'quick', sensor: 'summary/memory-usage', min: 0, max: 100 };
    const onChange = render2(baseState({ u_fill_level_s: mem }));
    fireEvent.click(screen.getByRole('button', { name: 'reset' }));
    expect(onChange).toHaveBeenCalledWith({ sensors: { u_fill_level_s: gpu } }, true);
  });

  it('keeps the reset in place, disabled, on an untouched preset', () => {
    preset2();
    render2(baseState({ u_fill_level_s: gpu }));
    expect(screen.getByRole('button', { name: 'reset' })).toBeDisabled();
  });

  it('lets an explicit pick of the frag default be cleared where the effect ships no defaults', () => {
    const onChange = setup(baseState({ u_fill_level_s: shaderDefault }));
    const reset = screen.getByRole('button', { name: 'reset' });
    expect(reset).toBeEnabled();
    fireEvent.click(reset);
    expect(onChange).toHaveBeenCalledWith({ sensors: undefined }, true);
  });
});
