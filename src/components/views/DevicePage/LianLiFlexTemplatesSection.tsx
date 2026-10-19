import { useCallback, useEffect, useRef, useState } from 'react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { PromptModal } from '../../common/PromptModal/PromptModal';
import {
  applyLianLiFlexTemplate,
  deleteLianLiFlexTemplate,
  exportLianLiFlexTemplate,
  getLianLiFlexTemplates,
  importLianLiFlexTemplate,
  isForeignTemplateFile,
  saveLianLiFlexTemplate,
  type LianLiFlexTemplate,
} from '../../../api/lianli-flex';
import { saveBlobToFile } from '../../../lib/saveFile';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiWirelessDevicePage.module.scss';

const NAME_MAX_LENGTH = 60;
const UNSAFE_FILE_CHARS = /[<>:"/\\|?*]/g;

interface LianLiFlexTemplatesSectionProps {
  /** The screens an applied template goes to. */
  serials: readonly string[];
  /** The screen whose current content a new template saves. */
  sourceSerial: string | null;
}

/** Saved screen looks: save the current one, apply one to the selected screens, move them as ZIP files. */
export function LianLiFlexTemplatesSection({ serials, sourceSerial }: LianLiFlexTemplatesSectionProps) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<LianLiFlexTemplate[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [deleting, setDeleting] = useState<LianLiFlexTemplate | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const list = await getLianLiFlexTemplates().catch(() => null);
    if (aliveRef.current && list) setTemplates(list);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    return () => { aliveRef.current = false; };
  }, [refresh]);

  // A service without template routes has no section.
  if (templates === null) return null;

  const run = async (action: () => Promise<boolean>, failure: string) => {
    setBusy(true);
    setMessage(null);
    const ok = await action().catch(() => false);
    if (!aliveRef.current) return;
    setBusy(false);
    if (!ok) setMessage(failure);
    await refresh();
  };

  const exportTemplate = async (template: LianLiFlexTemplate) => {
    setMessage(null);
    const blob = await exportLianLiFlexTemplate(template.id).catch(() => null);
    if (!blob) {
      setMessage(t('devices.lianli-flex.templateExportFailed'));
      return;
    }
    const base = template.name.replace(UNSAFE_FILE_CHARS, '').trim() || 'template';
    await saveBlobToFile(blob, `${base}.zip`, [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }]);
  };

  const onFile = async (file: File) => {
    if (isForeignTemplateFile(file.name)) {
      setMessage(t('devices.lianli-flex.templateImportForeign'));
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await importLianLiFlexTemplate(file).catch(() => ({ ok: false as const, msg: '' }));
    if (!aliveRef.current) return;
    setBusy(false);
    if (!result.ok) setMessage(result.msg || t('devices.lianli-flex.templateImportFailed'));
    await refresh();
  };

  return (
    <SettingsSection title={t('devices.lianli-flex.templatesSection')} boxClassName={styles.sectionBox}>
      {templates.length === 0 && (
        <p className={styles.emptyNote} data-settings-aside="true">{t('devices.lianli-flex.templatesEmpty')}</p>
      )}
      {templates.map(template => (
        <SettingRow key={template.id} label={template.name}>
          <Button
            size="sm"
            tone="neutral"
            disabled={busy || serials.length === 0}
            onClick={() => { void run(() => applyLianLiFlexTemplate(template.id, [...serials]), t('devices.lianli-flex.templateApplyFailed')); }}
          >
            {t('devices.lianli-flex.templateApply')}
          </Button>
          <Button size="sm" tone="neutral" disabled={busy} onClick={() => { void exportTemplate(template); }}>
            {t('devices.lianli-flex.templateExport')}
          </Button>
          <Button size="sm" tone="danger" disabled={busy} onClick={() => setDeleting(template)}>
            {t('common.delete')}
          </Button>
        </SettingRow>
      ))}
      <SettingRow label={t('devices.lianli-flex.templateNew')} description={t('devices.lianli-flex.templateNewHint')}>
        <Button size="sm" tone="neutral" disabled={busy || !sourceSerial} onClick={() => setNaming(true)}>
          {t('devices.lianli-flex.templateSave')}
        </Button>
        <Button size="sm" tone="neutral" disabled={busy} onClick={() => fileRef.current?.click()}>
          {t('devices.lianli-flex.templateImport')}
        </Button>
      </SettingRow>
      {message && <p className={styles.emptyNote} role="alert" data-settings-aside="true">{message}</p>}
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        className={styles.hiddenInput}
        data-settings-aside="true"
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void onFile(file);
        }}
      />
      <PromptModal
        open={naming}
        title={t('devices.lianli-flex.templateSaveTitle')}
        placeholder={t('devices.lianli-flex.templateNamePlaceholder')}
        maxLength={NAME_MAX_LENGTH}
        confirmLabel={t('devices.lianli-flex.templateSave')}
        validate={value => (value.trim() ? null : t('devices.lianli-flex.templateNameRequired'))}
        onCancel={() => setNaming(false)}
        onConfirm={value => {
          setNaming(false);
          if (sourceSerial) void run(() => saveLianLiFlexTemplate(value.trim(), sourceSerial), t('devices.lianli-flex.templateSaveFailed'));
        }}
      />
      <ConfirmModal
        open={deleting !== null}
        title={t('devices.lianli-flex.templateDeleteTitle')}
        message={t('devices.lianli-flex.templateDeleteMessage', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void run(() => deleteLianLiFlexTemplate(target.id), t('devices.lianli-flex.templateDeleteFailed'));
        }}
      />
    </SettingsSection>
  );
}
