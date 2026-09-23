import { useCallback, useEffect, useRef, useState } from 'react';
import { GaugeCircle, Fan } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { HoverTooltip } from '../../common/HoverTooltip/HoverTooltip';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { Slider } from '../../common/Slider/Slider';
import type { LianLiWirelessState } from '../../../api/lianli-wireless';
import { fetchFanChannels, setFanSpeed, releaseFanAuto, type FanChannel } from '../../../api/cooling';
import { buildLianLiWirelessCoolingChains } from './lianliWirelessCoolingUtils';
import { fanTypeKey } from './LianLiWirelessFansTab';
import { CoolingPageLink } from './CoolingPageLink';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { formatNumber, localizeNumbers } from '../../../lib/units';
import styles from './LianLiWirelessDevicePage.module.scss';

// Matches the shell's wireless-state poll; the generic cooling channels the
// service derives from that same telemetry move on the same cadence.
const FAN_CHANNELS_POLL_MS = 2000;

interface LianLiWirelessCoolingTabProps {
  state: LianLiWirelessState | null;
  onSectionNavigate?: (section: string) => void;
}

/**
 * Cooling tab: live RPM and the manual speed switch for each port of every
 * bound fan chain, driven through the generic cooling channels the service
 * registers per port. Curves stay on the Cooling page like every other fan.
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
    const id = window.setInterval(() => { void refreshChannels(); }, FAN_CHANNELS_POLL_MS);
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
    <>
      {chains.map(chain => (
        <SettingsSection
          key={chain.mac}
          title={t(`devices.lianli-wireless.${fanTypeKey(chain.fanType)}` as Parameters<typeof t>[0])}
          boxClassName={styles.sectionBox}
        >
          {chain.ports.map(p => (
            <FanPortRow
              key={p.port}
              label={t('devices.lianli-wireless.fanN', { n: p.port + 1 })}
              rpm={p.rpm}
              rpmUnavailable={p.rpmUnavailable}
              channel={p.channel}
              showControls
              onSetAuto={handleSetAuto}
              onSetManual={handleSetManual}
            />
          ))}
        </SettingsSection>
      ))}
      <SettingsSection boxClassName={styles.sectionBox}>
        <CoolingPageLink hint={t('devices.coolingPage.curvesHint')} onSectionNavigate={onSectionNavigate} />
      </SettingsSection>
    </>
  );
}

function FanPortRow({
  label,
  rpm,
  rpmUnavailable,
  channel,
  showControls,
  onSetAuto,
  onSetManual,
}: {
  label: string;
  rpm: number;
  rpmUnavailable: boolean;
  channel: FanChannel | null;
  showControls: boolean;
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

  return (
    <div className={styles.portBlock}>
      <div className={styles.row}>
        <span className={styles.rowLabel}>{label}</span>
        {rpmUnavailable ? (
          <HoverTooltip body={t('devices.lianli-wireless.rpmUnavailableHint')}>
            <span className={styles.rowValueMuted}>
              <GaugeCircle size={12} aria-hidden />
              {t('devices.lianli-wireless.rpmUnavailable')}
            </span>
          </HoverTooltip>
        ) : (
          <span className={styles.rowValue}>
            <Fan size={12} aria-hidden />
            {rpm > 0 ? `${formatNumber(rpm, numberFormat)} RPM` : '-'}
          </span>
        )}
      </div>
      {showControls && (
        isCurve ? (
          <p className={styles.emptyNote}>{t('devices.lianli-wireless.coolingCurveActive')}</p>
        ) : (
          <>
            <SettingToggle
              label={t('devices.lianli-wireless.manualSpeed')}
              description={t('devices.lianli-wireless.manualSpeedHint')}
              checked={isManual}
              onChange={on => {
                if (!channel) return;
                if (on) onSetManual(channel.id, draft);
                else onSetAuto(channel.id);
              }}
              disabled={!loaded}
            />
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
              disabled={!isManual}
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
          </>
        )
      )}
    </div>
  );
}
