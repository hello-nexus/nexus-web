import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StarterPicker } from './StarterPicker';
import { STARTER_GROUPS, STUDIO_STARTERS } from './studioRecipes';

vi.mock('../../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const open = () => fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.starters' }));

describe('StarterPicker', () => {
  it('lists every starter in exactly one category', () => {
    const grouped = STARTER_GROUPS.flatMap(g => g.ids);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(STUDIO_STARTERS.map(s => s.id).sort());
  });

  it('shows the categories as headers over the starters, with the search on top', () => {
    render(<StarterPicker onPick={() => {}} />);
    open();
    expect(screen.getByRole('textbox', { name: 'lighting.effects.search' })).toBeInTheDocument();
    for (const g of STARTER_GROUPS) expect(screen.getByText(`lighting.category.${g.key}`)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^lighting\.studio\.starter\./ })).toHaveLength(STUDIO_STARTERS.length);
  });

  it('filters across categories by name and hides the ones left empty', () => {
    render(<StarterPicker onPick={() => {}} />);
    open();
    fireEvent.change(screen.getByRole('textbox', { name: 'lighting.effects.search' }), { target: { value: 'sensorBar' } });
    expect(screen.getAllByRole('button', { name: /^lighting\.studio\.starter\./ })).toHaveLength(1);
    expect(screen.getByText('lighting.category.sensor')).toBeInTheDocument();
    expect(screen.queryByText('lighting.category.pattern')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'lighting.effects.search' }), { target: { value: 'zzzz' } });
    expect(screen.getByText('lighting.effects.noMatches')).toBeInTheDocument();
  });

  it('hands the picked starter over and closes', () => {
    const onPick = vi.fn();
    render(<StarterPicker onPick={onPick} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.starter.vuMeter' }));
    expect(onPick).toHaveBeenCalledWith('vuMeter');
    expect(screen.queryByRole('textbox', { name: 'lighting.effects.search' })).toBeNull();
  });

  it('cannot be opened while disabled', () => {
    render(<StarterPicker disabled onPick={() => {}} />);
    expect(screen.getByRole('button', { name: 'lighting.studio.starters' })).toBeDisabled();
    expect(within(document.body).queryByRole('textbox')).toBeNull();
  });
});
