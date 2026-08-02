import { Wand2, ListTree } from 'lucide-react';
import { Tabs } from '../../../../components/common/Tabs/Tabs';
import { useTranslation } from '../../../../lib/i18n';
import styles from '../LightingPage.module.scss';

export type RightPaneTab = 'devices' | 'effect';

/**
 * Devices | Effect selector for the right pane, reusing the shared Tabs
 * primitive so it matches the page-header mode tabs. The shared Tabs
 * component only supports a single disabled flag, so the per-tab
 * disabled state (effectTabDisabled) is styled at the container level.
 */
export function RightPaneTabs({ active, onSelect, pulseKey, effectTabDisabled }: {
  active: RightPaneTab;
  onSelect: (tab: RightPaneTab) => void;
  /** Bumping this value triggers a one-shot attention pulse on the Effect tab. */
  pulseKey: number;
  effectTabDisabled?: boolean;
}) {
  const { t } = useTranslation();
  // Bumping pulseKey remounts the span inside the Effect label, which
  // restarts the CSS keyframe on the :not(.active) tab so the attention
  // nudge replays every time the user clicks an effect while on Devices.
  const effectLabel = (
    <span key={pulseKey} className={styles.rightPaneTabPulse}>
      {t('lighting.rightPane.effect')}
    </span>
  );

  const tabs = [
    { key: 'effect', label: effectLabel, icon: <Wand2 size={14} />, disabled: effectTabDisabled },
    { key: 'devices', label: t('lighting.rightPane.devices'), icon: <ListTree size={14} /> },
  ];

  return (
    <div className={styles.rightPaneTabsWrap}>
      <Tabs
        tabs={tabs}
        activeKey={active}
        onChange={k => onSelect(k as RightPaneTab)}
        ariaLabel={t('lighting.rightPane.label')}
        fullWidth
      />
    </div>
  );
}
