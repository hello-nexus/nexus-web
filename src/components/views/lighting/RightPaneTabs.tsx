import { Tabs } from '../../common/Tabs/Tabs';
import { useTranslation } from '../../../lib/i18n';
import styles from '../LightingView.module.scss';

export type RightPaneTab = 'devices' | 'effect';

/**
 * Devices | Effect selector for the right pane. Reuses the shared Tabs
 * primitive so it renders identically to the mode tabs on the page header:
 * a horizontal pair with a subtle accent underline on the active item, no
 * pill fills, no bold weight. Disabled state is per-tab (effectTabDisabled)
 * - the shared Tabs component only supports a single disabled flag, so we
 * inject styling at the container level for the disabled variant.
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
    { key: 'devices', label: t('lighting.rightPane.devices') },
    { key: 'effect', label: effectLabel, disabled: effectTabDisabled },
  ];

  return (
    <div className={styles.rightPaneTabsWrap}>
      <Tabs
        tabs={tabs}
        activeKey={active}
        onChange={k => onSelect(k as RightPaneTab)}
        ariaLabel={t('lighting.rightPane.label')}
      />
    </div>
  );
}
