import type { CSSProperties } from 'react';
import { Wallpaper } from 'lucide-react';
import { EditHint } from '../../components/common/EditHint/EditHint';
import { useTranslation } from '../../lib/i18n';
import styles from '../PanelApp.module.scss';

export interface BackgroundMenuPoint { x: number; y: number; }

interface BackgroundEditHintProps {
  onActivate: (point: BackgroundMenuPoint) => void;
  className?: string;
  style?: CSSProperties;
  round?: boolean;
}

/**
 * The "Edit background" target of the device-page preview: hovering it fades in
 * the shared edit notice, a click or Enter hands the pointer position up so the
 * caller can open the background menu there.
 */
export function BackgroundEditHint({ onActivate, className, style, round }: BackgroundEditHintProps) {
  const { t } = useTranslation();
  const label = t('panel.background.edit');
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      className={`${styles.bgHint} ${className ?? ''}`}
      style={style}
      data-round={round ? 'true' : undefined}
      data-panel-hit="true"
      onClick={e => { e.stopPropagation(); onActivate({ x: e.clientX, y: e.clientY }); }}
      onKeyDown={e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        onActivate({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }}
    >
      <EditHint icon={Wallpaper} label={label} />
    </div>
  );
}
