import { useCallback, useEffect, useRef, useState } from 'react';
import { Fan } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingSelect, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import {
  APPLY_FAN,
  LIANLI_FLEX_CHANNEL_PREFIX,
  LIANLI_FLEX_PROFILES,
  getLianLiFlexFanProfile,
  restoreLianLiFlexFanDefault,
  setLianLiFlexFanProfile,
  setLianLiFlexFanSync,
  type LianLiFlexFanProfile,
  type LianLiFlexFanProfilePatch,
  type LianLiFlexFanSource,
  type LianLiFlexProfileKey,
} from '../../../api/lianli-flex';
import { LianLiFlexApplyAllRow } from './LianLiFlexApplyAllRow';
import { coolingGroupAnchor } from '../../../lib/pageAnchors';
import type { DashboardSectionNavigate } from '../../../panel/engine/panelLayoutHelpers';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import rowStyles from './CoolingFanRow.module.scss';

const POLL_MS = 2000;
// A poll that started before an edit would snap the control back; hold it off for a beat.
const EDIT_GRACE_MS = 2500;
const SOURCES: LianLiFlexFanSource[] = ['cpu', 'gpu', 'water'];
const SOURCE_LABEL_KEYS: Record<LianLiFlexFanSource, string> = {
  cpu: 'devices.lianli-flex.sourceCpu',
  gpu: 'devices.lianli-flex.sourceGpu',
  water: 'devices.lianli-flex.sourceWater',
};

type Translate = ReturnType<typeof useTranslation>['t'];

/** What a fan with no profile reads: its speed is set by hand. */
const MANUAL = '';

function profileLabel(t: Translate, key: LianLiFlexProfileKey | typeof MANUAL): string {
  switch (key) {
    case MANUAL: return t('cooling.card.manual');
    case 'quiet': return t('devices.lianli-flex.profileQuiet');
    case 'stdsp': return t('devices.lianli-flex.profileStd');
    case 'highsp': return t('devices.lianli-flex.profileHigh');
    case 'fullsp': return t('devices.lianli-flex.profileFull');
    case 'fixed': return t('devices.lianli-flex.profileFixed');
    default: return t('devices.lianli-flex.profileCustomN', { n: Number(key.slice('custom'.length)) });
  }
}

/** The badge a fan shows on the Cooling tab: its profile, or that it follows the board. */
export function flexFanModeLabel(t: Translate, data: LianLiFlexFanProfile): string {
  return data.mbSync ? t('cooling.card.bios') : profileLabel(t, data.profile);
}

export interface LianLiFlexProfiles {
  byMac: Record<string, LianLiFlexFanProfile>;
  commit: (mac: string, patch: LianLiFlexFanProfilePatch) => Promise<void>;
  commitAllMbSync: (enabled: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

/** The fan profile of every given unit, polled while mounted; edits show at once and are saved immediately. */
export function useLianLiFlexProfiles(macs: readonly string[]): LianLiFlexProfiles {
  const [byMac, setByMac] = useState<Record<string, LianLiFlexFanProfile>>({});
  const aliveRef = useRef(true);
  const lastEditRef = useRef(Number.NEGATIVE_INFINITY);
  const key = macs.join(',');

  const refresh = useCallback(async () => {
    const list = key ? key.split(',') : [];
    const results = await Promise.all(list.map(mac => getLianLiFlexFanProfile(mac).catch(() => null)));
    if (!aliveRef.current || performance.now() - lastEditRef.current <= EDIT_GRACE_MS) return;
    const next: Record<string, LianLiFlexFanProfile> = {};
    results.forEach((d, i) => { if (d) next[list[i]] = d; });
    setByMac(next);
  }, [key]);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  const reread = useCallback(() => {
    lastEditRef.current = Number.NEGATIVE_INFINITY;
    return refresh();
  }, [refresh]);

  const commit = useCallback(async (mac: string, patch: LianLiFlexFanProfilePatch) => {
    lastEditRef.current = performance.now();
    setByMac(prev => (prev[mac] ? { ...prev, [mac]: { ...prev[mac], ...patch } } : prev));
    if (!await setLianLiFlexFanProfile(mac, patch).catch(() => false)) await reread();
  }, [reread]);

  const commitAllMbSync = useCallback(async (enabled: boolean) => {
    lastEditRef.current = performance.now();
    setByMac(prev => Object.fromEntries(Object.entries(prev).map(([mac, d]) => [mac, { ...d, mbSync: enabled }])));
    if (!await setLianLiFlexFanSync(enabled).catch(() => false)) await reread();
  }, [reread]);

  return { byMac, commit, commitAllMbSync, refresh: reread };
}

interface LianLiFlexFanProfileProps {
  mac: string;
  title: string;
  data: LianLiFlexFanProfile;
  profiles: LianLiFlexProfiles;
  onSectionNavigate?: DashboardSectionNavigate;
}

/**
 * One LCD Flex fan's profile on the Cooling tab. The profile is a curve the
 * Cooling page also lists, so the points are edited there; this section picks
 * the profile, its temperature source and the start/stop and fixed speed.
 */
export function LianLiFlexFanProfileSection({ mac, title, data, profiles, onSectionNavigate }: LianLiFlexFanProfileProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [confirmRestore, setConfirmRestore] = useState(false);
  const commit = (patch: LianLiFlexFanProfilePatch) => { void profiles.commit(mac, patch); };

  // A fan that follows the board has no profile to edit.
  const manual = data.profile === MANUAL;
  const locked = data.mbSync;
  // Manual is only shown while it is the state; picking a profile leaves it for good.
  const profileOptions = [
    ...(manual ? [{ value: MANUAL, label: profileLabel(t, MANUAL) }] : []),
    ...LIANLI_FLEX_PROFILES.map(key => ({ value: key, label: profileLabel(t, key) })),
  ];

  return (
    <SettingsSection title={t('devices.lianli-flex.profileSection', { device: title })} boxClassName={rowStyles.rows}>
      <SettingToggle
        label={t('devices.lianli-flex.mbSync')}
        description={t('devices.lianli-flex.mbSyncHint')}
        checked={data.mbSync}
        onChange={on => commit({ mbSync: on })}
      />
      <SettingSelect
        label={t('devices.lianli-flex.profileLabel')}
        value={data.profile}
        options={profileOptions}
        disabled={locked}
        onChange={v => { if (v !== MANUAL) commit({ profile: v as LianLiFlexProfileKey }); }}
      />
      {data.profile === 'fixed' ? (
        <SettingSlider
          editable
          trackFill
          label={t('devices.lianli-flex.fixedSpeed')}
          value={data.fixedPercent}
          min={0}
          max={100}
          step={1}
          formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
          ariaLabel={t('devices.lianli-flex.fixedSpeed')}
          disabled={locked}
          onChange={(v: number, done?: boolean) => { if (done) commit({ fixedPercent: Math.round(v) }); }}
          onCommit={(v: number) => commit({ fixedPercent: Math.round(v) })}
        />
      ) : (
        <>
          <SettingRow
            label={t('devices.lianli-flex.sourceLabel')}
            description={data.sourceAvailable.water ? undefined : t('devices.lianli-flex.sourceWaterHint')}
            disabled={locked || manual}
          >
            <ChipGroup
              ariaLabel={t('devices.lianli-flex.sourceLabel')}
              activeKey={data.source}
              onChange={key => commit({ source: key as LianLiFlexFanSource })}
              options={SOURCES.map(key => ({
                key,
                label: t(SOURCE_LABEL_KEYS[key] as Parameters<Translate>[0]),
                disabled: !data.sourceAvailable[key],
              }))}
            />
          </SettingRow>
          <SettingToggle
            label={t('devices.lianli-flex.startStop')}
            description={t('devices.lianli-flex.startStopHint')}
            checked={data.startStop}
            disabled={locked || manual}
            onChange={on => commit({ startStop: on })}
          />
        </>
      )}
      {onSectionNavigate && (
        <SettingRow label={t('devices.lianli-flex.curveEditor')} description={t('devices.lianli-flex.curveEditorHint')}>
          <Button
            size="sm"
            tone="neutral"
            icon={<Fan size={14} />}
            onClick={() => onSectionNavigate('cooling', { scrollAnchors: [coolingGroupAnchor(`lianli-flex:${mac}`)], coolingFanId: `${LIANLI_FLEX_CHANNEL_PREFIX}${mac}:port0` })}
          >
            {t('devices.coolingPage.go')}
          </Button>
        </SettingRow>
      )}
      <SettingRow label={t('devices.lianli-flex.restoreProfile')} description={t('devices.lianli-flex.restoreProfileHint')}>
        <Button size="sm" tone="neutral" onClick={() => setConfirmRestore(true)}>
          {t('devices.lianli-flex.restoreProfileButton')}
        </Button>
      </SettingRow>
      <LianLiFlexApplyAllRow mac={mac} what={APPLY_FAN} onApplied={() => { void profiles.refresh(); }} />
      <ConfirmModal
        open={confirmRestore}
        title={t('devices.lianli-flex.restoreProfileTitle')}
        message={t('devices.lianli-flex.restoreProfileMessage')}
        confirmLabel={t('devices.lianli-flex.restoreProfileButton')}
        destructive={false}
        onCancel={() => setConfirmRestore(false)}
        onConfirm={() => {
          setConfirmRestore(false);
          void restoreLianLiFlexFanDefault(mac).catch(() => false).then(() => profiles.refresh());
        }}
      />
    </SettingsSection>
  );
}
