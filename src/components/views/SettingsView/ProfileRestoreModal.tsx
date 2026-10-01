import { useEffect, useState } from 'react';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { getMarketplaceListing } from '../../../widgets/marketplaceRegistry';
import { useTranslation } from '../../../lib/i18n';

type Translate = ReturnType<typeof useTranslation>['t'];

/** Installed apps by manifest name; an app missing on this PC shows its id. */
export function appDataNames(appIds: string[]): string[] {
  return appIds.map(id => getMarketplaceListing(id)?.name || id);
}

/** "Aquarium, Stocks", or "3 apps" once a list would crowd the row. */
export function appDataSummary(t: Translate, appIds: string[]): string {
  const names = appDataNames(appIds);
  return names.length >= 3 ? t('profile.appData.count', { count: names.length }) : names.join(', ');
}

/** The one dialog for bringing a profile in, from a file or from the cloud: settings always, app data on a toggle. */
export function ProfileRestoreModal({ open, title, confirmLabel, appIds, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  confirmLabel: string;
  appIds: string[];
  onConfirm: (includeAppData: boolean) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [includeAppData, setIncludeAppData] = useState(true);
  useEffect(() => { if (open) setIncludeAppData(true); }, [open]);
  const names = appDataNames(appIds).join(', ');
  return (
    <ConfirmModal
      open={open}
      title={title}
      message={t('profile.restore.message')}
      confirmLabel={confirmLabel}
      onConfirm={() => onConfirm(includeAppData)}
      onCancel={onCancel}
    >
      <SettingToggle
        label={t('profile.restore.appData.label')}
        description={t('profile.restore.appData.hint', { apps: names })}
        checked={includeAppData}
        onChange={setIncludeAppData}
      />
    </ConfirmModal>
  );
}
