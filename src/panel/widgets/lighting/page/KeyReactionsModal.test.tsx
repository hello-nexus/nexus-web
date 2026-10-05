import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_KEY_REACTION } from '../../../../api/keyReactive';
import { KeyReactionsModal } from './KeyReactionsModal';

const api = vi.hoisted(() => ({
  put: vi.fn(),
  press: vi.fn(),
  preview: vi.fn(),
}));

vi.mock('../../../../api/keyReactive', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../api/keyReactive')>()),
  putKeyReaction: api.put,
  pressKeyReaction: api.press,
  fetchKeyReactionPreview: api.preview,
}));

describe('KeyReactionsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    api.put.mockImplementation(async (_id: string, cfg: unknown) => cfg);
    api.press.mockResolvedValue({ ok: true });
    api.preview.mockResolvedValue(null);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('wraps the shared editor with the title, device name and a working close', async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(
        <KeyReactionsModal
          cardId="kb1"
          deviceName="Keeb"
          initialConfig={DEFAULT_KEY_REACTION}
          inputAvailable
          hardwareKeys={false}
          frameIndex={0}
          stream={{ connected: false, live: false }}
          onClose={onClose}
        />,
      );
    });
    // The modal title, and the editor's on/off row.
    expect(screen.getAllByText('lighting.keyReactions.title')).toHaveLength(2);
    expect(screen.getByRole('switch', { name: 'lighting.keyReactions.title' })).toBeInTheDocument();
    expect(screen.getByText('Keeb')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'lighting.keyReactions.effect' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('writes a pending edit before it reports the close', async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(
        <KeyReactionsModal
          cardId="kb1"
          deviceName="Keeb"
          initialConfig={DEFAULT_KEY_REACTION}
          inputAvailable
          hardwareKeys={false}
          frameIndex={0}
          stream={{ connected: false, live: false }}
          onClose={onClose}
        />,
      );
    });
    // Inside the save debounce: nothing written yet.
    fireEvent.click(screen.getByRole('switch', { name: 'lighting.keyReactions.title' }));
    expect(api.put).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put.mock.calls[0][1]).toMatchObject({ enabled: !DEFAULT_KEY_REACTION.enabled });
    expect(api.put.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
  });
});
