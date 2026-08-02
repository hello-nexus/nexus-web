import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SharingSection, type SharingSectionProps } from './SharingSection';
import { PROFILE_CATEGORIES } from '../../../api/profiles';

function makeProps(overrides: Partial<SharingSectionProps> = {}): SharingSectionProps {
  return {
    profiles: {
      profiles: [{ id: 'a', name: 'Gaming', createdAt: '', updatedAt: '' }],
      activeId: 'a',
    } as SharingSectionProps['profiles'],
    sharing: { setCategoryShared: vi.fn() } as unknown as SharingSectionProps['sharing'],
    primaryId: 'a',
    sharedCats: [],
    counts: {},
    onlyOneProfile: false,
    onResetCategory: vi.fn(),
    onShareCategory: vi.fn(),
    ...overrides,
  };
}

// No I18nProvider is mounted, so t() echoes keys and a chip's text is its key.
const chipsOf = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLButtonElement>('button.chip-action')];

const rowChips = (container: HTMLElement, category: string) => {
  const group = container.querySelector<HTMLElement>(
    `[role="group"][aria-label="settings.profiles.sharing.cat.${category}.label"]`,
  );
  const buttons = [...(group?.querySelectorAll<HTMLButtonElement>('button.chip-action') ?? [])];
  return {
    perProfile: buttons.find(b => b.textContent?.includes('perProfile'))!,
    shared: buttons.find(b => b.textContent?.includes('shared'))!,
  };
};

describe('SharingSection', () => {
  // Matches the Theme tab, which renders its choices as ChipGroup chips.
  it('renders each category choice as a chip pair', () => {
    const { container } = render(<SharingSection {...makeProps()} />);

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    // One pair per category.
    expect(chipsOf(container)).toHaveLength(PROFILE_CATEGORIES.length * 2);
    expect(chipsOf(container).every(el => el.hasAttribute('aria-pressed'))).toBe(true);
  });

  it('presses the shared chip only on the shared category', () => {
    const { container } = render(<SharingSection {...makeProps({ sharedCats: ['lighting'] })} />);

    const lighting = rowChips(container, 'lighting');
    expect(lighting.shared.getAttribute('aria-pressed')).toBe('true');
    expect(lighting.perProfile.getAttribute('aria-pressed')).toBe('false');

    const cooling = rowChips(container, 'cooling');
    expect(cooling.shared.getAttribute('aria-pressed')).toBe('false');
    expect(cooling.perProfile.getAttribute('aria-pressed')).toBe('true');
  });

  it('shares a category when its shared chip is clicked', () => {
    const onShareCategory = vi.fn();
    const { container } = render(<SharingSection {...makeProps({ onShareCategory })} />);

    fireEvent.click(rowChips(container, 'lighting').shared);

    expect(onShareCategory).toHaveBeenCalledWith('lighting');
  });

  it('un-shares a shared category when its per-profile chip is clicked', () => {
    const setCategoryShared = vi.fn();
    const sharing = { setCategoryShared } as unknown as SharingSectionProps['sharing'];
    const { container } = render(
      <SharingSection {...makeProps({ sharing, sharedCats: ['lighting'] })} />,
    );

    fireEvent.click(rowChips(container, 'lighting').perProfile);

    expect(setCategoryShared).toHaveBeenCalledWith('lighting', false);
  });

  it('disables both chips when only one profile exists', () => {
    const { container } = render(<SharingSection {...makeProps({ onlyOneProfile: true })} />);

    expect(chipsOf(container)).toHaveLength(PROFILE_CATEGORIES.length * 2);
    expect(chipsOf(container).every(el => el.disabled)).toBe(true);
  });
});
