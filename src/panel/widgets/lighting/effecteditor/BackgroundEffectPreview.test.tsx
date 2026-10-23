import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackgroundEffectPreview } from './BackgroundEffectPreview';

vi.mock('../../../../hooks/useShaderRenderer', () => ({ useShaderRenderer: () => ({ ready: true, error: null }) }));
vi.mock('../../../../hooks/useShaderParams', () => ({ useShaderParams: () => ({ specs: {}, sensors: [], loaded: true }) }));
vi.mock('../../../../hooks/useAudioState', () => ({ useAudioState: () => ({ current: null }) }));
vi.mock('../../../../lib/platform', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../lib/platform')>()),
  detectOS: () => 'windows',
}));
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
  it('mounts the music button and source picker over the preview when audio is allowed', () => {
    render(<BackgroundEffectPreview {...base} audioReactive />);
    expect(screen.getByRole('button', { name: 'lighting.musicReactive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'lighting.audioOutput.label' })).toBeInTheDocument();
  });

  it('renders the open menu outside the preview overflow container', () => {
    const { container } = render(<BackgroundEffectPreview {...base} audioReactive />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.audioOutput.label' }));
    const menu = screen.getByRole('listbox');
    expect(container.contains(menu)).toBe(false);
    expect(menu.closest('body > div:not([data-testid])')?.parentElement).toBe(document.body);
    expect(menu.closest('[class*="preview"]')).toBeNull();
  });

  it('shows no picker when audio is not allowed or the effect is not audio', () => {
    const { rerender } = render(<BackgroundEffectPreview {...base} />);
    expect(screen.queryByRole('button', { name: 'lighting.musicReactive' })).toBeNull();
    rerender(<BackgroundEffectPreview effect="plasma" template={0} audioReactive />);
    expect(screen.queryByRole('button', { name: 'lighting.musicReactive' })).toBeNull();
  });
});
