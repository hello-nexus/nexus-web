import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EffectCard } from './EffectCard';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('EffectCard', () => {
  it('drops an image that fails to load for the plain tile, and shows the next one', () => {
    const { container, rerender } = render(<EffectCard label="Glitch Garden" thumbUrl="blob:gone" onClick={() => {}} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    rerender(<EffectCard label="Glitch Garden" thumbUrl="blob:fresh" onClick={() => {}} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:fresh');
  });

  it('shows a name as given when asked to keep its case', () => {
    const { getByText, rerender } = render(<EffectCard label="vid.mp4" keepCase onClick={() => {}} />);
    expect(getByText('vid.mp4').className).toMatch(/labelAsIs/);
    rerender(<EffectCard label="vid.mp4" onClick={() => {}} />);
    expect(getByText('vid.mp4').className).not.toMatch(/labelAsIs/);
  });

  // An extreme aspect (a tall Y70 or portrait panel) is clamped by the box's max height, and the
  // image fills that box and crops, so it never spills out of the card. jsdom drops aspect-ratio itself.
  it.each([1, 720 / 1280, 734 / 2560, 1600 / 720])('clamps the thumbnail box and crops the image at aspect %s', aspect => {
    const { container } = render(<EffectCard label="a" thumbUrl="blob:x" thumbAspect={aspect} onClick={() => {}} />);
    const img = container.querySelector('img')!;
    expect(img.style.objectFit).toBe('cover');
    expect(img.style.height).toBe('100%');
    expect((img.parentElement as HTMLElement).style.maxHeight).toBe('360px');
  });

  it('clips the thumbnail to a circle only when asked', () => {
    const round = render(<EffectCard label="a" thumbUrl="blob:x" thumbAspect={1} thumbRound onClick={() => {}} />);
    const img = round.container.querySelector('img')!;
    expect(img.style.borderRadius).toBe('50%');
    expect((img.parentElement as HTMLElement).style.borderRadius).toBe('50%');
    expect((img.parentElement as HTMLElement).style.overflow).toBe('hidden');
    round.unmount();
    const square = render(<EffectCard label="a" thumbUrl="blob:x" thumbAspect={1} onClick={() => {}} />);
    expect(square.container.querySelector('img')!.style.borderRadius).toBe('');
  });
});
