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

  it('a disabled card ignores clicks and keys, as a button or a div', () => {
    const onClick = vi.fn();
    const { getByRole, rerender } = render(<EffectCard label="Glitch Garden" thumbUrl={null} active={false} disabled onClick={onClick} />);
    fireEvent.click(getByRole('button'));
    rerender(<EffectCard label="Glitch Garden" thumbUrl={null} active={false} disabled asDiv onClick={onClick} />);
    fireEvent.click(getByRole('button'));
    fireEvent.keyDown(getByRole('button'), { key: 'Enter' });
    expect(getByRole('button').getAttribute('aria-disabled')).toBe('true');
    expect(onClick).not.toHaveBeenCalled();
  });
});
