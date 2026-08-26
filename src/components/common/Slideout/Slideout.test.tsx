import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Slideout } from './Slideout';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('Slideout', () => {
  it('renders nothing when closed', () => {
    render(<Slideout open={false} onClose={vi.fn()} title="Details">Body</Slideout>);
    expect(screen.queryByText('Body')).toBeNull();
  });

  it('renders the title, icon, headerRight, and children when open', () => {
    render(
      <Slideout open onClose={vi.fn()} title="Details" icon={<span>icon</span>} headerRight={<span>extra</span>}>
        Body content
      </Slideout>,
    );
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('icon')).toBeInTheDocument();
    expect(screen.getByText('extra')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('calls onClose when the close button is pressed', () => {
    const onClose = vi.fn();
    render(<Slideout open onClose={onClose} title="Details">Body</Slideout>);
    fireEvent.click(screen.getByRole('button', { name: 'app.window.close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<Slideout open onClose={onClose} title="Details">Body</Slideout>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on a backdrop click but not on a click inside the sheet', () => {
    const onClose = vi.fn();
    render(<Slideout open onClose={onClose} title="Details">Body content</Slideout>);
    fireEvent.click(screen.getByText('Body content'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape while noEscDismiss is set', () => {
    const onClose = vi.fn();
    render(<Slideout open onClose={onClose} title="Details" noEscDismiss>Body</Slideout>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('anchors to the right edge via the sheet variant (Overlay.module.scss backdropSheet), not the dialog/alert variant', () => {
    render(<Slideout open onClose={vi.fn()} title="Details">Body</Slideout>);
    const backdrop = screen.getByRole('dialog');
    expect(backdrop.className).toMatch(/backdropSheet/);
    expect(backdrop.className).not.toMatch(/backdropDialog/);
  });

  it('docks and slides from the left when side is "left"', () => {
    const { container } = render(
      <Slideout open onClose={vi.fn()} title="Details" side="left" className="consumer">
        Body
      </Slideout>,
    );
    const sheet = container.ownerDocument.querySelector('.consumer');
    expect(sheet).not.toBeNull();
    expect(sheet?.className).toContain('sheetLeft');
    expect(sheet?.parentElement?.className).toContain('backdropLeft');
  });
});
