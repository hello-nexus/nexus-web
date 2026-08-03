import { Wand2, ListTree } from 'lucide-react';
import { ChipGroup } from '../../../../components/common/ChipGroup/ChipGroup';
import { useTranslation } from '../../../../lib/i18n';
import styles from '../LightingPage.module.scss';

export type RightPaneTab = 'devices' | 'effect';

/** Devices | Effect selector for the right pane, on the app's standard chip. */
export function RightPaneTabs({ active, onSelect, pulseKey, effectTabDisabled }: {
  active: RightPaneTab;
  onSelect: (tab: RightPaneTab) => void;
  /** Bumping this value triggers a one-shot attention pulse on the Effect tab. */
  pulseKey: number;
  effectTabDisabled?: boolean;
}) {
  const { t } = useTranslation();
  // Bumping pulseKey remounts the span inside the Effect label, which restarts
  // the CSS keyframe on the unselected chip so the attention nudge replays
  // every time the user clicks an effect while on Devices.
  const effectLabel = (
    <span key={pulseKey} className={styles.rightPaneTabPulse}>
      <Wand2 size={14} aria-hidden />
      {t('lighting.rightPane.effect')}
    </span>
  );

  const options = [
    { key: 'effect', label: effectLabel, disabled: effectTabDisabled },
    {
      key: 'devices',
      label: (
        <>
          <ListTree size={14} aria-hidden />
          {t('lighting.rightPane.devices')}
        </>
      ),
    },
  ];

  return (
    <div className={styles.rightPaneTabsWrap}>
      <ChipGroup
        fullWidth
        options={options}
        activeKey={active}
        onChange={k => onSelect(k as RightPaneTab)}
        ariaLabel={t('lighting.rightPane.label')}
      />
    </div>
  );
}
