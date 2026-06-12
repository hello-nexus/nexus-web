import { Tv } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import { usePanelPreview } from '../common/PanelPreviewContext';
import styles from './TwitchWidget.module.scss';

// Catalog preview fixture — untranslated by design. No embed URL is built and
// no iframe mounts in preview.
const PREVIEW_CHAT: Array<[user: string, msg: string, hue: number]> = [
  ['viewer_42', 'glhf', 12],
  ['pixel_kat', 'that run was clean', 156],
  ['mod_dan', 'welcome everyone', 96],
  ['sora', '!uptime', 264],
];

export function TwitchWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const channel = widget.config?.channel as string | undefined;

  if (preview) {
    return (
      <div className={styles.container}>
        <div className={styles.mock}>
          <div className={styles.mockHeader}>
            <Tv size={16} strokeWidth={1.5} aria-hidden />
            {/* eslint-disable-next-line i18next/no-literal-string -- mock preview channel handle */}
            <span className={styles.channelName}>nova_streams</span>
            <span className={styles.liveBadge}>LIVE</span>
          </div>
          <div className={styles.chat}>
            {PREVIEW_CHAT.map(([user, msg, hue]) => (
              <div key={user} className={styles.chatLine}>
                <span className={styles.chatUser} style={{ color: `hsl(${hue} 55% 65%)` }}>{user}</span>
                {msg}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className={styles.container}>
        <div className={styles.placeholder}>
          <Tv size={28} strokeWidth={1.5} />
          <span>{t('panel.settings.setChannel')}</span>
        </div>
      </div>
    );
  }

  const src = `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?parent=${window.location.hostname}&darkpopout`;

  return (
    <div className={styles.container}>
      <iframe
        className={styles.frame}
        src={src}
        sandbox="allow-scripts allow-same-origin allow-popups"
        title={t('twitch.chatTitle')}
      />
    </div>
  );
}

export default TwitchWidget;
