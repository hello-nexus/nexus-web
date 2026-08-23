import { useState, type ReactNode } from 'react';
import { Tabs } from '../../../../components/common/Tabs/Tabs';
import { useTranslation } from '../../../../lib/i18n';
import styles from './EffectEditor.module.scss';

type EditorTab = 'devices' | 'options' | 'effect';

/**
 * Shared Options | Effect editor shell. A pure presenter: it renders the two
 * tab bodies given to it and owns nothing but the active-tab state. Both call
 * sites - the immersive lighting view (global RGB, per-mode) and the panel
 * background settings (per-panel, animate-only) - compose `options` / `effect`
 * from the same leaf components, so the shell never branches on target.
 *
 * `effectFooter` is an optional panel-only slot rendered under the Effect tab
 * (the panel injects its background-opacity slider; the immersive view omits it).
 *
 * `devices` is an optional leading tab. Static assigns a colour per device, so
 * that mode needs somewhere to choose which devices a pick lands on; every
 * other caller passes nothing and sees the same two tabs as before.
 */
export function EffectEditor({
  devices,
  options,
  effect,
  effectFooter,
  effectDisabled,
  optionsLabel,
  effectLabel,
}: {
  devices?: ReactNode;
  options: ReactNode;
  effect: ReactNode;
  effectFooter?: ReactNode;
  effectDisabled?: boolean;
  optionsLabel?: string;
  effectLabel?: string;
}) {
  const { t } = useTranslation();
  const [active, setActive] = useState<EditorTab>('options');
  // Neither a disabled Effect tab nor an absent Devices tab can stay selected
  // (a mode with no tweakables; a mode that reaches every device anyway).
  const current: EditorTab = (effectDisabled && active === 'effect') || (!devices && active === 'devices')
    ? 'options'
    : active;

  const tabs = [
    ...(devices ? [{ key: 'devices', label: t('lighting.rightPane.devices') }] : []),
    { key: 'options', label: optionsLabel ?? t('lighting.editor.options') },
    { key: 'effect', label: effectLabel ?? t('lighting.rightPane.effect'), disabled: effectDisabled },
  ];

  return (
    <div className={styles.editor}>
      <div className={styles.tabs}>
        <Tabs
          tabs={tabs}
          activeKey={current}
          onChange={k => setActive(k as EditorTab)}
          fullWidth
          ariaLabel={t('lighting.rightPane.label')}
        />
      </div>
      <div className={styles.body} data-panel-scrollable="true">
        {current === 'devices' ? devices : current === 'options' ? options : (
          <>
            {effect}
            {effectFooter}
          </>
        )}
      </div>
    </div>
  );
}
