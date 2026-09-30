import { Stethoscope } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useDiagnosticsHealth } from '../../../hooks/useDiagnosticsHealth';
import { useFeatureFlags } from '../../../hooks/useUiSettings';
import { DIAGNOSTICS_PREVIEW } from './diagnosticsPreviewData';
import type { DiagnosticsStatus } from '../../../api/diagnostics';
import {
  aggregateDomainTiles,
  DOMAIN_ICON,
  reasonLabel,
  statusLabelKey,
  worstReason,
} from '../../../components/views/DiagnosticsView/diagnosticsHelpers';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { PanelStatusDot, PanelWidgetEmpty, PanelWidgetShell } from '../common/PanelWidgetChrome';
import { usePanelPreview } from '../common/PanelPreviewContext';
import type { WidgetProps } from '../types';
import styles from './DiagnosticsWidget.module.scss';

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

export function DiagnosticsWidget({ widget, onSectionNavigate }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const flags = useFeatureFlags();
  const { health: liveHealth } = useDiagnosticsHealth(!preview && flags.diagnostics);
  const health = preview ? DIAGNOSTICS_PREVIEW : liveHealth;

  if (!preview && !flags.diagnostics) {
    return (
      <PanelWidgetShell size={widget.size}>
        <PanelWidgetEmpty icon={<Stethoscope size={24} />} title={t('featureDisabled.widget.diagnostics')} />
      </PanelWidgetShell>
    );
  }

  if (!health) {
    return (
      <PanelWidgetShell size={widget.size}>
        <PanelWidgetEmpty icon={<Stethoscope size={24} />} title={t('diagnostics.title')} />
      </PanelWidgetShell>
    );
  }

  const worst = worstReason(health.components);
  const tiles = aggregateDomainTiles(health.components);

  if (widget.size === '4x2') {
    return (
      <PanelWidgetShell size={widget.size}>
        <div className={styles.blocks}>
          {tiles.map(tile => {
            const Icon = DOMAIN_ICON[tile.domain];
            const detail = tile.status !== 'ok' && tile.reasons[0]
              ? reasonLabel(tile.reasons[0], t)
              : t(statusLabelKey(tile.status));
            const content = (
              <>
                {Icon && <Icon size={20} className={styles.icon} aria-hidden />}
                <span className={styles.blockText}>
                  <span className={styles.blockTitle}>
                    <PanelStatusDot tone={panelToneFor(tile.status)} />
                    <span className={styles.blockName}>{t(`diagnostics.kind.${tile.domain}`)}</span>
                  </span>
                  <span className={styles.blockDetail}>{detail}</span>
                </span>
              </>
            );
            // onSectionNavigate exists only on the desktop dashboard; elsewhere
            // there is no page to open, so the block is not a button.
            return onSectionNavigate ? (
              <button
                key={tile.domain}
                type="button"
                className={styles.block}
                onClick={() => onSectionNavigate('diagnostics', { tab: tile.domain })}
              >
                {content}
              </button>
            ) : (
              <div key={tile.domain} className={styles.block}>{content}</div>
            );
          })}
        </div>
      </PanelWidgetShell>
    );
  }

  return (
    <PanelWidgetShell size={widget.size} className={styles.widget}>
      <Stethoscope size={28} className={styles.icon} aria-hidden />
      <span className={styles.overall}>{t(statusLabelKey(health.overall))}</span>
      <div className={styles.dots}>
        {tiles.map(tile => {
          const label = `${t(`diagnostics.kind.${tile.domain}`)}: ${t(statusLabelKey(tile.status))}`;
          return (
            <HoverTooltip key={tile.domain} body={label} side="top">
              <span className={styles.dotSlot} role="img" aria-label={label} tabIndex={0}>
                <PanelStatusDot tone={panelToneFor(tile.status)} />
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
