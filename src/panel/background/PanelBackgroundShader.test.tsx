import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelBackgroundShader } from './PanelBackgroundShader';

const enabledSeen: boolean[] = [];
let sensors: unknown[] = [];

vi.mock('../../hooks/useShaderRenderer', () => ({ useShaderRenderer: () => ({ ready: false, error: null }) }));
vi.mock('../../hooks/useShaderParams', () => ({ useShaderParams: () => ({ specs: {}, sensors, loaded: true }) }));
vi.mock('../../hooks/SensorSignalProvider', () => ({
  SensorSignalProvider: ({ enabled, children }: { enabled: boolean; children: React.ReactNode }) => {
    enabledSeen.push(enabled);
    return <>{children}</>;
  },
}));

const props = { effect: 'sensorbar', template: 0, opacity: 1 };

describe('PanelBackgroundShader sensor provider', () => {
  beforeEach(() => { enabledSeen.length = 0; sensors = []; });

  it('keeps the provider mounted and disabled for an effect without sensors', () => {
    render(<PanelBackgroundShader {...props} />);
    expect(enabledSeen.at(-1)).toBe(false);
  });

  it('enables the same provider once the effect declares sensors', () => {
    const { rerender } = render(<PanelBackgroundShader {...props} />);
    sensors = [{ name: 'u_a_s' }];
    rerender(<PanelBackgroundShader {...props} />);
    expect(enabledSeen.at(-1)).toBe(true);
  });
});
