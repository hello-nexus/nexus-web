import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SharingSection, type SharingSectionProps } from './SharingSection';
import { PROFILE_CATEGORIES } from '../../../api/profiles';

// Keys echo as-is (what an unprovided t() already does), except the explain
// sentence: its {primary} token is what selects the inline-name branch.
const EXPLAIN = "When a category is Shared, every profile uses {primary}'s value.";
vi.mock('../../../lib/i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../lib/i18n')>()),
  useTranslation: () => ({
    t: (key: string) => (key === 'settings.profiles.sharing.explainV2' ? EXPLAIN : key),
    language: 'en',
  }),
}));

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
    `[role="radiogroup"][aria-label="settings.profiles.sharing.cat.${category}.label"]`,
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
    expect(chipsOf(container).every(el => el.getAttribute('role') === 'radio')).toBe(true);
    expect(chipsOf(container).every(el => el.hasAttribute('aria-checked'))).toBe(true);
  });

  it('checks the shared chip only on the shared category', () => {
    const { container } = render(<SharingSection {...makeProps({ sharedCats: ['lighting'] })} />);

    const lighting = rowChips(container, 'lighting');
    expect(lighting.shared.getAttribute('aria-checked')).toBe('true');
    expect(lighting.perProfile.getAttribute('aria-checked')).toBe('false');

    const cooling = rowChips(container, 'cooling');
    expect(cooling.shared.getAttribute('aria-checked')).toBe('false');
    expect(cooling.perProfile.getAttribute('aria-checked')).toBe('true');
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

  // SettingsSection's description is a flex column, so every direct child lands
  // on its own line. The sentence has to be one block or the profile name
  // breaks onto a line of its own mid-sentence.
  it('keeps the primary profile name inline in the explanation', () => {
    const { container } = render(<SharingSection {...makeProps()} />);

    const name = [...container.querySelectorAll<HTMLElement>('span')]
      .find(el => el.textContent === 'Gaming');
    expect(name).toBeDefined();
    expect(name!.parentElement?.tagName).toBe('P');
    // The text either side of the name shares that one block with it.
    expect(name!.parentElement?.textContent).toBe(EXPLAIN.replace('{primary}', 'Gaming'));
  });

  it('disables both chips when only one profile exists', () => {
    const { container } = render(<SharingSection {...makeProps({ onlyOneProfile: true })} />);

    expect(chipsOf(container)).toHaveLength(PROFILE_CATEGORIES.length * 2);
    expect(chipsOf(container).every(el => el.disabled)).toBe(true);
  });
});
