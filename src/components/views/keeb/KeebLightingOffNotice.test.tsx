// Page-top Lighting-off notice: shown only while the master Lighting switch is
// off, and its action turns the switch on through the settings update.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { KeebLightingOffNotice } from './KeebLightingOffNotice';

const state = vi.hoisted(() => ({ lighting: true, update: vi.fn() }));

vi.mock('../../../hooks/useUiSettings', () => ({
  useFeatureFlags: () => ({ lighting: state.lighting, cooling: true, monitoring: true, diagnostics: true }),
  useUiSettingsUpdateSafe: () => state.update,
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => { state.lighting = true; state.update = vi.fn(); });
afterEach(() => { cleanup(); });

describe('KeebLightingOffNotice', () => {
  it('shows the notice when Lighting is off', () => {
    state.lighting = false;
    render(<KeebLightingOffNotice />);
    expect(screen.getByText('keeb.lightingOff')).toBeInTheDocument();
  });

  it('renders nothing when Lighting is on', () => {
    render(<KeebLightingOffNotice />);
    expect(screen.queryByText('keeb.lightingOff')).toBeNull();
    expect(screen.queryByText('keeb.lightingOffEnable')).toBeNull();
  });

  it('the action turns Lighting on', () => {
    state.lighting = false;
    render(<KeebLightingOffNotice />);
    fireEvent.click(screen.getByText('keeb.lightingOffEnable'));
    expect(state.update).toHaveBeenCalledWith({ featureLightingEnabled: true });
  });
});
