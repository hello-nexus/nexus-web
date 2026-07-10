import { useMemo } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Badge } from '../../common/Badge/Badge';
import { InfoTooltip } from '../../common/InfoTooltip/InfoTooltip';
import { Card } from '../../common/Card/Card';
import type { DiagnosticsComponent, DiagnosticsKind } from '../../../api/diagnostics';
import { orderComponentsByKind, reasonLabel, statusColor, statusLabelKey } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface ComponentHealthGridProps {
  components: DiagnosticsComponent[];
  /** Jumps to the matching domain tab - a component's kind is exactly a tab key. */
  onNavigate: (kind: DiagnosticsKind) => void;
}

/** The at-a-glance overview grid: one card per health.components[] entry
 *  (storage/memory/gpu/cooling/system), each with a status pill and its
 *  reasons. Ordered to match the tab order (not the server's order) and
 *  clickable to jump to that domain's tab, which shows the richer
 *  per-endpoint data - this grid is the "what needs a look" summary. Hover/
 *  focus treatment matches the monitoring overview's dash cards (dashHover),
 *  not the default Card hover, per the visual-parity requirement. */
export function ComponentHealthGrid({ components, onNavigate }: ComponentHealthGridProps) {
  const { t } = useTranslation();
  const ordered = useMemo(() => orderComponentsByKind(components), [components]);
  return (
    <div className={styles.grid}>
      {ordered.map(component => (
        <Card
          key={component.id}
          className={styles.healthCard}
          compact
          interactive
          dashHover
          title={t(`diagnostics.kind.${component.kind}`)}
          subtitle={component.name !== t(`diagnostics.kind.${component.kind}`) ? component.name : undefined}
          truncateSubtitle
          actions={<Badge label={t(statusLabelKey(component.status))} color={statusColor(component.status)} />}
          onClick={() => onNavigate(component.kind)}
        >
          {component.reasons.length > 0 && (
            <ul className={styles.reasonList}>
              {component.reasons.map((reason, i) => (
                <li key={i} className={styles.reasonItem}>
                  <div className={styles.reasonText}>
                    <div className={styles.reasonLabel}>{reasonLabel(reason, t)}</div>
                    {reason.summary && <div className={styles.reasonSummary}>{reason.summary}</div>}
                  </div>
                  {reason.detail && (
                    // Only the info trigger swallows the click, so tapping the
                    // reason text still bubbles to the card's navigate onClick.
                    <span className={styles.reasonInfo} onClick={e => e.stopPropagation()}>
                      <InfoTooltip message={reason.detail} side="top" />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
