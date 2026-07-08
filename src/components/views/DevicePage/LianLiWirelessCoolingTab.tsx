import { useCallback, useEffect, useRef, useState } from 'react';
import { Fan, Thermometer } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { CollapsibleSection } from '../../common/CollapsibleSection/CollapsibleSection';
import { type SelectOption } from '../../common/Select/Select';
import { SettingSelect } from '../../common/SettingRow/SettingRow';
import { Slider } from '../../common/Slider/Slider';
import { Button } from '../../common/Button/Button';
import { fetchFanChannels, setFanSpeed, releaseFanAuto, type FanChannel } from '../../../api/cooling';
import { type LianLiWirelessState } from '../../../api/lianli-wireless';
import { fanTypeKey } from './LianLiWirelessFansTab';
import { buildLianLiWirelessCoolingChains, type LianLiWirelessCoolingChain } from './lianliWirelessCoolingUtils';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { formatNumber, localizeNumbers } from '../../../lib/units';
import styles from './LianLiWirelessDevicePage.module.scss';

// Matches the shell's wireless-state poll; the generic cooling channels the
// service derives from that same telemetry move on the same cadence.
const COOLING_POLL_MS = 2000;

export interface LianLiWirelessCoolingTabProps {
  state: LianLiWirelessState | null;
  onSectionNavigate?: (section: string) => void;
}

/**
 * Cooling tab: BIOS/Manual control and live RPM for each bound fan chain's
 * ports, driven through the generic cooling routes (the service registers
 * every bound port as a "lianli-wireless:{mac}:port{N}" channel on
 * IFanControlProvider/ICoolingProvider - Slv3CoolingProvider). Curve
 * assignment is intentionally not offered here; it stays on the central
 * Cooling page like every other fan channel.
 */
export function LianLiWirelessCoolingTab({ state, onSectionNavigate }: LianLiWirelessCoolingTabProps) {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<FanChannel[]>([]);
  const aliveRef = useRef(true);

  const refreshChannels = useCallback(async () => {
    const r = await fetchFanChannels();
    if (aliveRef.current && r) setChannels(r.channels);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refreshChannels();
    const onFocus = () => { void refreshChannels(); };
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => { void refreshChannels(); }, COOLING_POLL_MS);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refreshChannels]);

  const handleSetAuto = useCallback((channelId: string) => {
    void releaseFanAuto(channelId).then(() => refreshChannels());
  }, [refreshChannels]);

  const handleSetManual = useCallback((channelId: string, percent: number) => {
    void setFanSpeed(channelId, percent).then(() => refreshChannels());
  }, [refreshChannels]);

  const chains = buildLianLiWirelessCoolingChains(state?.fans ?? [], channels);

  return (
    <SettingsSection
      title={t('devices.lianli-wireless.coolingFansSection')}
      boxClassName={styles.sectionBox}
    >
      {chains.length > 0
        ? chains.map(chain => (
          <CoolingChainSection
            key={chain.mac}
            chain={chain}
            onSetAuto={handleSetAuto}
            onSetManual={handleSetManual}
          />
        ))
        : <p className={styles.emptyNote} data-settings-aside="true">{t('devices.lianli-wireless.noFansPaired')}</p>}
      <p className={styles.emptyNote} data-settings-aside="true">{t('devices.lianli-wireless.coolingCurveHint')}</p>
      {onSectionNavigate && (
        <div className={styles.actionsRow} data-settings-aside="true">
          <Button
            size="sm"
            tone="neutral"
            icon={<Thermometer size={14} />}
            onClick={() => onSectionNavigate('cooling')}
          >
            {t('devices.lianli-wireless.goToCooling')}
          </Button>
        </div>
      )}
    </SettingsSection>
  );
}

function CoolingChainSection({
  chain,
  onSetAuto,
  onSetManual,
}: {
  chain: LianLiWirelessCoolingChain;
  onSetAuto: (channelId: string) => void;
  onSetManual: (channelId: string, percent: number) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const typeLabel = t(`devices.lianli-wireless.${fanTypeKey(chain.fanType)}` as Parameters<typeof t>[0]);

  return (
    <CollapsibleSection compact title={typeLabel} open={open} onToggle={() => setOpen(o => !o)}>
      <div className={styles.chainBody}>
        {chain.ports.map(p => (
          <CoolingPortRow
            key={p.port}
            label={t('devices.lianli-wireless.fanN', { n: p.port + 1 })}
            rpm={p.rpm}
            channel={p.channel}
            onSetAuto={onSetAuto}
            onSetManual={onSetManual}
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}

function CoolingPortRow({
  label,
  rpm,
  channel,
  onSetAuto,
  onSetManual,
}: {
  label: string;
  rpm: number;
  channel: FanChannel | null;
  onSetAuto: (channelId: string) => void;
  onSetManual: (channelId: string, percent: number) => void;
}) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const interactingRef = useRef(false);
  const [draft, setDraft] = useState(channel?.dutyPercent ?? 0);

  useEffect(() => {
    if (!interactingRef.current && channel) setDraft(channel.dutyPercent);
  }, [channel]);

  const loaded = channel !== null;
  const isCurve = channel?.mode === 'Curve';
  const isManual = channel?.mode === 'Manual';
  const modeValue = isManual ? 'manual' : 'auto';
  const modeOptions: SelectOption[] = [
    { value: 'auto', label: t('cooling.card.bios') },
    { value: 'manual', label: t('cooling.card.manual') },
  ];

  return (
    <div className={styles.portBlock}>
      <div className={styles.row}>
        <span className={styles.rowLabel}>{label}</span>
        <span className={styles.rowValue}>
          <Fan size={12} aria-hidden />
          {rpm > 0 ? `${formatNumber(rpm, numberFormat)} RPM` : '-'}
        </span>
      </div>
      {isCurve ? (
        <p className={styles.emptyNote}>{t('devices.lianli-wireless.coolingCurveActive')}</p>
      ) : (
        <>
          <SettingSelect
            label={t('cooling.card.mode')}
            value={modeValue}
            onChange={v => {
              if (!channel) return;
              if (v === 'manual') onSetManual(channel.id, draft);
              else onSetAuto(channel.id);
            }}
            options={modeOptions}
            disabled={!loaded}
          />
          {isManual && (
            <Slider
              // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
              orientation="stacked"
              editable
              trackFill
              label={t('devices.lianli-wireless.fanSpeed')}
              value={draft}
              min={0}
              max={100}
              step={1}
              formatValue={v => localizeNumbers(`${Math.round(v)}%`, numberFormat)}
              ariaLabel={t('devices.lianli-wireless.fanSpeed')}
              onChange={(v, commit) => {
                const rounded = Math.round(v);
                if (commit) {
                  interactingRef.current = false;
                  setDraft(rounded);
                  if (channel) onSetManual(channel.id, rounded);
                  return;
                }
                interactingRef.current = true;
                setDraft(rounded);
              }}
              onCommit={v => {
                interactingRef.current = false;
                const rounded = Math.round(v);
                setDraft(rounded);
                if (channel) onSetManual(channel.id, rounded);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
