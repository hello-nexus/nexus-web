import { useMemo } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Badge } from '../../common/Badge/Badge';
import { InfoTooltip } from '../../common/InfoTooltip/InfoTooltip';
import { Card } from '../../common/Card/Card';
import { DomainGlyph } from '../../common/DomainGlyph/DomainGlyph';
import type { DiagnosticsComponent, DiagnosticsKind } from '../../../api/diagnostics';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { reasonDetailText } from './reasonDetail';
import type { SummaryDetail } from './summaryDetails';
import { aggregateDomainTiles, DOMAIN_ICON, domainTitleKey, reasonLabel, statusColor, statusLabelKey } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface ComponentHealthGridProps {
  components: DiagnosticsComponent[];
  /** Jumps to the matching domain tab - a tile's domain is exactly a tab key. */
  onNavigate: (kind: DiagnosticsKind) => void;
  /** What an OK tile shows under its title; a tile with fault reasons shows those instead. */
  details?: Partial<Record<DiagnosticsKind, SummaryDetail | null>>;
}

/** The at-a-glance overview: a fixed 2x2 of four large domain tiles - Storage,
 *  Memory, Cooling (GPU folded in), System - each aggregating the server's
 *  per-device health.components into one worst-status roll-up with its flagged
 *  reasons. Clickable to jump to that domain's tab, which shows the richer
 *  per-endpoint data. Hover/focus treatment matches the monitoring overview's
 *  dash cards (dashHover), per the visual-parity requirement. */
export function ComponentHealthGrid({ components, onNavigate, details }: ComponentHealthGridProps) {
  const { t, language } = useTranslation();
  const prefs = useUnitPrefs();
  const tiles = useMemo(() => aggregateDomainTiles(components), [components]);
  return (
    <div className={styles.grid}>
      {tiles.map(tile => {
        const Icon = DOMAIN_ICON[tile.domain];
        const detail = tile.reasons.length === 0 ? details?.[tile.domain] : null;
        return (
          <Card
            key={tile.domain}
            className={styles.healthCard}
            interactive
            dashHover
            icon={Icon && <Icon size={18} />}
            title={t(domainTitleKey(tile.domain))}
            actions={<Badge label={t(statusLabelKey(tile.status))} color={statusColor(tile.status)} />}
            onClick={() => onNavigate(tile.domain)}
          >
            {Icon && <DomainGlyph icon={Icon} />}
            {detail && (
              <div className={styles.okInfo} data-testid="summary-ok-info">
                {detail.count && <div className={styles.okCount}>{detail.count}</div>}
                {detail.lines.map((line, i) => <div key={i} className={styles.okLine}>{line}</div>)}
              </div>
            )}
            {tile.reasons.length > 0 && (
              <ul className={styles.reasonList}>
                {tile.reasons.map((reason, i) => {
                  const reasonInfo = reasonDetailText(reason, { t, language, ...prefs });
                  return (
                    <li key={i} className={styles.reasonItem}>
                      <div className={styles.reasonText}>
                        {/* An unmeasured probe states a coverage gap, not a finding,
                            so it drops the finding weight the others carry. */}
                        <div className={reason.severity === 'unknown' ? styles.reasonLabelMuted : styles.reasonLabel}>
                          {reasonLabel(reason, t)}
                        </div>
                        {reason.summary && <div className={styles.reasonSummary}>{reason.summary}</div>}
                      </div>
                      {reasonInfo && (
                        // Only the info trigger swallows the click, so tapping the
                        // reason text still bubbles to the card's navigate onClick.
                        <span className={styles.reasonInfo} onClick={e => e.stopPropagation()}>
                          <InfoTooltip message={reasonInfo} side="top" />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
