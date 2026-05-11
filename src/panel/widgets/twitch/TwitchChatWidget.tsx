import { Tv } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import styles from './TwitchChatWidget.module.scss';

export function TwitchChatWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const channel = widget.config?.channel?.s;

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
        title="Twitch chat"
      />
    </div>
  );
}

export default TwitchChatWidget;
