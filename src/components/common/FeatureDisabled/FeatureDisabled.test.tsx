import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureDisabled, FeatureGate } from './FeatureDisabled';
import type { FeatureFlags, FeatureKey } from '../../../hooks/useUiSettings';

const mockUpdate = vi.fn();
let mockFlags: FeatureFlags = { lighting: true, cooling: true, monitoring: true, diagnostics: true };

vi.mock('../../../hooks/useUiSettings', () => ({
  useFeatureFlags: () => mockFlags,
  useUiSettingsUpdateSafe: () => mockUpdate,
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  mockUpdate.mockClear();
  mockFlags = { lighting: true, cooling: true, monitoring: true, diagnostics: true };
});

const CASES: { feature: FeatureKey; titleKey: string; settingsKey: string }[] = [
  { feature: 'lighting', titleKey: 'lighting.title', settingsKey: 'featureLightingEnabled' },
  { feature: 'cooling', titleKey: 'cooling.title', settingsKey: 'featureCoolingEnabled' },
  { feature: 'monitoring', titleKey: 'nav.monitoring', settingsKey: 'featureMonitoringEnabled' },
  { feature: 'diagnostics', titleKey: 'diagnostics.title', settingsKey: 'featureDiagnosticsEnabled' },
];

describe('FeatureDisabled', () => {
  it.each(CASES)('renders the $feature title and hint', ({ feature, titleKey }) => {
    render(<FeatureDisabled feature={feature} />);
    expect(screen.getByRole('heading', { name: titleKey })).toBeInTheDocument();
    expect(screen.getByText(`featureDisabled.hint.${feature}`)).toBeInTheDocument();
  });

  it.each(CASES)('re-enabling $feature patches only that flag on', ({ feature, settingsKey }) => {
    render(<FeatureDisabled feature={feature} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(mockUpdate).toHaveBeenCalledWith({ [settingsKey]: true });
  });
});

describe('FeatureGate', () => {
  it('renders its children when the feature is enabled', () => {
    mockFlags = { ...mockFlags, lighting: true };
    render(<FeatureGate feature="lighting"><div>live page</div></FeatureGate>);
    expect(screen.getByText('live page')).toBeInTheDocument();
  });

  it('renders the disabled shell instead of its children when the feature is off', () => {
    mockFlags = { ...mockFlags, lighting: false };
    render(<FeatureGate feature="lighting"><div>live page</div></FeatureGate>);
    expect(screen.queryByText('live page')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'lighting.title' })).toBeInTheDocument();
  });
});
