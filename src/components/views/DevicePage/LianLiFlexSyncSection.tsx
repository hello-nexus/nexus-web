import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import {
  getLianLiFlexSync,
  setLianLiFlexSync,
  type LianLiFlexSync,
  type LianLiFlexSyncPatch,
} from '../../../api/lianli-flex';
import type { LianLiWirelessChainLighting } from '../../../api/lianli-wireless';
import { LianLiChainEffectControls, effectLabel, type LianLiEffectValue } from './LianLiChainEffectControls';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiDevicePage.module.scss';

const EDIT_GRACE_MS = 2500;
const POLL_MS = 4000;

export interface LianLiFlexSyncState {
  data: LianLiFlexSync | null;
  preview: (patch: Partial<LianLiFlexSync>) => void;
  commit: (patch: LianLiFlexSyncPatch) => Promise<void>;
  refresh: () => Promise<void>;
  /** Applies a new light sequence locally, so a change sent before the next read keeps it. */
  reorder: (macs: readonly string[]) => void;
}

/**
 * The sync group of the wired LCD Flex fans, polled while `active`.
 * `onWritten` runs after a write the service accepted, for views that show the units it changed.
 */
export function useLianLiFlexSync(active: boolean, onWritten?: () => void): LianLiFlexSyncState {
  const [data, setData] = useState<LianLiFlexSync | null>(null);
  const aliveRef = useRef(true);
  const lastEditRef = useRef(Number.NEGATIVE_INFINITY);

  // Send order of reads: a response is applied only if no later-sent one was.
  const sentRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++sentRef.current;
    const d = await getLianLiFlexSync().catch(() => null);
    if (aliveRef.current && d && seq === sentRef.current && performance.now() - lastEditRef.current > EDIT_GRACE_MS) setData(d);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    if (!active) return () => { aliveRef.current = false; };
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
    };
  }, [active, refresh]);

  const preview = useCallback((patch: Partial<LianLiFlexSync>) => setData(prev => prev && { ...prev, ...patch }), []);

  const reorder = useCallback((macs: readonly string[]) => {
    lastEditRef.current = performance.now();
    setData(prev => {
      if (!prev) return prev;
      const rank = (mac: string) => { const i = macs.indexOf(mac); return i < 0 ? macs.length : i; };
      const members = [...prev.members].sort((a, b) => rank(a.mac) - rank(b.mac)).map((m, sortIndex) => ({ ...m, sortIndex }));
      return { ...prev, members };
    });
  }, []);

  const commit = useCallback(async (patch: LianLiFlexSyncPatch) => {
    lastEditRef.current = performance.now();
    const look: Partial<LianLiFlexSync> = { ...patch, members: undefined };
    delete look.members;
    setData(prev => prev && { ...prev, ...look });
    const ok = await setLianLiFlexSync(patch).catch(() => false);
    // The write is settled either way, so the next read is canonical.
    lastEditRef.current = Number.NEGATIVE_INFINITY;
    await refresh();
    if (ok) onWritten?.();
  }, [refresh, onWritten]);

  // A read the caller asks for is wanted now, so it skips the post-edit grace.
  const reload = useCallback(async () => {
    lastEditRef.current = Number.NEGATIVE_INFINITY;
    await refresh();
  }, [refresh]);

  return { data, preview, commit, refresh: reload, reorder };
}

/** A unit under Lighting-page control or on Per zone loses that state when sync takes the fans. */
export const syncReplacesState = (chains: readonly LianLiWirelessChainLighting[]): boolean =>
  chains.some(c => c.mode === 'custom' || c.mode === 'perZone');

/** Whether the group is synced: every fan then follows the shared look. */
export const isSyncOn = (sync: LianLiFlexSyncState): boolean => !!sync.data && sync.data.members.length > 1 && sync.data.enabled;

/**
 * Quick sync for the wired LCD Flex fans: one merged animation across all of
 * them, in light sequence order, with a direction for each fan's slice.
 */
export function LianLiFlexSyncSection({ sync, chains, names }: { sync: LianLiFlexSyncState; chains: readonly LianLiWirelessChainLighting[]; names: ReadonlyMap<string, string> }) {
  const { t } = useTranslation();
  const { data, preview, commit } = sync;
  const [confirmOn, setConfirmOn] = useState(false);

  // A service without the sync route, or a single fan, has nothing to group.
  if (!data || data.members.length < 2) return null;

  // A stored mode that is not a group effect (a fan left on per zone) shows the first effect instead of a blank.
  const mode = data.modes.some(e => e.key === data.mode) ? data.mode : data.modes[0]?.key ?? '';
  const value: LianLiEffectValue = {
    mode, speed: data.speed, direction: data.direction, brightness: data.brightness, colors: data.colors,
  };
  // The names come from the Lighting tab, so both numbering orders agree.
  const memberName = (m: LianLiFlexSync['members'][number]) => names.get(m.mac) ?? t(
    m.family === 'slInfFlex' ? 'devices.lianli-wireless.fanTypeSlInfFlex' : 'devices.lianli-wireless.fanTypeTlFlex',
  );
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
        onChange={on => {
          if (on && syncReplacesState(chains)) setConfirmOn(true);
          else void commit({ enabled: on });
        }}
      />
      <LianLiChainEffectControls
        modes={data.modes}
        value={value}
        modeOptions={data.modes.map(e => ({ value: e.key, label: effectLabel(t, e.key) }))}
        modeValue={mode}
        disabled={!data.enabled}
        paletteDimmed={!data.enabled}
        trimPalette
        onModeChange={next => { void commit({ mode: next }); }}
        onPreview={patch => preview(patch)}
        onCommit={patch => { void commit(patch); }}
      />
      {data.members.map(member => (
        <SettingSelect
          key={member.mac}
          label={t('devices.lianli-flex.syncMemberDirection', { fan: memberName(member) })}
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
      <ConfirmModal
        open={confirmOn}
        title={t('devices.lianli-flex.syncConfirmTitle')}
        message={t('devices.lianli-flex.syncConfirmMessage')}
        destructive={false}
        confirmLabel={t('devices.lianli-flex.syncConfirmButton')}
        onCancel={() => setConfirmOn(false)}
        onConfirm={() => { setConfirmOn(false); void commit({ enabled: true }); }}
      />
    </SettingsSection>
  );
}
