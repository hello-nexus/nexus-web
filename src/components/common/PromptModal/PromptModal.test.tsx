import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PromptModal } from './PromptModal';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderModal(props: Partial<Parameters<typeof PromptModal>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <PromptModal
      open
      title="Title"
      message="Enter a name"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { ...view, onConfirm, onCancel };
}

describe('PromptModal', () => {
  it('calls a sync void onConfirm and does not show an error', () => {
    const { onConfirm } = renderModal();

    fireEvent.change(screen.getByLabelText('Enter a name'), { target: { value: 'Streaming' } });
    fireEvent.click(screen.getByText('confirm.ok'));

    expect(onConfirm).toHaveBeenCalledWith('Streaming');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the resolved error immediately for an async onConfirm that rejects with a message', async () => {
    const onConfirm = vi.fn().mockResolvedValue('Name already taken');
    renderModal({ onConfirm });

    fireEvent.change(screen.getByLabelText('Enter a name'), { target: { value: 'Streaming' } });
    fireEvent.click(screen.getByText('confirm.ok'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Name already taken'));
    expect(screen.getByLabelText('Enter a name')).toBeInTheDocument();
  });

  it('shows no error for an async onConfirm that resolves to void (success)', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderModal({ onConfirm });

    fireEvent.change(screen.getByLabelText('Enter a name'), { target: { value: 'Streaming' } });
    fireEvent.click(screen.getByText('confirm.ok'));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Streaming'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error returned synchronously from onConfirm', () => {
    const onConfirm = vi.fn().mockReturnValue('Name already taken');
    renderModal({ onConfirm });

    fireEvent.change(screen.getByLabelText('Enter a name'), { target: { value: 'Streaming' } });
    fireEvent.click(screen.getByText('confirm.ok'));

    expect(screen.getByRole('alert')).toHaveTextContent('Name already taken');
  });

  it('disables the confirm button while an async onConfirm is pending, and re-enables it once it settles', async () => {
    let resolve!: (v: string | undefined) => void;
    const onConfirm = vi.fn(() => new Promise<string | undefined>(r => { resolve = r; }));
    renderModal({ onConfirm });

    fireEvent.change(screen.getByLabelText('Enter a name'), { target: { value: 'Streaming' } });
    const confirmBtn = screen.getByText('confirm.ok');
    fireEvent.click(confirmBtn);

    expect(confirmBtn).toBeDisabled();

    resolve(undefined);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('does not call onConfirm when the client-side validate rejects the value', () => {
    const onConfirm = vi.fn();
    renderModal({ onConfirm, validate: v => (v === 'taken' ? 'Already taken' : null) });

    fireEvent.change(screen.getByLabelText('Enter a name'), { target: { value: 'taken' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Already taken');
    expect(screen.getByText('confirm.ok')).toBeDisabled();
    fireEvent.click(screen.getByText('confirm.ok'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ignores a stale async onConfirm result from a cancelled-then-reopened session', async () => {
    let resolve!: (v: string | undefined) => void;
    const onConfirm = vi.fn(() => new Promise<string | undefined>(r => { resolve = r; }));
    const onCancel = vi.fn();
    const props = { title: 'Title', message: 'Enter a name', onConfirm, onCancel };
    const { rerender } = render(<PromptModal open {...props} />);

    fireEvent.change(screen.getByLabelText('Enter a name'), { target: { value: 'Streaming' } });
    fireEvent.click(screen.getByText('confirm.ok'));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Cancel (parent closes) and reopen before the pending promise resolves.
    rerender(<PromptModal open={false} {...props} />);
    rerender(<PromptModal open {...props} />);

    await act(async () => {
      resolve('Stale error');
      await Promise.resolve();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Reopened with a fresh (empty) value, so the button is disabled for that
    // reason alone - typing proves it isn't ALSO stuck by the stale `submitting`.
    fireEvent.change(screen.getByLabelText('Enter a name'), { target: { value: 'Work' } });
    expect(screen.getByText('confirm.ok')).not.toBeDisabled();
  });
});
