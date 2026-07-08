import { Stethoscope } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useDiagnosticsHealth } from '../../../hooks/useDiagnosticsHealth';
import { DIAGNOSTICS_PREVIEW } from './diagnosticsPreviewData';
import type { DiagnosticsKind, DiagnosticsStatus } from '../../../api/diagnostics';
import {
  kindStatus,
  reasonLabel,
  statusLabelKey,
  worstReason,
} from '../../../components/views/DiagnosticsView/diagnosticsHelpers';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { PanelStatusDot, PanelWidgetEmpty, PanelWidgetShell } from '../common/PanelWidgetChrome';
import { usePanelPreview } from '../common/PanelPreviewContext';
import type { WidgetProps } from '../types';
import styles from './DiagnosticsWidget.module.scss';

const KIND_ORDER: DiagnosticsKind[] = ['storage', 'memory', 'gpu', 'cooling', 'system'];

// PanelStatusDot's tone set is presence-shaped (online/away/busy/offline);
// this maps the ok/watch/act/unknown health scale onto it so the widget
// reuses the same dot every other widget's status line uses (see
// SteamWidget's PanelStatusDot + label pattern) instead of a bespoke dot.
function panelToneFor(status: DiagnosticsStatus): 'online' | 'away' | 'busy' | 'offline' {
  switch (status) {
    case 'ok': return 'online';
    case 'watch': return 'away';
    case 'act': return 'busy';
    default: return 'offline';
  }
}

export function DiagnosticsWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const { health: liveHealth } = useDiagnosticsHealth(!preview);
  const health = preview ? DIAGNOSTICS_PREVIEW : liveHealth;

  if (!health) {
    return (
      <PanelWidgetShell size={widget.size}>
        <PanelWidgetEmpty icon={<Stethoscope size={24} />} title={t('diagnostics.title')} />
      </PanelWidgetShell>
    );
  }

  const worst = worstReason(health.components);

  return (
    <PanelWidgetShell size={widget.size} className={styles.widget}>
      <div className={styles.headerRow}>
        <Stethoscope size={16} className={styles.icon} aria-hidden />
        <PanelStatusDot tone={panelToneFor(health.overall)} />
        <span className={styles.overall}>{t(statusLabelKey(health.overall))}</span>
      </div>
      <div className={styles.dots}>
        {KIND_ORDER.map(kind => {
          const status = kindStatus(health.components, kind);
          const label = `${t(`diagnostics.kind.${kind}`)}: ${t(statusLabelKey(status))}`;
          return (
            <HoverTooltip key={kind} body={label} side="top">
              <span className={styles.dotSlot} role="img" aria-label={label} tabIndex={0}>
                <PanelStatusDot tone={panelToneFor(status)} />
              </span>
            </HoverTooltip>
          );
        })}
      </div>
      {health.overall !== 'ok' && worst && (
        <div className={styles.reason}>{reasonLabel(worst, t)}</div>
      )}
    </PanelWidgetShell>
  );
}
