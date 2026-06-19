import { useState, type ReactNode } from 'react';
import { Tabs } from '../../../../components/common/Tabs/Tabs';
import { useTranslation } from '../../../../lib/i18n';
import styles from './EffectEditor.module.scss';

type EditorTab = 'options' | 'effect';

/**
 * Shared Options | Effect editor shell. A pure presenter: it renders the two
 * tab bodies given to it and owns nothing but the active-tab state. Both call
 * sites - the immersive lighting view (global RGB, per-mode) and the panel
 * background settings (per-panel, animate-only) - compose `options` / `effect`
 * from the same leaf components, so the shell never branches on target.
 *
 * `effectFooter` is an optional panel-only slot rendered under the Effect tab
 * (the panel injects its background-opacity slider; the immersive view omits it).
 */
export function EffectEditor({
  options,
  effect,
  effectFooter,
  effectDisabled,
  optionsLabel,
  effectLabel,
}: {
  options: ReactNode;
  effect: ReactNode;
  effectFooter?: ReactNode;
  effectDisabled?: boolean;
  optionsLabel?: string;
  effectLabel?: string;
}) {
  const { t } = useTranslation();
  const [active, setActive] = useState<EditorTab>('options');
  // A disabled Effect tab can't stay selected (e.g. mode with no tweakables).
  const current: EditorTab = effectDisabled && active === 'effect' ? 'options' : active;

  const tabs = [
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
        {current === 'options' ? options : (
          <>
            {effect}
            {effectFooter}
          </>
        )}
      </div>
    </div>
  );
}
