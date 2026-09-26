import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TwitchChatFrame } from '../../../api/twitch';
import type { PanelWidget } from '../../types';
import { TwitchWidget } from './TwitchWidget';

const mocks = vi.hoisted(() => ({
  onFrame: null as ((raw: unknown) => void) | null,
  postService: vi.fn<(...args: unknown[]) => Promise<unknown>>(() => Promise.resolve({})),
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (_topic: string, _enabled: boolean, cb: (raw: unknown) => void) => {
    mocks.onFrame = cb;
  },
}));

vi.mock('../../../api/service', () => ({
  postService: (...args: unknown[]) => mocks.postService(...args),
  resolveHttp: (path: string) => `http://svc${path}`,
  tokenParam: () => '',
}));

vi.mock('../../../lib/i18n', () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});

const widget = { id: 'w1', type: 'twitch', size: '4x4', col: 0, row: 0, config: { channel: 'Chan' } } as PanelWidget;

function frame(overrides: Partial<TwitchChatFrame> = {}): TwitchChatFrame {
  return { channel: 'chan', connected: true, exists: true, clearedThrough: 0, messages: [], ...overrides };
}

function deliver(f: TwitchChatFrame) {
  act(() => mocks.onFrame?.(f));
}

const hello = { seq: 1, user: 'viewer', color: '', fragments: [{ text: 'days-old message', emoteId: '' }] };

describe('TwitchWidget clear', () => {
  beforeEach(() => {
    mocks.onFrame = null;
    mocks.postService.mockClear();
  });

  it('empties the log and clears the channel service-side', () => {
    render(<TwitchWidget widget={widget} />);
    deliver(frame({ messages: [hello] }));
    expect(screen.getByText('days-old message')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.twitch.clear' }));

    expect(screen.queryByText('days-old message')).toBeNull();
    expect(mocks.postService).toHaveBeenCalledWith('/api/twitch/chat/chan/clear', {});
  });

  it('empties the log when another viewer clears the channel', () => {
    render(<TwitchWidget widget={widget} />);
    deliver(frame({ messages: [hello] }));

    deliver(frame({ clearedThrough: 1 }));

    expect(screen.queryByText('days-old message')).toBeNull();
    expect(screen.queryByRole('button', { name: 'panel.widget.twitch.clear' })).toBeNull();
  });

  it('drops a pre-clear append that arrives after the clear, keeps newer ones', () => {
    render(<TwitchWidget widget={widget} />);
    deliver(frame({ clearedThrough: 2 }));

    deliver(frame({ messages: [{ ...hello, seq: 2 }, { ...hello, seq: 3, fragments: [{ text: 'fresh message', emoteId: '' }] }] }));

    expect(screen.queryByText('days-old message')).toBeNull();
    expect(screen.getByText('fresh message')).toBeTruthy();
  });

  it('shows no clear button on a surface without input', () => {
    render(<TwitchWidget widget={widget} surface="q60" />);
    deliver(frame({ messages: [hello] }));

    expect(screen.getByText('days-old message')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'panel.widget.twitch.clear' })).toBeNull();
  });
});
