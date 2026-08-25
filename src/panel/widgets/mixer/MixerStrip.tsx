import { Volume2, VolumeX } from 'lucide-react';
import { useProcessIcon } from '../../../hooks/useProcessIcon';
import { useTranslation } from '../../../lib/i18n';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { AudioMixerIds } from './mixerIds';
import { PanelMixerSlider } from '../common/PanelMixerSlider';
import styles from './MixerWidget.module.scss';

export interface MixerStripProps {
  /** Strip id, or undefined for the system output strip. */
  id?: string;
  name: string;
  /** 0-1. */
  volume: number;
  muted: boolean;
  /** 0-1 signal level; omitted on the system strip, which has no session meter. */
  peak?: number;
  idle?: boolean;
  disabled?: boolean;
  onChange: (volume: number) => void;
  onCommit: (volume: number) => void;
  onToggleMute: () => void;
}

export function MixerStrip({
  id,
  name,
  volume,
  muted,
  peak,
  idle,
  disabled,
  onChange,
  onCommit,
  onToggleMute,
}: MixerStripProps) {
  const { t } = useTranslation();
  const percent = Math.round(volume * 100);
  return (
    <div
      className={styles.sliderCell}
      data-idle={idle ? 'true' : 'false'}
      data-muted={muted ? 'true' : 'false'}
    >
      <PanelMixerSlider
        min={0}
        max={100}
        value={percent}
        meter={peak}
        showValue
        disabled={disabled}
        topLabel={name}
        valueLabel={`${percent}`}
        icon={<StripIcon id={id} name={name} muted={muted} />}
        iconButton={{
          ariaLabel: muted
            ? t('panel.widget.mixer.aria.unmute', { name })
            : t('panel.widget.mixer.aria.mute', { name }),
          ariaPressed: muted,
          active: muted,
          onClick: onToggleMute,
        }}
        ariaLabel={t('panel.widget.mixer.aria.volume', { name })}
        onChange={value => onChange(value / 100)}
        onCommit={value => onCommit(value / 100)}
        className={styles.mixerSlider}
      />
    </div>
  );
}

/**
 * The app's own exe icon, from the same route the monitoring process list uses.
 * Preview mode resolves no icon: the catalog tile must issue no service call.
 */
function StripIcon({ id, name, muted }: { id?: string; name: string; muted: boolean }) {
  const preview = usePanelPreview();
  const resolvable = !preview && id !== undefined && id !== AudioMixerIds.SystemSounds;
  const iconUrl = useProcessIcon(resolvable ? id : undefined);
  if (iconUrl) {
    return <img src={iconUrl} className={styles.appIcon} alt="" />;
  }
  // The system strips keep the speaker glyph; an app that resolved no icon gets
  // its initial, so a row of unresolved strips stays distinguishable.
  if (id === undefined || id === AudioMixerIds.SystemSounds) {
    return muted ? <VolumeX strokeWidth={1.7} /> : <Volume2 strokeWidth={1.7} />;
  }
  return <span className={styles.appInitial}>{initial(name)}</span>;
}

function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : '?';
}
