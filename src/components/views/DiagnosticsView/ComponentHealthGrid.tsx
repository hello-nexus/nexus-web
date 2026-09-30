import { useMemo } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Badge } from '../../common/Badge/Badge';
import { InfoTooltip } from '../../common/InfoTooltip/InfoTooltip';
import { Card } from '../../common/Card/Card';
import { DomainGlyph } from '../../common/DomainGlyph/DomainGlyph';
import type { DiagnosticsComponent, DiagnosticsKind } from '../../../api/diagnostics';
import { aggregateDomainTiles, DOMAIN_ICON, reasonLabel, statusColor, statusLabelKey } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface ComponentHealthGridProps {
  components: DiagnosticsComponent[];
  /** Jumps to the matching domain tab - a tile's domain is exactly a tab key. */
  onNavigate: (kind: DiagnosticsKind) => void;
}

/** The at-a-glance overview: a fixed 2x2 of four large domain tiles - Storage,
 *  Memory, Cooling (GPU folded in), System - each aggregating the server's
 *  per-device health.components into one worst-status roll-up with its flagged
 *  reasons. Clickable to jump to that domain's tab, which shows the richer
 *  per-endpoint data. Hover/focus treatment matches the monitoring overview's
 *  dash cards (dashHover), per the visual-parity requirement. */
export function ComponentHealthGrid({ components, onNavigate }: ComponentHealthGridProps) {
  const { t } = useTranslation();
  const tiles = useMemo(() => aggregateDomainTiles(components), [components]);
  return (
    <div className={styles.grid}>
      {tiles.map(tile => {
        const Icon = DOMAIN_ICON[tile.domain];
        return (
          <Card
            key={tile.domain}
            className={styles.healthCard}
            interactive
            dashHover
            icon={Icon && <Icon size={18} />}
            title={t(`diagnostics.kind.${tile.domain}`)}
            actions={<Badge label={t(statusLabelKey(tile.status))} color={statusColor(tile.status)} />}
            onClick={() => onNavigate(tile.domain)}
          >
            {Icon && <DomainGlyph icon={Icon} />}
            {tile.reasons.length > 0 && (
              <ul className={styles.reasonList}>
                {tile.reasons.map((reason, i) => (
                  <li key={i} className={styles.reasonItem}>
                    <div className={styles.reasonText}>
                      {/* An unmeasured probe states a coverage gap, not a finding,
                          so it drops the finding weight the others carry. */}
                      <div className={reason.severity === 'unknown' ? styles.reasonLabelMuted : styles.reasonLabel}>
                        {reasonLabel(reason, t)}
                      </div>
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
        );
      })}
    </div>
  );
}
