import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ViewSwitch } from './ViewSwitch';

const labels = { '2d': 'Layout', '3d': 'Desk' };

describe('ViewSwitch', () => {
  it('shows a 2D and a 3D pill before each label, with no bracket characters', () => {
    render(<ViewSwitch ariaLabel="View" value="2d" onChange={() => {}} labels={labels} />);
    const [a, b] = screen.getAllByRole('radio');
    expect(a.textContent).toBe('lighting.scene.view.2dLayout');
    expect(b.textContent).toBe('lighting.scene.view.3dDesk');
    expect(`${a.textContent}${b.textContent}`).not.toMatch(/[[\]()]/);
    expect(a.querySelector('svg')).toBeNull();
    expect(b.querySelector('svg')).toBeNull();
    expect(a.querySelector('span')?.className).toBe(b.querySelector('span')?.className);
  });

  it('marks the shown view checked and reports a pick', () => {
    const onChange = vi.fn();
    render(<ViewSwitch ariaLabel="View" value="3d" onChange={onChange} labels={labels} />);
    const [a, b] = screen.getAllByRole('radio');
    expect(b.getAttribute('aria-checked')).toBe('true');
    expect(a.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(a);
    expect(onChange).toHaveBeenCalledWith('2d');
  });
});
