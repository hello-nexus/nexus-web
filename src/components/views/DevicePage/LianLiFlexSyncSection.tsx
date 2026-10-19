import { useCallback, useEffect, useRef, useState } from 'react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import {
  getLianLiFlexSync,
  setLianLiFlexSync,
  type LianLiFlexSync,
  type LianLiFlexSyncPatch,
} from '../../../api/lianli-flex';
import { LianLiChainEffectControls, effectLabel, type LianLiEffectValue } from './LianLiChainEffectControls';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiDevicePage.module.scss';

const EDIT_GRACE_MS = 2500;
const POLL_MS = 4000;

/**
 * Quick sync for the wired LCD Flex fans: one merged animation across all of
 * them, in light sequence order, with a direction for each fan's slice.
 */
export function LianLiFlexSyncSection() {
  const { t } = useTranslation();
  const [data, setData] = useState<LianLiFlexSync | null>(null);
  const aliveRef = useRef(true);
  const lastEditRef = useRef(Number.NEGATIVE_INFINITY);

  const refresh = useCallback(async () => {
    const d = await getLianLiFlexSync().catch(() => null);
    if (aliveRef.current && d && performance.now() - lastEditRef.current > EDIT_GRACE_MS) setData(d);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  const preview = (patch: Partial<LianLiFlexSync>) => setData(prev => prev && { ...prev, ...patch });
  const commit = useCallback(async (patch: LianLiFlexSyncPatch) => {
    lastEditRef.current = performance.now();
    const look: Partial<LianLiFlexSync> = { ...patch, members: undefined };
    delete look.members;
    setData(prev => prev && { ...prev, ...look });
    if (!await setLianLiFlexSync(patch).catch(() => false)) {
      lastEditRef.current = Number.NEGATIVE_INFINITY;
      void refresh();
    }
  }, [refresh]);

  // A service without the sync route, or a single fan, has nothing to group.
  if (!data || data.members.length < 2) return null;

  const value: LianLiEffectValue = {
    mode: data.mode, speed: data.speed, direction: data.direction, brightness: data.brightness, colors: data.colors,
  };
  const directionOptions = [
    { value: '0', label: t('devices.lianli.directionLtr') },
    { value: '1', label: t('devices.lianli.directionRtl') },
  ];

  return (
    <SettingsSection title={t('devices.lianli-flex.syncSection')} boxClassName={styles.sectionBox}>
      <SettingToggle
        label={t('devices.lianli-flex.syncEnable')}
        description={t('devices.lianli-flex.syncHint')}
        checked={data.enabled}
        onChange={on => { void commit({ enabled: on }); }}
      />
      <LianLiChainEffectControls
        modes={data.modes}
        value={value}
        modeOptions={data.modes.map(e => ({ value: e.key, label: effectLabel(t, e.key) }))}
        modeValue={data.mode}
        disabled={!data.enabled}
        paletteDimmed={!data.enabled}
        trimPalette
        onModeChange={mode => { void commit({ mode }); }}
        onPreview={patch => preview(patch)}
        onCommit={patch => { void commit(patch); }}
      />
      {data.members.map(member => (
        <SettingSelect
          key={member.mac}
          label={t('devices.lianli-flex.syncMemberDirection', { fan: member.label })}
          value={String(member.sliceDirection)}
          options={directionOptions}
          disabled={!data.enabled}
          onChange={v => {
            const members = data.members.map(m => (m.mac === member.mac ? { ...m, sliceDirection: Number(v) } : m));
            preview({ members });
            void commit({ members: members.map(m => ({ mac: m.mac, sliceDirection: m.sliceDirection })) });
          }}
        />
      ))}
    </SettingsSection>
  );
}
