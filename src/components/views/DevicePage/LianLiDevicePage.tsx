import { useCallback, useEffect, useRef, useState } from 'react';
import { Cable, Fan, Lightbulb, Unplug } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Select } from '../../common/Select/Select';
import { SettingRow, SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { CoolingPageShortcut, LightingPageShortcut } from './CoolingPageLink';
import type { DashboardSectionNavigate } from '../../../panel/engine/panelLayoutHelpers';
import { lianLiCoolingAnchors, lianLiLightingAnchors } from '../../../lib/pageAnchors';
import { CoolingFanRow, useCoolingChannels } from './CoolingFanRow';
import { LightingPageSwitch } from './LightingPageSwitch';
import {
  getLianLiState,
  getLianLiLighting,
  lianLiHubName,
  setLianLiFanCount,
  setLianLiLighting,
  LIANLI_PRIMARY_HUB,
  type LianLiState,
  type LianLiEffect,
  type LianLiLighting,
  type LianLiLightingPatch,
  type LianLiPortLook,
  type LianLiRing,
} from '../../../api/lianli';
import { LianLiEffectControls } from './LianLiEffectControls';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { formatNumber } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';
import rowStyles from './CoolingFanRow.module.scss';
import { useReportDeviceWaiting } from './deviceDetecting';
import { fetchDeviceStructure, setDeviceChain, type ChainEntry } from '../../../api/lighting';

const PORT_COUNT = 4;
const DEFAULT_MAX_FANS = 4;
// Mode key under which the Lighting page drives the device.
const LIGHTING_PAGE_MODE = 'custom';
// Select value for editing every port at once.
const ALL_PORTS = 'all';
// Polling interval matches the service RpmPollMs.
const RPM_POLL_MS = 2000;

type LianLiTab = 'devices' | 'lighting' | 'cooling';

interface LianLiDevicePageProps {
  /** Which wired hub the page shows. */
  hubId?: string;
  onSectionNavigate?: DashboardSectionNavigate;
}

export function LianLiDevicePage({ hubId = LIANLI_PRIMARY_HUB, onSectionNavigate }: LianLiDevicePageProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<LianLiTab>('devices');
  const { numberFormat } = useUnitPrefs();
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  useReportDeviceWaiting(connection !== 'connected');
  const [lianliState, setLianliState] = useState<LianLiState | null>(null);
  const [lighting, setLighting] = useState<LianLiLighting | null>(null);
  const [saving, setSaving] = useState(false);
  // Port the effect controls edit; null edits every port.
  const [target, setTarget] = useState<number | null>(null);
  const aliveRef = useRef(true);
  const connectedRef = useRef(false);

  const refresh = useCallback(async () => {
    const s = await getLianLiState(hubId);
    if (!aliveRef.current) return;
    if (s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setLianliState(null);
      setLighting(null);
      return;
    }
    connectedRef.current = true;
    setConnection('connected');
    setLianliState(s);
    const lt = await getLianLiLighting(hubId).catch(() => null);
    if (!aliveRef.current) return;
    if (lt) setLighting(lt);
  }, [hubId]);

  // Steady-state telemetry tick: refresh only the read-only RPM so a poll
  // never overwrites an in-progress lighting/fan-count edit. While
  // disconnected, defer to the full refresh so a reconnect repopulates state.
  const refreshRpm = useCallback(async () => {
    if (!connectedRef.current) { void refresh(); return; }
    const s = await getLianLiState(hubId);
    if (!aliveRef.current || s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setLianliState(null);
      setLighting(null);
      return;
    }
    setLianliState(prev => (prev ? { ...prev, rpm: s.rpm } : s));
  }, [hubId, refresh]);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => { void refreshRpm(); }, RPM_POLL_MS);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refresh, refreshRpm]);

  const commitFanCount = useCallback(async (port: number, count: number) => {
    const fansPerPort = [...(lianliState?.fansPerPort ?? [])];
    fansPerPort[port] = count;
    setLianliState(prev => (prev ? { ...prev, fansPerPort } : prev));
    setSaving(true);
    try {
      await setLianLiFanCount(port, count, hubId);
      // A header too short for the new chain drops off the source list; refetching shows it as unchosen.
      if (lighting?.argbSync && lighting.argbSyncSource
        && !await wireArgbSyncFans(lighting.argbSyncSource, longestChain(fansPerPort))) {
        void refresh();
      }
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, [hubId, lianliState, lighting, refresh]);

  const commitLighting = useCallback(async (patch: LianLiLightingPatch) => {
    setSaving(true);
    try {
      return (await setLianLiLighting(patch, hubId)) !== null;
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, [hubId]);

  if (connection === 'disconnected') {
    return (
      <div className={styles.page}>
        <ViewHeader title={lianLiHubName(hubId)} />
        <div className={`${styles.pageBody} pageBody`}>
          <EmptyState icon={<Unplug size={40} />} title={t('devices.lianli.notConnected')} />
        </div>
      </div>
    );
  }

  const stateLoaded = lianliState !== null;
  const lightingLoaded = lighting !== null;

  // The animation the device plays when the Lighting page is not driving it.
  const effectModes = (lighting?.modes ?? []).filter(m => m.key !== LIGHTING_PAGE_MODE);
  const effectKey = lighting
    ? (lighting.mode !== LIGHTING_PAGE_MODE ? lighting.mode : lighting.effectMode ?? effectModes[0]?.key ?? '')
    : '';
  const selectedMode = effectModes.find(m => m.key === effectKey) ?? null;
  const isCustomMode = lighting?.mode === LIGHTING_PAGE_MODE;
  const argbSyncOn = lighting?.argbSyncSupported === true && lighting.argbSync === true;
  const controlsDisabled = !lightingLoaded || isCustomMode;
  // A merged animation spans every port, so per-port and per-ring looks give way to it.
  const mergeActive = !!lighting?.merge && !!selectedMode?.mergeable;
  const mergeOrder = lighting?.mergeOrder ?? [];
  // Ports the picker offers: those with fans, plus any keeping its own look so it can be reset.
  const pickablePorts = (lianliState?.fansPerPort ?? []).flatMap((n, p) => (n > 0 || lighting?.ports?.[p] ? [p] : []));
  const targetPort = target !== null && !mergeActive && pickablePorts.includes(target) ? target : null;
  const portField = targetPort === null ? {} : { port: targetPort };
  const hubLook: LianLiPortLook = {
    whole: {
      mode: effectKey,
      speed: lighting?.speed ?? 0,
      direction: lighting?.direction ?? 0,
      brightness: lighting?.brightness ?? 0,
      colors: lighting?.colors ?? [],
    },
    innerRing: lighting?.innerRing ?? null,
    outerRing: lighting?.outerRing ?? null,
  };
  const ownLook = targetPort === null ? null : lighting?.ports?.[targetPort] ?? null;
  const look = ownLook ?? hubLook;
  const split = !!lighting?.ringModes && !!look.innerRing && !!look.outerRing;

  // A port's first edit starts its own look from the hub's, as the service does.
  const editEffect = (ring: LianLiRing | undefined, next: LianLiEffect) => {
    if (!lighting) return;
    const ringKey = ring === 'inner' ? 'innerRing' : 'outerRing';
    if (targetPort === null) {
      setLighting(ring
        ? { ...lighting, [ringKey]: next }
        : { ...lighting, mode: next.mode, effectMode: next.mode, speed: next.speed, direction: next.direction, brightness: next.brightness, colors: next.colors });
      return;
    }
    const ports = [...(lighting.ports ?? [])];
    while (ports.length <= targetPort) ports.push(null);
    const base = ports[targetPort] ?? hubLook;
    ports[targetPort] = ring ? { ...base, [ringKey]: next } : { ...base, whole: next };
    setLighting({ ...lighting, ports });
  };

  // Structural edits (splitting rings, dropping a port's look) take the service's seeded result.
  const commitAndReload = async (patch: LianLiLightingPatch) => {
    if (await commitLighting(patch)) await refresh();
  };

  // Cooling lists only ports with fans set on the Devices tab, like the service's channels.
  const hasFans = !!lianliState?.fansPerPort.some(n => n > 0);
  const tabs = [
    { key: 'devices', label: t('devices.title'), icon: <Cable size={14} /> },
    { key: 'lighting', label: t('lighting.title'), icon: <Lightbulb size={14} /> },
    ...(hasFans ? [{ key: 'cooling', label: t('cooling.title'), icon: <Fan size={14} /> }] : []),
  ];
  const tab: LianLiTab = tabs.some(x => x.key === activeTab) ? activeTab : 'devices';

  return (
    <div className={styles.page}>
      <ViewHeader
        title={lianLiHubName(hubId)}
        actions={saving ? <span className={styles.savingBadge}>{t('devices.saving')}</span> : null}
        tabs={tabs}
        activeTab={tab}
        onTabChange={key => setActiveTab(key as LianLiTab)}
        tabActions={!onSectionNavigate ? undefined
          : tab === 'cooling' ? <CoolingPageShortcut onSectionNavigate={onSectionNavigate} anchors={lianLiCoolingAnchors(hubId)} />
          : tab === 'lighting' ? <LightingPageShortcut onSectionNavigate={onSectionNavigate} anchors={lianLiLightingAnchors(lighting ?? undefined, hubId)} />
          : undefined}
      />
      <div className={`${styles.pageBody} pageBody`}>
        {tab === 'devices' && (
          <SettingsSection
            title={t('devices.lianli.portsSection')}
            boxClassName={styles.sectionBox}
          >
            {Array.from({ length: PORT_COUNT }, (_, port) => (
              <SettingRow
                key={port}
                label={t('devices.lianli.port', { n: port + 1 })}
                disabled={!stateLoaded}
              >
                <Select
                  className={styles.portSelect}
                  value={String(lianliState?.fansPerPort[port] ?? 0)}
                  onChange={v => { void commitFanCount(port, Number(v)); }}
                  options={Array.from({ length: (lianliState?.maxFansPerPort ?? DEFAULT_MAX_FANS) + 1 }, (_, count) => ({
                    value: String(count),
                    label: t(`devices.lianli.fanCount${count}` as Parameters<typeof t>[0]),
                  }))}
                  disabled={!stateLoaded}
                  ariaLabel={t('devices.lianli.fanCountAria', { n: port + 1 })}
                />
                <span className={styles.rowValue}>
                  {stateLoaded ? `${formatNumber(lianliState.rpm[port] ?? 0, numberFormat)} RPM` : ''}
                </span>
              </SettingRow>
            ))}
            {lianliState?.firmwareVersion && (
              <SettingRow label={t('devices.lianli.firmware')}>
                <span className={styles.rowValue}>{lianliState.firmwareVersion}</span>
              </SettingRow>
            )}
          </SettingsSection>
        )}
        {tab === 'cooling' && lianliState && (
          <LianLiCoolingRows hubId={hubId} fansPerPort={lianliState.fansPerPort} rpm={lianliState.rpm} />
        )}
        {tab === 'lighting' && lighting?.argbSyncSupported && (
          <LianLiArgbSyncSection
            lighting={lighting}
            fansPerPort={lianliState?.fansPerPort ?? []}
            onLighting={setLighting}
            commit={commitLighting}
          />
        )}
        {tab === 'lighting' && !argbSyncOn && (
          <SettingsSection
            title={t('devices.lianli.lightingSection')}
            boxClassName={styles.sectionBox}
          >
            <LightingPageSwitch
              on={isCustomMode}
              disabled={!lightingLoaded}
              onChange={on => {
                if (!lighting) return;
                const mode = on ? LIGHTING_PAGE_MODE : effectKey;
                setLighting({ ...lighting, mode });
                void commitLighting({ mode });
              }}
              onSectionNavigate={onSectionNavigate}
            />

            {(pickablePorts.length > 1 || !!lighting?.ports?.some(Boolean)) && !mergeActive && (
              <SettingSelect
                label={t('devices.lianli.applyTo')}
                value={targetPort === null ? ALL_PORTS : String(targetPort)}
                onChange={v => setTarget(v === ALL_PORTS ? null : Number(v))}
                options={[
                  { value: ALL_PORTS, label: t('devices.lianli.allPorts') },
                  ...pickablePorts.map(p => ({ value: String(p), label: t('devices.lianli.port', { n: p + 1 }) })),
                ]}
                disabled={controlsDisabled}
              />
            )}

            {targetPort !== null && ownLook && (
              <div className={styles.colorActions}>
                <Button
                  size="sm"
                  tone="neutral"
                  disabled={controlsDisabled}
                  onClick={() => { void commitAndReload({ port: targetPort, resetPort: true }); }}
                >
                  {t('devices.lianli.matchAllPorts')}
                </Button>
              </div>
            )}

            {lighting?.ringModes && !mergeActive && (
              <SettingToggle
                label={t('devices.lianli.splitRings')}
                checked={split}
                onChange={on => { void commitAndReload({ splitRings: on, ...portField }); }}
                disabled={controlsDisabled}
              />
            )}

            {!split && (
              <LianLiEffectControls
                modes={effectModes}
                effect={look.whole}
                disabled={controlsDisabled}
                loaded={lightingLoaded}
                onPreview={next => editEffect(undefined, next)}
                onCommit={patch => { void commitLighting({ ...patch, ...portField }); }}
              >
                {targetPort === null && selectedMode?.mergeable && (
                  <SettingToggle
                    label={t('devices.lianli.merge')}
                    description={t('devices.lianli.mergeHint')}
                    checked={lighting?.merge ?? false}
                    onChange={on => {
                      if (!lighting) return;
                      setLighting({ ...lighting, merge: on });
                      void commitLighting({ merge: on });
                    }}
                    disabled={controlsDisabled}
                  />
                )}
                {mergeActive && mergeOrder.length > 0 && (
                  <LianLiMergeOrderRows
                    order={mergeOrder}
                    disabled={controlsDisabled}
                    onChange={next => {
                      if (!lighting) return;
                      setLighting({ ...lighting, mergeOrder: next });
                      void commitLighting({ mergeOrder: next });
                    }}
                  />
                )}
              </LianLiEffectControls>
            )}
          </SettingsSection>
        )}
        {tab === 'lighting' && !argbSyncOn && split && lighting?.ringModes && look.innerRing && look.outerRing && (
          ([['inner', look.innerRing], ['outer', look.outerRing]] as const).map(([ring, effect]) => (
            <SettingsSection
              key={ring}
              title={t(ring === 'inner' ? 'devices.lianli.innerRing' : 'devices.lianli.outerRing')}
              boxClassName={styles.sectionBox}
            >
              <LianLiEffectControls
                modes={lighting.ringModes![ring]}
                effect={effect}
                disabled={controlsDisabled}
                loaded={lightingLoaded}
                onPreview={next => editEffect(ring, next)}
                onCommit={patch => { void commitLighting({ ...patch, ...portField, ring }); }}
              />
            </SettingsSection>
          ))
        )}
      </div>
    </div>
  );
}

// Each position names the port the merged animation reaches next; picking a
// port already placed swaps the two.
function LianLiMergeOrderRows({ order, disabled, onChange }: { order: readonly number[]; disabled: boolean; onChange: (order: number[]) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <SettingRow label={t('devices.lianli.mergeOrder')} description={t('devices.lianli.mergeOrderHint')} />
      {order.map((port, position) => (
        <SettingSelect
          key={position}
          label={t('devices.lianli.mergePosition', { n: position + 1 })}
          value={String(port)}
          onChange={v => {
            const picked = Number(v);
            const next = [...order];
            next[next.indexOf(picked)] = port;
            next[position] = picked;
            onChange(next);
          }}
          options={order.map((_, p) => ({ value: String(p), label: t('devices.lianli.port', { n: p + 1 }) }))}
          disabled={disabled}
        />
      ))}
    </>
  );
}

// Over ARGB sync each port plays the input from its first LED, fan by fan in
// chain order, inner ring first: the layout of this catalog product.
const ARGB_SYNC_FAN_PRODUCT = 'product:lianli-lian-li-sl120-infinity';

// Every port plays the same input, so the longest chain sets how many fans the header carries.
const longestChain = (fansPerPort: readonly number[]) => Math.max(1, ...fansPerPort);

const isArgbSyncChain = (chain: ChainEntry[] | undefined) =>
  !!chain?.length && chain.every(c => c.key === ARGB_SYNC_FAN_PRODUCT);

/** Wires one fan layout per fan onto the source unless it already carries exactly that; false when the service refused. */
async function wireArgbSyncFans(deviceId: string, fans: number): Promise<boolean> {
  const structure = await fetchDeviceStructure(deviceId);
  if (isArgbSyncChain(structure?.chain) && structure?.chain?.length === fans) return true;
  const result = await setDeviceChain(deviceId, Array.from({ length: fans }, () => ({ key: ARGB_SYNC_FAN_PRODUCT })));
  return result !== null && result.error !== true;
}

/** Clears a former source's chain only when it is the one this page wired. */
async function unwireArgbSyncFans(deviceId: string): Promise<void> {
  const structure = await fetchDeviceStructure(deviceId);
  if (isArgbSyncChain(structure?.chain)) await setDeviceChain(deviceId, []);
}

interface LianLiArgbSyncSectionProps {
  lighting: LianLiLighting;
  fansPerPort: readonly number[];
  onLighting: (next: LianLiLighting) => void;
  commit: (patch: LianLiLightingPatch) => Promise<boolean>;
}

function LianLiArgbSyncSection({ lighting, fansPerPort, onLighting, commit }: LianLiArgbSyncSectionProps) {
  const { t } = useTranslation();
  // Switched on with no header saved yet: the picker shows and the pick turns sync on.
  const [choosing, setChoosing] = useState(false);
  // Locks the switch while a header is being wired, so an off cannot land before the on.
  const [enabling, setEnabling] = useState(false);
  const sources = lighting.argbSyncSources ?? [];
  const stored = lighting.argbSyncSource ?? '';
  const source = sources.some(s => s.id === stored) ? stored : '';
  const fans = longestChain(fansPerPort);
  const on = lighting.argbSync === true;

  if (lighting.argbSyncSourcesSupported === false) {
    return (
      <SettingsSection title={t('devices.lianli.argbSyncSection')} boxClassName={styles.sectionBox}>
        <SettingToggle
          label={t('devices.motherboardArgb.label')}
          description={t('devices.motherboardArgb.hint')}
          checked={on}
          onChange={next => {
            const previous = lighting;
            onLighting({ ...lighting, argbSync: next });
            void commit({ argbSync: next }).then(ok => { if (!ok) onLighting(previous); });
          }}
        />
      </SettingsSection>
    );
  }

  const enable = async (id: string) => {
    const previous = lighting;
    setEnabling(true);
    onLighting({ ...lighting, argbSync: true, argbSyncSource: id });
    const ok = await wireArgbSyncFans(id, fans) && await commit({ argbSync: true, argbSyncSource: id });
    if (!ok) onLighting(previous);
    setEnabling(false);
    return ok;
  };

  return (
    <SettingsSection title={t('devices.lianli.argbSyncSection')} boxClassName={styles.sectionBox}>
      <SettingToggle
        label={t('devices.lianli.argbSync')}
        description={t('devices.lianli.argbSyncHint')}
        checked={on || choosing}
        disabled={enabling || (sources.length === 0 && !on && !choosing)}
        onChange={next => {
          if (next) {
            if (source) void enable(source);
            else setChoosing(true);
            return;
          }
          setChoosing(false);
          if (!on) return;
          const previous = lighting;
          onLighting({ ...lighting, argbSync: false });
          void commit({ argbSync: false }).then(ok => { if (!ok) onLighting(previous); });
        }}
      />
      {(on || choosing) && (
        <SettingSelect
          label={t('devices.lianli.argbSyncSource')}
          value={source}
          onChange={v => {
            if (!on) {
              void enable(v).then(ok => { if (ok) setChoosing(false); });
              return;
            }
            const previous = lighting;
            onLighting({ ...lighting, argbSyncSource: v });
            void (async () => {
              if (!await wireArgbSyncFans(v, fans) || !await commit({ argbSyncSource: v })) {
                onLighting(previous);
                return;
              }
              if (stored && stored !== v) await unwireArgbSyncFans(stored);
            })();
          }}
          options={[
            ...(source ? [] : [{ value: '', label: t('devices.lianli.argbSyncChoose') }]),
            ...sources.map(s => ({ value: s.id, label: s.name })),
          ]}
          disabled={enabling || sources.length === 0}
        />
      )}
    </SettingsSection>
  );
}

function LianLiCoolingRows({ hubId, fansPerPort, rpm }: { hubId: string; fansPerPort: readonly number[]; rpm: readonly number[] }) {
  const { t } = useTranslation();
  const { channels, curves } = useCoolingChannels();
  return (
    <SettingsSection boxClassName={rowStyles.rows}>
      {fansPerPort.map((fans, port) => fans > 0 && (
        <CoolingFanRow
          key={port}
          label={t('devices.lianli.port', { n: port + 1 })}
          rpm={rpm[port] ?? 0}
          // LianLiCoolingProvider's channel id in nexus-service.
          channel={channels.find(c => c.id === `${hubId}:port${port}`) ?? null}
          curves={curves}
        />
      ))}
    </SettingsSection>
  );
}
