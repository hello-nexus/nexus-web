import type { ReactNode } from 'react';
import { useTranslation } from '../../lib/i18n';
import { Card } from '../../components/common/Card/Card';
import { InfoList, InfoRow } from '../../components/common/InfoList/InfoList';
import { publicSpecRows } from './publicProfileUtils';

export interface DeviceSpecsCardProps {
  hostname: string;
  specs: Record<string, string>;
  /** Manual entries are user-curated, not telemetry: no "Last seen" row. */
  manual?: boolean;
  lastSeenAt?: string;
  /** Optional badge/status rendered next to the hostname (e.g. "Manual"). */
  badge?: ReactNode;
  /** Optional edit/delete controls rendered in the card header. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Shared device card body: hostname title + spec rows, used by the public
 * profile page (/u/<username>) and the account devices editor so both
 * surfaces render a device identically. Reuses publicSpecRows for the same
 * canonical spec fields and devices.specs.row.* labels everywhere else in
 * the app already uses.
 */
export function DeviceSpecsCard({ hostname, specs, manual, lastSeenAt, badge, actions, className }: DeviceSpecsCardProps) {
  const { t } = useTranslation();
  return (
    <Card title={hostname} subtitle={badge} actions={actions} className={className}>
      <InfoList>
        {publicSpecRows(specs).map((row) => (
          <InfoRow key={row.key} label={t(row.labelKey)} value={row.value} />
        ))}
        {!manual && lastSeenAt && (
          <InfoRow
            label={t('publicProfile.device.lastSeen')}
            value={new Date(lastSeenAt).toLocaleString(undefined, {
              year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            })}
          />
        )}
      </InfoList>
    </Card>
  );
}
