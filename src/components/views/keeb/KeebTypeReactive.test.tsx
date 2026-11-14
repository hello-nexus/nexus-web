// Passive Lighting card on the Keeb Settings tab: with Lighting off the engine
// lists no keyboard card, so the "connect the keyboard" text must not appear
// (the page-top Lighting notice explains instead).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { KeebTypeReactive } from './KeebTypeReactive';

const m = vi.hoisted(() => ({ lighting: true, fetchState: vi.fn() }));

vi.mock('../../../api/keyReactive', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/keyReactive')>()),
  fetchKeyReactive: m.fetchState,
}));

vi.mock('../../../hooks/useUiSettings', () => ({
  useFeatureFlags: () => ({ lighting: m.lighting, cooling: true, monitoring: true, diagnostics: true }),
}));

vi.mock('../../../hooks/useLightingFrames', () => ({
  useLightingFrames: () => ({ connected: false, live: false }),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  m.lighting = true;
  m.fetchState.mockResolvedValue({ inputAvailable: true, devices: [] });
});
afterEach(() => { cleanup(); });

describe('KeebTypeReactive without a keyboard card', () => {
  it('shows the missing-keyboard text when Lighting is on', async () => {
    render(<KeebTypeReactive />);
    expect(await screen.findByText('keeb.settings.typeReactiveMissing')).toBeInTheDocument();
  });

  it('renders nothing when Lighting is off', async () => {
    m.lighting = false;
    const { container } = render(<KeebTypeReactive />);
    await waitFor(() => expect(m.fetchState).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByText('keeb.settings.typeReactiveMissing')).toBeNull();
    expect(screen.queryByText('keeb.settings.passive.title')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
