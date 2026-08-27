import { useState } from 'react';
import { Slider } from '../../../components/common/Slider/Slider';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetSettingsProps } from '../types';
import { SettingsSection } from '../common/SettingsRow/SettingsRow';
import { REFRESH_SECONDS, resolveRefreshSeconds } from './processesData';

const MIN_SECONDS = REFRESH_SECONDS[0];
const MAX_SECONDS = REFRESH_SECONDS[REFRESH_SECONDS.length - 1];

export function ProcessesSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const saved = resolveRefreshSeconds(widget.config?.refreshSeconds);
  // The Slider is controlled, so a drag needs somewhere to land before the
  // commit: without this React restores the thumb to `saved` on every input
  // event and it never follows the pointer.
  const [dragging, setDragging] = useState<number | null>(null);

  return (
    <SettingsSection title={t('panel.processes.settings.title')}>
      <Slider
        label={t('panel.processes.settings.refresh')}
        value={dragging ?? saved}
        min={MIN_SECONDS}
        max={MAX_SECONDS}
        step={1}
        // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
        orientation="stacked"
        editable
        trackFill
        formatValue={v => t('panel.processes.settings.seconds', { n: v })}
        onChange={v => setDragging(v)}
        onCommit={v => { setDragging(null); onUpdate({ refreshSeconds: v }); }}
      />
    </SettingsSection>
  );
}

export default ProcessesSettings;
