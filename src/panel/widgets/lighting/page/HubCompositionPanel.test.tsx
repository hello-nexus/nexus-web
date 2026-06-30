import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HubCompositionPanel } from './HubCompositionPanel';
import type { HubComposition } from '../../../../api/lighting';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../../components/common/Toggle/Toggle', () => ({
  Toggle: ({ checked, onChange, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; ariaLabel?: string }) => (
    <button type="button" role="switch" aria-checked={checked} aria-label={ariaLabel} onClick={() => onChange(!checked)} />
  ),
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
  it('shows the ring toggle, fan count, and device-settings button for Lian Li', () => {
    const onOpenDeviceSettings = vi.fn();
    render(
      <HubCompositionPanel
        composition={lianli}
        onChange={() => {}}
        fanCount={2}
        onOpenDeviceSettings={onOpenDeviceSettings}
      />,
    );
    expect(screen.queryByText('lighting.ledMap.hubMirror')).toBeNull();
    expect(screen.getByText('lighting.ledMap.hubCombineRings')).toBeTruthy();
    expect(screen.getByText('lighting.ledMap.hubFanCount')).toBeTruthy();
    fireEvent.click(screen.getByText('lighting.ledMap.hubOpenDeviceSettings'));
    expect(onOpenDeviceSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps the mirror toggle and omits fan count + button for SmartHub', () => {
    render(<HubCompositionPanel composition={smarthub} onChange={() => {}} />);
    expect(screen.getByText('lighting.ledMap.hubMirror')).toBeTruthy();
    expect(screen.queryByText('lighting.ledMap.hubCombineRings')).toBeNull();
    expect(screen.queryByText('lighting.ledMap.hubFanCount')).toBeNull();
    expect(screen.queryByText('lighting.ledMap.hubOpenDeviceSettings')).toBeNull();
  });
});
