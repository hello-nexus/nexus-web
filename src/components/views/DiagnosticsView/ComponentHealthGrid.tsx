import { useMemo } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Badge } from '../../common/Badge/Badge';
import { InfoTooltip } from '../../common/InfoTooltip/InfoTooltip';
import { Card } from '../../common/Card/Card';
import type { DiagnosticsComponent } from '../../../api/diagnostics';
import {
  diagnosticsSectionAnchorId,
  orderComponentsByKind,
  reasonLabel,
  statusColor,
  statusLabelKey,
} from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

/** Scrolls the page to the section matching a health card's kind. */
function scrollToDiagnosticsSection(kind: DiagnosticsComponent['kind']): void {
  document.getElementById(diagnosticsSectionAnchorId(kind))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** The at-a-glance overview grid: one card per health.components[] entry
 *  (storage/memory/gpu/cooling/system), each with a status pill and its
 *  reasons. Ordered to match the page's section order (not the server's
 *  order) and clickable to jump to that section. The dedicated sections
 *  below show the richer per-endpoint data; this grid is the "what needs a
 *  look" summary. */
export function ComponentHealthGrid({ components }: { components: DiagnosticsComponent[] }) {
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
          title={t(`diagnostics.kind.${component.kind}`)}
          subtitle={component.name !== t(`diagnostics.kind.${component.kind}`) ? component.name : undefined}
          actions={<Badge label={t(statusLabelKey(component.status))} color={statusColor(component.status)} />}
          onClick={() => scrollToDiagnosticsSection(component.kind)}
        >
          {component.reasons.length > 0 && (
            // Swallow clicks so the InfoTooltip trigger inside a reason
            // doesn't also fire the card's own onClick via bubbling.
            <ul className={styles.reasonList} onClick={e => e.stopPropagation()}>
              {component.reasons.map((reason, i) => (
                <li key={i} className={styles.reasonItem}>
                  <div className={styles.reasonText}>
                    <div className={styles.reasonLabel}>{reasonLabel(reason, t)}</div>
                    {reason.summary && <div className={styles.reasonSummary}>{reason.summary}</div>}
                  </div>
                  {reason.detail && <InfoTooltip message={reason.detail} side="top" />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
