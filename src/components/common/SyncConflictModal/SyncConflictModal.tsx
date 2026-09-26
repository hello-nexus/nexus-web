import { DeviceModal } from '../DeviceModal/DeviceModal';
import { InfoList, InfoRow } from '../InfoList/InfoList';
import { Button } from '../Button/Button';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { formatDateTime, hour12OptionFor, type DateFormat, type TimeFormat } from '../../../lib/units';
import type { SyncConflict } from '../../../api/cloud';
import styles from './SyncConflictModal.module.scss';

interface SyncConflictModalProps {
  open: boolean;
  conflicts: SyncConflict[];
  onResolve: (profileId: string, choice: 'local' | 'cloud') => void;
  onClose: () => void;
}

function formatUpdated(iso: string, dateFormat: DateFormat, timeFormat: TimeFormat): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // toLocaleString's own defaults, spelled out so a custom pattern keeps the time fields.
  return formatDateTime(date, dateFormat, {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: hour12OptionFor(timeFormat),
  }, { variant: 'year' });
}

// Steam-cloud-style keep-local/take-cloud prompt for profiles that changed on
// this machine AND moved on the cloud since the same base revision.
export function SyncConflictModal({ open, conflicts, onResolve, onClose }: SyncConflictModalProps) {
  const { t } = useTranslation();
  const { timeFormat, dateFormat } = useUnitPrefs();
  if (!open || conflicts.length === 0) return null;

  return (
    <DeviceModal open={open} onClose={onClose} title={t('account.sync.conflict.title')} medium>
      <p className={styles.intro}>{t('account.sync.conflict.intro')}</p>
      <div className={styles.list}>
        {conflicts.map(conflict => (
          <div key={conflict.profileId} className={styles.item}>
            <div className={styles.columns}>
              <div className={styles.column}>
                <div className={styles.columnHeader}>{t('account.sync.conflict.thisMachine')}</div>
                <InfoList>
                  <InfoRow label={t('account.sync.conflict.name')} value={conflict.name} />
                  <InfoRow label={t('account.sync.conflict.updated')} value={formatUpdated(conflict.localUpdatedAt, dateFormat, timeFormat)} />
                </InfoList>
              </div>
              <div className={styles.column}>
                <div className={styles.columnHeader}>{t('account.sync.conflict.cloud')}</div>
                <InfoList>
                  <InfoRow label={t('account.sync.conflict.name')} value={conflict.cloudName} />
                  <InfoRow label={t('account.sync.conflict.updated')} value={formatUpdated(conflict.cloudUpdatedAt, dateFormat, timeFormat)} />
                </InfoList>
              </div>
            </div>
            <p className={styles.itemNote}>{t('account.sync.conflict.otherDevice')}</p>
            <div className={styles.itemActions}>
              <Button type="button" tone="neutral" size="sm" onClick={() => onResolve(conflict.profileId, 'local')}>
                {t('account.sync.conflict.keepLocal')}
              </Button>
              <Button type="button" tone="accent" size="sm" onClick={() => onResolve(conflict.profileId, 'cloud')}>
                {t('account.sync.conflict.useCloud')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </DeviceModal>
  );
}
