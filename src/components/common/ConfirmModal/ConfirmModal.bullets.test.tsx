import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfirmModal } from './ConfirmModal';

// jsdom does not resolve ::marker, so the warning marker colour itself is not asserted here;
// the DOM shape that the stylesheet colours is.
describe('ConfirmModal bullets', () => {
  const base = { open: true, title: 'T', message: 'M', onConfirm: () => {}, onCancel: () => {} };

  it('renders plain bullets by default', () => {
    render(<ConfirmModal {...base} bullets={['one', 'two']} />);
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['one', 'two']);
    expect(screen.getAllByRole('listitem')[0].querySelector('span')).toBeNull();
  });

  it('wraps each warning bullet text so the marker can take the warning colour', () => {
    render(<ConfirmModal {...base} bullets={['one']} bulletTone="warning" size="wide" />);
    expect(screen.getByRole('listitem').querySelector('span')?.textContent).toBe('one');
  });
});
