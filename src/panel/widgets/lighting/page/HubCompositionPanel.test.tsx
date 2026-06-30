import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HubCompositionPanel } from './HubCompositionPanel';
import type { HubComposition } from '../../../../api/lighting';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../../components/common/SettingsSection/SettingsSection', () => ({
  SettingsSection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../../components/common/SettingRow/SettingRow', () => ({
  SettingRow: ({ label, children }: { label: string; children: ReactNode }) => (
    <div><span>{label}</span>{children}</div>
  ),
  SettingToggle: ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label>{label}<input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /></label>
  ),
}));

vi.mock('../../../../components/common/ChipGroup/ChipGroup', () => ({
  ChipGroup: ({ ariaLabel }: { ariaLabel?: string }) => <div data-testid="chipgroup">{ariaLabel}</div>,
}));

vi.mock('../../../../components/common/Button/Button', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}));

const lianli: HubComposition = {
  hubId: 'lianli', hubKind: 'lianli', portCount: 4,
  hasRingsAxis: true, hasPortToggle: false, hasMirror: false,
  mirror: false, combineRings: true, activePorts: [true, false, false, false],
};

const smarthub: HubComposition = {
  hubId: 'smarthub', hubKind: 'smarthub', portCount: 4,
  hasRingsAxis: false, hasPortToggle: false, hasMirror: true,
  mirror: false, combineRings: false, activePorts: [true, true, true, true],
};

describe('HubCompositionPanel', () => {
  it('hides mirror + ports and shows the device-settings button for Lian Li', () => {
    const onOpenDeviceSettings = vi.fn();
    render(
      <HubCompositionPanel composition={lianli} onChange={() => {}} onOpenDeviceSettings={onOpenDeviceSettings} />,
    );
    expect(screen.queryByText('lighting.ledMap.hubMirror')).toBeNull();
    expect(screen.queryByText('lighting.ledMap.hubPorts')).toBeNull();
    expect(screen.queryByTestId('chipgroup')).toBeNull();
    expect(screen.getByText('lighting.ledMap.hubCombineRings')).toBeTruthy();
    fireEvent.click(screen.getByText('lighting.ledMap.hubOpenDeviceSettings'));
    expect(onOpenDeviceSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps the mirror toggle and omits the button for SmartHub', () => {
    render(<HubCompositionPanel composition={smarthub} onChange={() => {}} />);
    expect(screen.getByText('lighting.ledMap.hubMirror')).toBeTruthy();
    expect(screen.queryByText('lighting.ledMap.hubCombineRings')).toBeNull();
    expect(screen.queryByText('lighting.ledMap.hubOpenDeviceSettings')).toBeNull();
  });
});
