import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import { DiagnosticsWidget } from './DiagnosticsWidget';

const live = vi.hoisted(() => ({
  health: null as unknown,
  rules: [] as unknown[],
  states: [] as unknown[],
}));

vi.mock('../../../hooks/useUiSettings', () => ({
  useFeatureFlags: () => ({ diagnostics: true }),
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', numberFormat: 'dot', monitoringWholeNumbers: false }),
}));

vi.mock('../../../hooks/useDiagnosticsHealth', () => ({
  useDiagnosticsHealth: () => ({ health: live.health }),
}));

vi.mock('../../../hooks/useSensorAlerts', () => ({
  useSensorAlerts: () => ({ rules: live.rules, states: live.states }),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
  }),
}));

const widget = (size: PanelWidget['size']): PanelWidget => ({ id: 'diag', type: 'diagnostics', size, col: 0, row: 0 });

function renderWidget(size: PanelWidget['size'], onSectionNavigate?: () => void) {
  return render(
    <PanelPreviewProvider value={true}>
      <DiagnosticsWidget widget={widget(size)} onSectionNavigate={onSectionNavigate} />
    </PanelPreviewProvider>,
  );
}

describe('DiagnosticsWidget', () => {
  it('renders one status dot per domain at 2x2', () => {
    renderWidget('2x2');
    expect(screen.getAllByRole('img').map(el => el.getAttribute('aria-label'))).toEqual([
      'diagnostics.kind.storage: diagnostics.status.ok',
      'diagnostics.kind.memory: diagnostics.status.ok',
      'diagnostics.tab.thermals: diagnostics.status.ok',
      'diagnostics.kind.system: diagnostics.status.ok',
    ]);
  });

  it('opens the matching diagnostics tab from each 4x2 button', () => {
    const onSectionNavigate = vi.fn();
    renderWidget('4x2', onSectionNavigate);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    fireEvent.click(screen.getByText('diagnostics.tab.thermals'));
    expect(onSectionNavigate).toHaveBeenCalledWith('diagnostics', { tab: 'cooling' });
  });

  it('renders plain blocks without a dashboard to navigate to', () => {
    renderWidget('4x2');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('diagnostics.kind.storage')).toBeTruthy();
  });

  describe('active sensor alert', () => {
    const alertHealth = {
      generatedAt: '2026-01-01T00:00:00Z', supported: true, overall: 'act',
      components: [{
        id: 'alert:r1', kind: 'alerts', name: 'CPU Package', status: 'act',
        reasons: [{ code: 'alerts.sensorThreshold', severity: 'act', summary: 'English service text', detail: 'ruleId=r1' }],
      }],
    };

    function renderLive(size: PanelWidget['size']) {
      live.health = alertHealth;
      live.rules = [{ id: 'r1', sensor: { category: 'cpu', id: 'x', name: 'CPU Package', type: 'Temperature', parentName: 'CPU' }, low: null, high: 90 }];
      live.states = [{ ruleId: 'r1', state: 'active', value: 95, direction: 'above', acknowledged: false }];
      return render(
        <PanelPreviewProvider value={false}>
          <DiagnosticsWidget widget={widget(size)} />
        </PanelPreviewProvider>,
      );
    }

    it('adds a localized alert line under the four tiles at 4x2', () => {
      renderLive('4x2');
      expect(screen.getByText('diagnostics.alerts.notice.above(name=CPU Package,limit=90°C,value=95°C)')).toBeTruthy();
      expect(screen.queryByText('English service text')).toBeNull();
    });

    it('shows the localized alert as the reason at 2x2', () => {
      renderLive('2x2');
      expect(screen.getByText('diagnostics.alerts.notice.above(name=CPU Package,limit=90°C,value=95°C)')).toBeTruthy();
    });

    it('words a finished alert as ended, from the ended limit and peak', () => {
      renderLive('4x2');
      live.states = [{ ruleId: 'r1', state: 'ok', value: 70, acknowledged: false, endedAt: '2026-01-01T00:00:00Z', endedPeak: 95, endedThreshold: 85, endedDirection: 'above' }];
      render(
        <PanelPreviewProvider value={false}>
          <DiagnosticsWidget widget={widget('4x2')} />
        </PanelPreviewProvider>,
      );
      expect(screen.getByText('diagnostics.alerts.banner.ended.above(name=CPU Package,limit=85°C,peak=95°C)')).toBeTruthy();
    });

    it('falls back to the service text before the alert rules load', () => {
      live.health = alertHealth;
      live.rules = [];
      live.states = [];
      render(
        <PanelPreviewProvider value={false}>
          <DiagnosticsWidget widget={widget('4x2')} />
        </PanelPreviewProvider>,
      );
      expect(screen.getByText('English service text')).toBeTruthy();
    });
  });
});
