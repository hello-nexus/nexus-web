import { HardDrive, MemoryStick, Monitor, Fan, Server } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Badge } from '../../common/Badge/Badge';
import { InfoTooltip } from '../../common/InfoTooltip/InfoTooltip';
import { Card } from '../../common/Card/Card';
import type { DiagnosticsComponent, DiagnosticsKind } from '../../../api/diagnostics';
import { reasonLabel, statusColor, statusLabelKey } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

const KIND_ICON: Record<DiagnosticsKind, ComponentType<{ size?: number }>> = {
  storage: HardDrive,
  memory: MemoryStick,
  gpu: Monitor,
  cooling: Fan,
  system: Server,
};

/** The at-a-glance overview grid: one card per health.components[] entry
 *  (storage/memory/gpu/cooling/system), each with a status pill and its
 *  reasons. The dedicated sections below show the richer per-endpoint data;
 *  this grid is the "what needs a look" summary. */
export function ComponentHealthGrid({ components }: { components: DiagnosticsComponent[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.grid}>
      {components.map(component => {
        const Icon = KIND_ICON[component.kind];
        return (
          <Card key={component.id} className={styles.healthCard} compact>
            <div className={styles.healthCardHead}>
              <div className={styles.healthCardName}>
                <Icon size={16} aria-hidden />
                <span>{component.name}</span>
              </div>
              <Badge label={t(statusLabelKey(component.status))} color={statusColor(component.status)} />
            </div>
            {component.reasons.length > 0 && (
              <ul className={styles.reasonList}>
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
        );
      })}
    </div>
  );
}
