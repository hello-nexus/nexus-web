import { useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { SettingRow, SettingSelect } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { Placeholder } from '../Placeholder';
import {
  getNollieBoards,
  setNollieStandalone,
  type NollieBoard,
  type NollieStandalonePatch,
} from '../../../api/nollie';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

interface NollieDevicePageProps {
  onSectionNavigate?: (section: string) => void;
}

/**
 * One section per attached controller. The strips on each port are cards on
 * the Lighting page; what lives here is the board itself and what it runs
 * once Nexus lets go of it.
 */
export function NollieDevicePage({ onSectionNavigate }: NollieDevicePageProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [boards, setBoards] = useState<NollieBoard[] | null>(null);
  const [saving, setSaving] = useState(false);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const list = await getNollieBoards();
    if (!aliveRef.current) return;
    if (list) setBoards(list);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const commit = useCallback(async (id: string, patch: NollieStandalonePatch) => {
    setSaving(true);
    try {
      await setNollieStandalone(id, patch);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, []);

  const patchBoard = (id: string, patch: NollieStandalonePatch) => {
    setBoards(prev => prev?.map(b => (b.id === id
      ? { ...b, standaloneMode: patch.mode ?? b.standaloneMode, standaloneColor: patch.color ?? b.standaloneColor }
      : b)) ?? prev);
  };

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand name
        title="Nollie"
        actions={saving ? <span className={styles.savingBadge}>{t('devices.saving')}</span> : null}
      />
      <div className={`${styles.pageBody} pageBody`}>
        {boards !== null && boards.length === 0 && (
          <Placeholder title={t('devices.nollie.noBoards')} />
        )}
        {(boards ?? []).map(board => (
          <SettingsSection
            key={board.id}
            title={board.name}
            description={board.serial ? t('devices.nollie.serial', { serial: board.serial }) : undefined}
            boxClassName={styles.sectionBox}
          >
            <SettingRow label={t('devices.nollie.channels')}>
              <span className={styles.rowValue}>{localizeNumbers(String(board.channels), numberFormat)}</span>
            </SettingRow>

            {board.supportsStandalone ? (
              <>
                <SettingSelect
                  label={t('devices.nollie.standaloneMode')}
                  description={t('devices.nollie.standaloneDescription')}
                  descriptionBelow
                  value={board.standaloneMode}
                  onChange={v => {
                    const mode = v === 'builtin' ? 'builtin' : 'static';
                    patchBoard(board.id, { mode });
                    void commit(board.id, { mode });
                  }}
                  options={[
                    { value: 'static', label: t('devices.nollie.modeStatic') },
                    ...(board.supportsBuiltInEffect
                      ? [{ value: 'builtin', label: t('devices.nollie.modeBuiltIn') }]
                      : []),
                  ]}
                />
                {board.standaloneMode === 'builtin' && (
                  <p className={styles.customNote} data-settings-aside="true">{t('devices.nollie.modeBuiltInHint')}</p>
                )}
                {board.standaloneMode === 'static' && (
                  <SettingRow label={t('devices.nollie.standaloneColor')} align="start">
                    <HsvPicker
                      value={board.standaloneColor}
                      onPreview={(hex: string) => patchBoard(board.id, { color: hex })}
                      onCommit={(hex: string) => {
                        patchBoard(board.id, { color: hex });
                        void commit(board.id, { color: hex });
                      }}
                    />
                  </SettingRow>
                )}
              </>
            ) : (
              <p className={styles.customNote} data-settings-aside="true">{t('devices.nollie.noStandalone')}</p>
            )}

            <p className={styles.customNote} data-settings-aside="true">{t('devices.nollie.portsNote')}</p>
            {onSectionNavigate && (
              <Button
                className={styles.lightingLink}
                size="sm"
                tone="neutral"
                icon={<Lightbulb size={14} />}
                onClick={() => onSectionNavigate('lighting')}
              >
                {t('smartLights.colorOnLightingPage')}
              </Button>
            )}
          </SettingsSection>
        ))}
      </div>
    </div>
  );
}
