import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LED_COLOR_PRESETS, LedColorLockSection } from './LedColorLockSection';

// t() is uninitialised under vitest and returns the raw key.
const FOLLOW = 'lighting.ledMap.colorFollowEffect';
const CLEAR_ALL = 'lighting.ledMap.colorClearAll';

function renderSection(props: Partial<Parameters<typeof LedColorLockSection>[0]> = {}) {
  const handlers = {
    onPreview: vi.fn(), onCommit: vi.fn(), onClearSelected: vi.fn(), onClearAll: vi.fn(),
  };
  render(
    <LedColorLockSection selectedCount={0} selectedColor="" lockedCount={0} {...handlers} {...props} />,
  );
  return handlers;
}

describe('LedColorLockSection', () => {
  it('renders nothing with no selection and no locks', () => {
    renderSection();
    expect(screen.queryByText('lighting.ledMap.color')).toBeNull();
  });

  it('commits a preset for the selection and unlocks through the follow-effect swatch', () => {
    const h = renderSection({ selectedCount: 2, selectedColor: '#ff0000' });
    fireEvent.click(screen.getByLabelText(LED_COLOR_PRESETS[5]));
    expect(h.onCommit).toHaveBeenCalledWith(LED_COLOR_PRESETS[5]);

    const follow = screen.getByLabelText(FOLLOW);
    expect(follow.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(follow);
    expect(h.onClearSelected).toHaveBeenCalled();
  });

  it('reads as following the effect when no selected LED holds a colour', () => {
    renderSection({ selectedCount: 1, selectedColor: '' });
    expect(screen.getByLabelText(FOLLOW).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText(LED_COLOR_PRESETS[0]).getAttribute('aria-pressed')).toBe('false');
  });

  it('offers clear-all for the zone when nothing is selected', () => {
    const h = renderSection({ lockedCount: 3 });
    fireEvent.click(screen.getByText(CLEAR_ALL));
    expect(h.onClearAll).toHaveBeenCalled();
  });

  it('asks for a save first on an unsaved zone, with nothing selected too', () => {
    renderSection({ draft: true });
    expect(screen.getByText('lighting.ledMap.colorSaveFirst')).toBeTruthy();
  });

  it('greys the picker on an unsaved zone', () => {
    const h = renderSection({ draft: true, selectedCount: 2 });
    fireEvent.click(screen.getByLabelText(LED_COLOR_PRESETS[0]));
    expect(h.onCommit).not.toHaveBeenCalled();
  });
});
