import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SettingRow, SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { LightingPageSwitch } from './LightingPageSwitch';
import {
  getLianLiWirelessLighting,
  setLianLiWirelessChainLighting,
  type LianLiChainLightingApi,
  type LianLiFlexZone,
  type LianLiWirelessChainLighting,
  type LianLiWirelessChainPatch,
  type LianLiWirelessLane,
  type LianLiWirelessLighting,
} from '../../../api/lianli-wireless';
import { fanTypeKey } from './LianLiWirelessFansTab';
import { LIANLI_DEFAULT_COLORS as DEFAULT_COLORS, LianLiChainEffectControls, effectLabel } from './LianLiChainEffectControls';
import { applyChainPatch, canMerge, mergeLeaderMac, moveInSequence, sortBySequence } from './lianliChainUtils';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiDevicePage.module.scss';

const WIRELESS_LIGHTING_API: LianLiChainLightingApi = {
  get: () => getLianLiWirelessLighting(),
  set: (mac, patch) => setLianLiWirelessChainLighting(mac, patch),
};

const MODE_CUSTOM = 'custom';
const MODE_PER_LANE = 'perLane';
const MODE_PER_ZONE = 'perZone';
const DEFAULT_LANE_MODE = 'rainbow';
const DEFAULT_EFFECT = 'rainbow';

type Translate = ReturnType<typeof useTranslation>['t'];

function chainTitle(t: Translate, chain: LianLiWirelessChainLighting): string {
  return chain.kind === 'strimer'
    ? chain.model
    : t(`devices.lianli-wireless.${fanTypeKey(chain.fanType)}` as Parameters<Translate>[0]);
}

function lanesOf(chain: LianLiWirelessChainLighting): LianLiWirelessLane[] {
  return Array.from({ length: chain.lanes }, (_, i) => chain.laneSettings[i] ?? {
    mode: DEFAULT_LANE_MODE,
    direction: 0,
    color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  });
}

const ZONE_LABEL_KEYS: Record<LianLiFlexZone['id'], string> = {
  up: 'devices.lianli-flex.zoneUp',
  down: 'devices.lianli-flex.zoneDown',
  center: 'devices.lianli-flex.zoneCenter',
  inner: 'devices.lianli-flex.zoneInner',
  outer: 'devices.lianli-flex.zoneOuter',
};

interface LianLiWirelessLightingTabProps {
  onSectionNavigate?: (section: string) => void;
  /** The lighting endpoints of the device family; the wireless ones by default. */
  api?: LianLiChainLightingApi;
  /** Rendered above the chains, for example a group control. */
  header?: ReactNode;
  /** Rendered below the chains. */
  footer?: ReactNode;
  /** Extra rows at the end of one chain's section. */
  chainExtra?: (chain: LianLiWirelessChainLighting, reload: () => void) => ReactNode;
  /** The wired fans are synced as a group, so their own look controls do nothing. */
  syncOn?: boolean;
}

/** Per-chain animation picker for the Strimer cables and fan chains bound to the controller. */
export function LianLiWirelessLightingTab({ onSectionNavigate, api = WIRELESS_LIGHTING_API, header, footer, chainExtra, syncOn = false }: LianLiWirelessLightingTabProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<LianLiWirelessLighting | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const d = await api.get();
    if (aliveRef.current && d) setData(d);
  }, [api]);

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

  const preview = useCallback((mac: string, patch: LianLiWirelessChainPatch) => {
    setData(prev => prev && {
      ...prev,
      chains: prev.chains.map(c => (c.mac === mac ? applyChainPatch(c, patch) : c)),
    });
  }, []);

  const commit = useCallback(async (mac: string, patch: LianLiWirelessChainPatch) => {
    preview(mac, patch);
    // effectMode is derived by the service; it only feeds the preview.
    if (!await api.set(mac, { ...patch, effectMode: undefined })) void refresh();
  }, [api, preview, refresh]);

  const reset = useCallback(async (mac: string) => {
    const ok = await (api.reset?.(mac) ?? Promise.resolve(false)).catch(() => false);
    await refresh();
    return ok;
  }, [api, refresh]);

  const move = useCallback((mac: string, delta: -1 | 1) => {
    if (!data) return;
    for (const { mac: m, sortIndex } of moveInSequence(data.chains, mac, delta)) void commit(m, { sortIndex });
  }, [data, commit]);

  if (!data) return null;
  const chains = sortBySequence(data.chains);
  // The service names the leader when it can; otherwise the same rule applies here.
  const leaderMac = data.mergeLeaderMac !== undefined ? data.mergeLeaderMac : mergeLeaderMac(chains);
  const leader = chains.find(c => c.mac === leaderMac);
  return (
    <>
      {header}
      {chains.map((chain, i) => (
        <ChainSection
          key={chain.mac}
          chain={chain}
          laneModes={data.laneModes}
          onPreview={patch => preview(chain.mac, patch)}
          onCommit={patch => { void commit(chain.mac, patch); }}
          extra={chainExtra?.(chain, () => { void refresh(); })}
          followsTitle={leader && leader.mac !== chain.mac ? chainTitle(t, leader) : undefined}
          onReset={api.reset ? () => reset(chain.mac) : undefined}
          onMove={chains.length > 1 && chain.sortIndex !== undefined ? delta => move(chain.mac, delta) : undefined}
          first={i === 0}
          synced={syncOn && chain.supportsZones === true}
          last={i === chains.length - 1}
          onSectionNavigate={onSectionNavigate}
        />
      ))}
      {footer}
    </>
  );
}

interface ChainSectionProps {
  chain: LianLiWirelessChainLighting;
  laneModes: string[];
  onPreview: (patch: LianLiWirelessChainPatch) => void;
  onCommit: (patch: LianLiWirelessChainPatch) => void;
  /** Present when the family can restore a fan's default look. */
  onReset?: () => Promise<boolean>;
  /** Title of the unit whose look this one follows while merged, when it is not the leader. */
  followsTitle?: string;
  /** Extra rows at the end of the section. */
  extra?: ReactNode;
  /** Present when the fans have an order to set. */
  onMove?: (delta: -1 | 1) => void;
  first: boolean;
  last: boolean;
  /** The group sync drives this fan's look. */
  synced: boolean;
  onSectionNavigate?: (section: string) => void;
}

function ChainSection({ chain, laneModes, onPreview, onCommit, onReset, extra, followsTitle, onMove, first, last, synced, onSectionNavigate }: ChainSectionProps) {
  const { t } = useTranslation();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetFailed, setResetFailed] = useState(false);
  const lightingPage = chain.mode === MODE_CUSTOM;
  // With no saved choice the switch shows what the chain reports it is doing.
  const argbOn = chain.motherboardArgb ?? chain.playingMotherboardArgb === true;
  // Effect controls do nothing while the chain plays its motherboard input.
  const locked = lightingPage || argbOn;
  // The animation the chain plays when the Lighting page is not driving it.
  const effectKey = lightingPage ? chain.effectMode ?? DEFAULT_EFFECT : chain.mode;
  // A merged unit that is not the leader plays the leader's look, so its own look fields do nothing.
  const follower = !synced && chain.merge === true && canMerge(chain) && followsTitle !== undefined;
  const lookLocked = locked || follower || synced;
  const perLane = chain.supportsPerLane && effectKey === MODE_PER_LANE;
  const perZone = chain.supportsZones === true && effectKey === MODE_PER_ZONE;

  const effectOptions = chain.modes.map(e => ({ value: e.key, label: effectLabel(t, e.key) }));
  // The choices that are not effects come first, set apart from the effect list.
  const modeOptions = [
    ...(chain.supportsZones ? [{ value: MODE_PER_ZONE, label: t('devices.lianli-flex.modePerZone') }, { value: '', label: '', divider: true }] : []),
    ...effectOptions,
    ...(chain.supportsPerLane ? [{ value: MODE_PER_LANE, label: t('devices.lianli-wireless.strimerModePerLane') }] : []),
  ];
  const directionOptions = [
    { value: '0', label: t('devices.lianli.directionLtr') },
    { value: '1', label: t('devices.lianli.directionRtl') },
  ];

  const lanes = lanesOf(chain);
  const setLane = (i: number, lane: Partial<LianLiWirelessLane>, commit: boolean) => {
    const next = lanes.map((l, idx) => (idx === i ? { ...l, ...lane } : l));
    (commit ? onCommit : onPreview)({ laneSettings: next });
  };

  return (
    <>
    <SettingsSection title={chainTitle(t, chain)} boxClassName={styles.sectionBox}>
      {(chain.argbCableConnected || argbOn) && (
        <SettingToggle
          label={t('devices.motherboardArgb.label')}
          description={t('devices.motherboardArgb.hint')}
          checked={argbOn}
          onChange={on => onCommit({ motherboardArgb: on })}
        />
      )}
      <LightingPageSwitch
        on={lightingPage}
        disabled={argbOn}
        onChange={on => onCommit(on ? { mode: MODE_CUSTOM } : { mode: effectKey, effectMode: effectKey })}
        onSectionNavigate={onSectionNavigate}
      />

      <LianLiChainEffectControls
        modes={chain.modes}
        value={{ mode: effectKey, speed: chain.speed, direction: chain.direction, brightness: chain.brightness, colors: chain.colors }}
        modeOptions={modeOptions}
        modeValue={effectKey}
        disabled={lookLocked}
        paletteDimmed={lightingPage || follower || synced}
        trimPalette={chain.supportsZones === true}
        hideBrightness={perZone}
        forceSpeed={perLane}
        onModeChange={v => onCommit({ mode: v, effectMode: v })}
        onPreview={onPreview}
        onCommit={onCommit}
      >
        {synced && <SettingRow label={t('devices.lianli-flex.followsSync')} />}
        {follower && <SettingRow label={t('devices.lianli-flex.followsLeader', { leader: followsTitle })} />}
        {perZone && (chain.zones ?? []).map(zone => (
          <Fragment key={zone.id}>
            <p className={styles.zoneHeading} data-settings-aside="true">
              {t(ZONE_LABEL_KEYS[zone.id] as Parameters<Translate>[0])}
            </p>
            <LianLiChainEffectControls
              modes={chain.modes}
              value={zone}
              modeOptions={effectOptions}
              modeValue={zone.mode}
              disabled={locked || synced}
              paletteDimmed={lightingPage || synced}
              trimPalette
              onModeChange={v => onCommit({ zones: [{ id: zone.id, mode: v }] })}
              onPreview={patch => onPreview({ zones: [{ id: zone.id, ...patch }] })}
              onCommit={patch => onCommit({ zones: [{ id: zone.id, ...patch }] })}
            />
          </Fragment>
        ))}
        {(canMerge(chain) || chain.supportsZones) && (
          <SettingToggle
            label={t('devices.lianli-wireless.merge')}
            description={canMerge(chain) || !chain.supportsZones
              ? t(chain.supportsZones ? 'devices.lianli-flex.mergeHint' : 'devices.lianli-wireless.mergeHint')
              : t('devices.lianli-flex.mergeNeedsEffect')}
            checked={chain.merge ?? false}
            onChange={on => onCommit({ merge: on })}
            disabled={locked || synced || (chain.supportsZones === true && !canMerge(chain))}
          />
        )}
      </LianLiChainEffectControls>

      {chain.upDownSwap != null && (
        <SettingToggle
          label={t('devices.lianli-flex.upDownSwap')}
          description={t('devices.lianli-flex.upDownSwapHint')}
          checked={chain.upDownSwap}
          onChange={on => onCommit({ upDownSwap: on })}
          disabled={argbOn}
        />
      )}

      {onMove && (
        <SettingRow label={t('devices.lianli-flex.lightSequence')} description={t('devices.lianli-flex.lightSequenceHint')}>
          <Button size="sm" tone="neutral" disabled={first} onClick={() => onMove(-1)}>
            {t('devices.lianli-wireless.orderMoveLeft')}
          </Button>
          <Button size="sm" tone="neutral" disabled={last} onClick={() => onMove(1)}>
            {t('devices.lianli-wireless.orderMoveRight')}
          </Button>
        </SettingRow>
      )}

      {onReset && (
        <SettingRow label={t('devices.lianli-flex.resetLighting')} description={t('devices.lianli-flex.resetLightingHint')}>
          <Button size="sm" tone="neutral" onClick={() => { setResetFailed(false); setConfirmReset(true); }}>
            {t('devices.lianli-flex.resetLightingButton')}
          </Button>
        </SettingRow>
      )}
      {extra}
      {resetFailed && (
        <p className={styles.customNote} role="alert" data-settings-aside="true">
          {t('devices.lianli-flex.resetFailed')}
        </p>
      )}

      {perLane && lanes.map((lane, i) => (
        <div key={i} className={`${styles.colorBlock} ${lightingPage ? styles.rowDisabled : ''}`} data-settings-aside="true">
          <SettingSelect
            label={t('devices.lianli-wireless.strimerLaneN', { n: i + 1 })}
            value={lane.mode}
            onChange={v => setLane(i, { mode: v }, true)}
            options={laneModes.map(key => ({ value: key, label: effectLabel(t, key) }))}
            disabled={locked}
          />
          <SettingSelect
            label={t('devices.lianli.lightingDirection')}
            value={String(lane.direction)}
            onChange={v => setLane(i, { direction: Number(v) }, true)}
            options={directionOptions}
            disabled={locked}
          />
          <HsvPicker
            value={lane.color}
            onPreview={(hex: string) => setLane(i, { color: hex }, false)}
            onCommit={(hex: string) => setLane(i, { color: hex }, true)}
          />
        </div>
      ))}
    </SettingsSection>

    <ConfirmModal
      open={confirmReset}
      title={t('devices.lianli-flex.resetConfirmTitle')}
      message={t(lightingPage ? 'devices.lianli-flex.resetConfirmMessageLightingPage' : 'devices.lianli-flex.resetConfirmMessage')}
      destructive={false}
      confirmLabel={t('devices.lianli-flex.resetLighting')}
      onCancel={() => setConfirmReset(false)}
      onConfirm={() => { setConfirmReset(false); void onReset?.().then(ok => setResetFailed(!ok)); }}
    />
    </>
  );
}
