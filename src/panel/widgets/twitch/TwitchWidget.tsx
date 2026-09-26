import { useCallback, useEffect, useRef, useState } from 'react';
import { BrushCleaning } from 'lucide-react';
import {
  clearTwitchChat,
  normalizeTwitchChannel,
  twitchChatTopic,
  twitchEmoteUrl,
  type TwitchChatFrame,
  type TwitchChatMessage,
} from '../../../api/twitch';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../lib/i18n';
import { surfaceSupportsTouch } from '../../types';
import type { WidgetProps } from '../types';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { previewEmoteUri } from '../common/previewAssets';
import { TwitchLogo } from './TwitchLogo';
import { TWITCH_PREVIEW, TWITCH_PREVIEW_CHANNEL } from './twitchPreviewData';
import styles from './TwitchWidget.module.scss';

// Matches the service-side retention cap, so a reconnect snapshot never
// exceeds what the tile already holds.
const MESSAGE_CAP = 120;

/**
 * Live Twitch chat for a channel. The IRC connection lives in the service
 * (TwitchChatHub) and arrives on the `twitch/chat/{channel}` topic; subscribing
 * here is what tells the service to join, and unsubscribing is what makes it
 * part, so no connection is held for a widget nobody is looking at.
 */
export function TwitchWidget({ widget, surface, deviceTouch }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const channel = normalizeTwitchChannel(widget.config?.channel as string | undefined);
  const configured = ((widget.config?.channel as string | undefined) ?? '').trim().length > 0;
  const canClear = surface ? surfaceSupportsTouch(surface, deviceTouch) : true;

  const [messages, setMessages] = useState<TwitchChatMessage[]>(preview ? TWITCH_PREVIEW.messages : []);
  const [connected, setConnected] = useState(preview);
  const [exists, setExists] = useState<boolean | null>(preview ? true : null);
  const clearedThrough = useRef(0);

  // A channel change makes every retained message stale.
  useEffect(() => {
    if (preview) return;
    clearedThrough.current = 0;
    setMessages([]);
    setConnected(false);
    setExists(null);
  }, [channel, preview]);

  const onFrame = useCallback((raw: unknown) => {
    const frame = raw as TwitchChatFrame | null;
    if (!frame) return;
    setConnected(frame.connected);
    setExists(frame.exists ?? null);
    // An append flushed just before a clear can arrive after it, so the
    // watermark filters every frame rather than only the clear itself.
    if (frame.clearedThrough > clearedThrough.current) clearedThrough.current = frame.clearedThrough;
    if (!frame.messages?.length && !frame.clearedThrough) return;
    const floor = clearedThrough.current;
    setMessages(prev => {
      // Frames carry appends and the subscribe snapshot carries the whole
      // buffer, and the two can arrive in either order - merging on seq makes
      // that harmless instead of duplicating or reordering the tail.
      const bySeq = new Map(prev.filter(m => m.seq > floor).map(m => [m.seq, m]));
      for (const message of frame.messages ?? []) {
        if (message.seq > floor) bySeq.set(message.seq, message);
      }
      const merged = Array.from(bySeq.values()).sort((a, b) => a.seq - b.seq);
      return merged.length > MESSAGE_CAP ? merged.slice(merged.length - MESSAGE_CAP) : merged;
    });
  }, []);

  useTopicCallback(channel ? twitchChatTopic(channel) : '', Boolean(channel) && !preview, onFrame);

  const displayChannel = preview ? TWITCH_PREVIEW_CHANNEL : channel ?? '';

  function clear() {
    setMessages([]);
    if (channel && !preview) void clearTwitchChat(channel);
  }

  return (
    <div className={styles.twitch} data-size={widget.size}>
      <header className={styles.header}>
        <TwitchLogo size={16} aria-hidden />
        <span className={styles.channel}>{displayChannel || t('panel.widget.twitch')}</span>
        {canClear && messages.length > 0 && (
          <button
            type="button"
            className={styles.clear}
            onClick={clear}
            aria-label={t('panel.widget.twitch.clear')}
            title={t('panel.widget.twitch.clear')}
          >
            <BrushCleaning size={15} />
          </button>
        )}
      </header>
      {renderBody()}
    </div>
  );

  function renderBody() {
    // The catalog preview has no configured channel of its own; it always
    // shows the fixture conversation rather than the setup placeholder.
    if (preview) {
      return <ChatLog messages={messages} preview />;
    }
    if (!configured) {
      return <Placeholder text={t('panel.widget.twitch.setChannel')} />;
    }
    if (!channel) {
      return <Placeholder text={t('panel.widget.twitch.invalidChannel')} />;
    }
    if (exists === false) {
      return <Placeholder text={t('panel.widget.twitch.channelNotFound')} />;
    }
    if (messages.length === 0) {
      return <Placeholder text={connected ? t('panel.widget.twitch.waiting') : t('panel.widget.twitch.connecting')} />;
    }
    return <ChatLog messages={messages} preview={preview} />;
  }
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className={styles.placeholder}>
      <TwitchLogo size={26} aria-hidden />
      <span>{text}</span>
    </div>
  );
}

function ChatLog({ messages, preview }: { messages: TwitchChatMessage[]; preview: boolean }) {
  // column-reverse makes the browser hold the view at the newest line as
  // messages append, and sits a short backlog at the bottom, both without any
  // scroll bookkeeping. Tracking it in JS instead is what broke here: our own
  // scroll-to-bottom fires a scroll event asynchronously, and by the time it
  // lands the log has already grown, so any measurement taken there reads as a
  // user scroll and unpins for good. The newest message is therefore first in
  // DOM order, which is what puts it at the bottom on screen.
  const newestFirst = messages.slice().reverse();

  return (
    <div className={styles.log}>
      {newestFirst.map(message => (
        <div key={message.seq} className={styles.line}>
          <span className={styles.user} style={{ color: nameColor(message) }}>{message.user}</span>
          {message.fragments.map((fragment, i) => (
            fragment.emoteId
              ? (
                <img
                  key={i}
                  className={styles.emote}
                  src={preview ? previewEmoteUri(hashHue(fragment.emoteId)) : twitchEmoteUrl(fragment.emoteId)}
                  alt={fragment.text}
                />
              )
              : <span key={i}>{fragment.text}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

// Twitch itself assigns a colour to senders who never picked one; deriving it
// from the name keeps a given chatter's colour stable across messages.
function nameColor(message: TwitchChatMessage): string {
  return message.color || `hsl(${hashHue(message.user)} 62% 68%)`;
}

function hashHue(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return hash;
}

export default TwitchWidget;
