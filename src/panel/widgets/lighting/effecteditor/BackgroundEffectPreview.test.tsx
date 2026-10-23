import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundEffectPreview } from './BackgroundEffectPreview';

vi.mock('../../../../hooks/useShaderRenderer', () => ({ useShaderRenderer: () => ({ ready: true, error: null }) }));
vi.mock('../../../../hooks/useShaderParams', () => ({ useShaderParams: () => ({ specs: {}, sensors: [], loaded: true }) }));
vi.mock('../../../../hooks/useAudioState', () => ({
  useAudioState: (enabled: boolean) => { service.audioEnabled.push(enabled); return { current: null }; },
}));
const platform = vi.hoisted(() => ({ value: 'windows' }));
const service = vi.hoisted(() => ({ music: true, writes: [] as boolean[], audioEnabled: [] as boolean[] }));
vi.mock('../../../../api/lighting', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../api/lighting')>()),
  fetchMusicReactive: () => Promise.resolve({ enabled: service.music }),
  setMusicReactive: (enabled: boolean) => { service.music = enabled; service.writes.push(enabled); return Promise.resolve({}); },
}));
vi.mock('../../../../hooks/useServicePlatform', () => ({ useServicePlatform: () => platform.value }));
vi.mock('../../../../hooks/useLightingAudioOutput', () => ({
  useLightingAudioOutput: () => ({
    value: 'output:',
    options: [
      { value: '', label: 'Output', header: true },
      { value: 'output:', label: 'Speakers' },
      { value: 'output:hp', label: 'Headphones' },
    ],
    select: vi.fn(),
  }),
}));

const base = { effect: 'spectrumbars', template: 0 };

describe('BackgroundEffectPreview audio source picker', () => {
  beforeEach(() => { platform.value = 'windows'; service.music = true; service.writes.length = 0; service.audioEnabled.length = 0; });

  it('mounts the music button and source picker over the preview when audio is allowed', async () => {
    render(<BackgroundEffectPreview {...base} audioReactive />);
    await screen.findByRole('button', { name: 'lighting.audioOutput.label' });
    expect(screen.getByRole('button', { name: 'lighting.musicReactive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'lighting.audioOutput.label' })).toBeInTheDocument();
  });

  it('renders the open menu outside the preview overflow container', async () => {
    const { container } = render(<BackgroundEffectPreview {...base} audioReactive />);
    fireEvent.click(await screen.findByRole('button', { name: 'lighting.audioOutput.label' }));
    const menu = screen.getByRole('listbox');
    expect(container.contains(menu)).toBe(false);
    expect(menu.closest('body > div:not([data-testid])')?.parentElement).toBe(document.body);
    expect(menu.closest('[class*="preview"]')).toBeNull();
  });

  it('keeps the music button but drops the source picker off Windows', async () => {
    platform.value = 'macos';
    render(<BackgroundEffectPreview {...base} audioReactive />);
    expect(await screen.findByRole('button', { name: 'lighting.musicReactive' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'lighting.audioOutput.label' })).toBeNull();
  });

  it('flips the shared Music Reactive state from the preview, dropping the picker and the audio subscription', async () => {
    render(<BackgroundEffectPreview {...base} audioReactive />);
    const note = await screen.findByRole('button', { name: 'lighting.musicReactive' });
    await waitFor(() => expect(note.getAttribute('aria-pressed')).toBe('true'));
    expect(service.audioEnabled.at(-1)).toBe(true);

    fireEvent.click(note);
    await waitFor(() => expect(service.writes).toEqual([false]));
    await waitFor(() => expect(note.getAttribute('aria-pressed')).toBe('false'));
    expect(screen.queryByRole('button', { name: 'lighting.audioOutput.label' })).toBeNull();
    expect(service.audioEnabled.at(-1)).toBe(false);
  });

  it('shows no picker when audio is not allowed or the effect is not audio', () => {
    const { rerender } = render(<BackgroundEffectPreview {...base} />);
    expect(screen.queryByRole('button', { name: 'lighting.musicReactive' })).toBeNull();
    rerender(<BackgroundEffectPreview effect="plasma" template={0} audioReactive />);
    expect(screen.queryByRole('button', { name: 'lighting.musicReactive' })).toBeNull();
  });
});
