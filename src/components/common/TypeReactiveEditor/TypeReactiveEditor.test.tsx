import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_KEY_REACTION, type KeyReaction } from '../../../api/keyReactive';
import { publishLedFrame, clearLedFrame } from '../../../lib/ledFrameStore';
import {
  TypeReactiveEditor,
  useTypeReactiveConfig,
  type TypeReactiveEditorProps,
} from './TypeReactiveEditor';

const api = vi.hoisted(() => ({
  put: vi.fn(),
  press: vi.fn(),
  preview: vi.fn(),
  tunnel: vi.fn(() => false),
}));

vi.mock('../../../api/service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/service')>()),
  isTunnelActive: () => api.tunnel(),
}));

vi.mock('../../../api/keyReactive', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/keyReactive')>()),
  putKeyReaction: api.put,
  pressKeyReaction: api.press,
  fetchKeyReactionPreview: api.preview,
}));

const PREVIEW = {
  x: [0, 1], y: [0, 0], width: 2, height: 1, fps: 30, frameCount: 1,
  frames: btoa(String.fromCharCode(255, 0, 0, 0, 255, 0)),
};

const STREAM_UP = { connected: true, live: true };
const STREAM_DOWN = { connected: false, live: false };

type HarnessProps = Omit<TypeReactiveEditorProps, 'controller'> & { initialConfig: KeyReaction };

/** Host the way the modal and the keeb page do: the hook, then the editor. */
function Harness({ initialConfig, ...props }: HarnessProps) {
  const controller = useTypeReactiveConfig(props.cardId, initialConfig);
  return <TypeReactiveEditor {...props} controller={controller} />;
}

async function renderEditor(
  config: Partial<KeyReaction> = {},
  inputAvailable = true,
  extra: Partial<HarnessProps> = {},
) {
  await act(async () => {
    render(
      <Harness
        cardId="kb1"
        initialConfig={{ ...DEFAULT_KEY_REACTION, enabled: true, ...config }}
        inputAvailable={inputAvailable}
        hardwareKeys={false}
        frameIndex={3}
        stream={STREAM_DOWN}
        {...extra}
      />,
    );
  });
}

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const tile = (effect: string) => screen.getByRole('button', { name: `lighting.keyReactions.effects.${effect}.name` });

describe('TypeReactiveEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // jsdom has no 2d context; the board simply skips drawing.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    api.put.mockImplementation(async (_id: string, cfg: KeyReaction) => cfg);
    api.press.mockResolvedValue({ ok: true });
    api.preview.mockResolvedValue(PREVIEW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders one toggle button per effect with the stored one pressed', async () => {
    await renderEditor({ effect: 'sparks' });
    const gallery = screen.getByRole('group', { name: 'lighting.keyReactions.effect' });
    expect(within(gallery).getAllByRole('button')).toHaveLength(10);
    expect(tile('sparks')).toHaveAttribute('aria-pressed', 'true');
    expect(tile('ripple')).toHaveAttribute('aria-pressed', 'false');
  });

  it('writes the new effect after the debounce when a tile is picked', async () => {
    await renderEditor({ enabled: false });
    fireEvent.click(tile('lightning'));
    expect(api.put).not.toHaveBeenCalled();
    await advance(300);
    expect(api.put).toHaveBeenCalledTimes(1);
    const [id, body] = api.put.mock.calls[0];
    expect(id).toBe('kb1');
    expect(body).toMatchObject({ effect: 'lightning', enabled: false });
    expect(api.press).not.toHaveBeenCalled();
  });

  it('picking an effect on an enabled board writes it, then fires one press', async () => {
    await renderEditor();
    fireEvent.click(tile('lightning'));
    await advance(0);
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put.mock.calls[0][1]).toMatchObject({ effect: 'lightning' });
    expect(api.press).toHaveBeenCalledTimes(1);
    expect(api.press).toHaveBeenCalledWith('kb1', {});
    expect(api.put.mock.invocationCallOrder[0]).toBeLessThan(api.press.mock.invocationCallOrder[0]);
  });

  it('keeps a failed save pending and retries it on the next flush', async () => {
    api.put.mockResolvedValueOnce(null);
    const { unmount } = render(
      <Harness
        cardId="kb1"
        initialConfig={DEFAULT_KEY_REACTION}
        inputAvailable
        hardwareKeys={false}
        frameIndex={3}
        stream={STREAM_DOWN}
      />,
    );
    fireEvent.click(tile('trace'));
    await advance(300);
    expect(api.put).toHaveBeenCalledTimes(1);
    unmount();
    await advance(0);
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(api.put.mock.calls[1][1]).toMatchObject({ effect: 'trace' });
  });

  it('flushes a pending edit when the editor unmounts inside the debounce window', async () => {
    const { unmount } = render(
      <Harness
        cardId="kb1"
        initialConfig={DEFAULT_KEY_REACTION}
        inputAvailable
        hardwareKeys={false}
        frameIndex={3}
        stream={STREAM_DOWN}
      />,
    );
    fireEvent.click(tile('trace'));
    unmount();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put.mock.calls[0][1]).toMatchObject({ effect: 'trace' });
  });

  it('hides the colour section for heatmap and shows the heat note', async () => {
    await renderEditor({ effect: 'ripple' });
    expect(screen.getByText('lighting.keyReactions.color.title')).toBeInTheDocument();
    fireEvent.click(tile('heatmap'));
    expect(screen.queryByText('lighting.keyReactions.color.title')).toBeNull();
    expect(screen.getByText('lighting.keyReactions.heatNote')).toBeInTheDocument();
  });

  it('the Type reactive row carries its description', async () => {
    await renderEditor();
    expect(screen.getByText('lighting.keyReactions.description')).toBeInTheDocument();
  });

  it('turns the board on from the toggle', async () => {
    await renderEditor({ enabled: false });
    fireEvent.click(screen.getByRole('switch', { name: 'lighting.keyReactions.title' }));
    await advance(300);
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put.mock.calls[0][1]).toMatchObject({ enabled: true });
  });

  it('asks for a click or a key press when typing reaches the board', async () => {
    await renderEditor({}, true);
    expect(screen.getByText('lighting.keyReactions.previewHint')).toBeInTheDocument();
  });

  it('asks only for a click when typing is not detected', async () => {
    await renderEditor({}, false);
    expect(screen.getByText('lighting.keyReactions.previewHintClick')).toBeInTheDocument();
    expect(screen.queryByText('lighting.keyReactions.previewHint')).toBeNull();
  });

  it('counts a board with its own key presses as typing-capable', async () => {
    await renderEditor({}, false, { hardwareKeys: true });
    expect(screen.getByText('lighting.keyReactions.previewHint')).toBeInTheDocument();
  });

  it('fetches the board layout once, not on every look change', async () => {
    await renderEditor({ enabled: false });
    await advance(50);
    expect(api.preview).toHaveBeenCalledTimes(1);
    expect(api.preview.mock.calls[0][1]).toMatchObject({ enabled: true });
    fireEvent.click(tile('fade'));
    await advance(300);
    expect(api.preview).toHaveBeenCalledTimes(1);
  });

  describe('live LEDs', () => {
    const mode = () => (screen.getByRole('button', { name: 'lighting.keyReactions.previewLabel' }).hasAttribute('data-live') ? 'live' : 'unlit');
    // Two LEDs, matching the preview fixture.
    const section = (index: number) => new Map([[index, new Uint8Array([9, 9, 9, 8, 8, 8])]]);
    const publish = (devices: Map<number, Uint8Array>) => act(async () => {
      publishLedFrame(new Uint8Array(3), 1, 1, devices);
      await vi.advanceTimersByTimeAsync(40);
    });

    beforeEach(() => { api.tunnel.mockReturnValue(false); });
    afterEach(() => { act(() => clearLedFrame()); });

    it('shows unlit keys with no stream', async () => {
      await renderEditor();
      await advance(300);
      expect(mode()).toBe('unlit');
    });

    it('shows the stream once the card section arrives, and unlit keys when it leaves', async () => {
      await renderEditor({}, true, { stream: STREAM_UP });
      await advance(300);
      expect(mode()).toBe('unlit');
      await publish(section(3));
      expect(mode()).toBe('live');
      await publish(section(9));
      expect(mode()).toBe('unlit');
    });

    it('shows the stream while the board is off too', async () => {
      await renderEditor({ enabled: false }, true, { stream: STREAM_UP });
      await advance(300);
      await publish(section(3));
      expect(mode()).toBe('live');
    });

    it('has no stream over relay even with frames', async () => {
      api.tunnel.mockReturnValue(true);
      await renderEditor({}, true, { stream: STREAM_UP });
      await advance(300);
      await publish(section(3));
      expect(mode()).toBe('unlit');
    });
  });
});
