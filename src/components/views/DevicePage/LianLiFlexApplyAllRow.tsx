import { useState } from 'react';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { applyLianLiFlexToAll, type LianLiFlexApplyWhat } from '../../../api/lianli-flex';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiDevicePage.module.scss';

type Scope = 'family' | 'all';
const SCOPE_FAMILY: Scope = 'family';
const SCOPE_ALL: Scope = 'all';

interface LianLiFlexApplyAllRowProps {
  mac: string;
  what: LianLiFlexApplyWhat;
  /** Called after the service applied the settings, so the tab can re-read them. */
  onApplied: () => void;
}

/** Copies one fan's lighting or fan profile to the other LCD Flex fans, after a confirmation. */
export function LianLiFlexApplyAllRow({ mac, what, onApplied }: LianLiFlexApplyAllRowProps) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<Scope>(SCOPE_FAMILY);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setConfirm(false);
    setBusy(true);
    setNote(null);
    const result = await applyLianLiFlexToAll(mac, [what], scope).catch(() => null);
    setBusy(false);
    if (!result?.ok) {
      setNote(t('devices.lianli-flex.applyAllFailed'));
      return;
    }
    if (result.skipped.length > 0) setNote(t('devices.lianli-flex.applyAllSkipped', { count: result.skipped.length }));
    onApplied();
  };

  return (
    <>
      <SettingRow
        label={t('devices.lianli-flex.applyAll')}
        description={t(what === 'fan' ? 'devices.lianli-flex.applyAllFanHint' : 'devices.lianli-flex.applyAllLightingHint')}
      >
        <ChipGroup
          ariaLabel={t('devices.lianli-flex.applyAll')}
          activeKey={scope}
          onChange={key => setScope(key as Scope)}
          options={[
            { key: SCOPE_FAMILY, label: t('devices.lianli-flex.scopeFamily') },
            { key: SCOPE_ALL, label: t('devices.lianli-flex.scopeAll') },
          ]}
        />
        <Button size="sm" tone="neutral" disabled={busy} onClick={() => setConfirm(true)}>
          {t('devices.lianli-flex.applyAllButton')}
        </Button>
      </SettingRow>
      {note && <p className={styles.customNote} role="status" data-settings-aside="true">{note}</p>}
      <ConfirmModal
        open={confirm}
        title={t('devices.lianli-flex.applyAllConfirmTitle')}
        message={t(what === 'fan' ? 'devices.lianli-flex.applyAllConfirmFan' : 'devices.lianli-flex.applyAllConfirmLighting')}
        confirmLabel={t('devices.lianli-flex.applyAllButton')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => { void run(); }}
      />
    </>
  );
}
