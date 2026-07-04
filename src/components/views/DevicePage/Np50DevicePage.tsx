import { Unplug } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  getNp50ConnectionState,
  getNp50FirmwareAnimation,
  getNp50FirmwareDefaults,
  np50HexToRgb,
  np50RgbToHex,
  NP50_DEFAULT_MODE_MOTHERBOARD,
  NP50_DEFAULT_MODE_STATIC,
  NP50_FW_ANIMATION_BREATHE,
  NP50_FW_ANIMATION_COLOR,
  NP50_FW_ANIMATION_RAINBOW,
  NP50_FW_ANIMATION_RAINBOW_GRADIENT,
  setNp50FirmwareAnimation,
  setNp50FirmwareDefaults,
  type Np50DefaultMode,
  type Np50FirmwareAnimation,
  type Np50FirmwareDefaults,
  type Np50FwAnimationKind,
} from '../../../api/np50';
import { useTranslation } from '../../../lib/i18n';
import styles from './Np50DevicePage.module.scss';

const RECONNECT_POLL_MS = 2000;

/**
 * Routed page for the HYTE NP50. Exposes the two EEPROM-persisted
 * surfaces - default cooling behaviour + firmware-side LED animation -
 * that describe what the hub does when nexus ISN'T streaming (PC off,
 * service shut down, hub in BIOS).
 *
 * Connection model: the authoritative "is the NP50 here?" answer lives at
 * `GET /devices/np50`. The two EEPROM reads can fail transiently (HTTP 409
 * mid-cooling-mode write, or before the heartbeat worker's first poll) and
 * MUST NOT be treated as offline. The empty state is pinned to
 * `connected === false`, never to a null EEPROM read.
 */
export function Np50DevicePage() {
  const { t } = useTranslation();
  // Tri-state: 'unknown' = still loading, 'connected' = hub up,
  // 'disconnected' = explicit not-connected response. The empty state
  // only renders on the 'disconnected' arm.
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [defaults, setDefaults] = useState<Np50FirmwareDefaults | null>(null);
  const [animation, setAnimation] = useState<Np50FirmwareAnimation | null>(null);
  const [saving, setSaving] = useState(false);
  const aliveRef = useRef(true);
  const connectionRef = useRef(connection);
  connectionRef.current = connection;

  const refresh = useCallback(async () => {
    // 1. Ask the service whether the hub is actually plugged in. This call
    //    never 409s - it just reports the cached state. A network failure
    //    (service down) returns null; treat that as "keep the prior state"
    //    so we don't flash the empty state while a single poll fails.
    const conn = await getNp50ConnectionState();
    if (!aliveRef.current) return;
    if (conn === null) {
      // Service unreachable. Don't change connection state; the parent
      // ServiceRequired guard handles the no-service case.
      return;
    }
    if (!conn.connected) {
      setConnection('disconnected');
      setDefaults(null);
      setAnimation(null);
      return;
    }

    // 2. Hub is up. Issue both EEPROM reads, but treat individual nulls
    //    as transient - keep whatever we last loaded so the UI doesn't
    //    blink when one of the two reads fails (the other one usually
    //    succeeds and the next refresh fills the gap).
    setConnection('connected');
    const [d, a] = await Promise.all([
      getNp50FirmwareDefaults().catch(() => null),
      getNp50FirmwareAnimation().catch(() => null),
    ]);
    if (!aliveRef.current) return;
    if (d) setDefaults(d);
    if (a) setAnimation(a);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    // Refetch when the user returns to the window - covers hot-plug
    // while the page was hidden.
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    // Poll while not connected so powering the hub on while this page is
    // already focused updates the UI without requiring a window blur/refocus.
    // Stops once connected so it never clobbers an in-progress edit below.
    const id = window.setInterval(() => {
      if (connectionRef.current !== 'connected') void refresh();
    }, RECONNECT_POLL_MS);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refresh]);

  const commitDefaults = useCallback(async (next: Np50FirmwareDefaults) => {
    setDefaults(next);
    setSaving(true);
    try {
      await setNp50FirmwareDefaults(next.defaultMode, next.staticFanPercent);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, []);

  const commitAnimation = useCallback(async (next: Np50FirmwareAnimation) => {
    setAnimation(next);
    setSaving(true);
    try {
      await setNp50FirmwareAnimation(next);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, []);

  // The empty state only renders when the service explicitly says the hub
  // is gone. A transient EEPROM null or a "still loading" state never
  // reaches this branch.
  if (connection === 'disconnected') {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand + model name */}
        <ViewHeader title="HYTE NP50" />
        <div className={`${styles.pageBody} pageBody`}>
          <EmptyState icon={<Unplug size={40} />} title={t('devices.np50.notConnected')} />
        </div>
      </div>
    );
  }

  // While loading (connection === 'unknown') we still render the page
  // chrome but leave sections inert. Avoids an empty-state->page flash
  // on every nav-in.
  const defaultsLoaded = defaults !== null;
  const animationLoaded = animation !== null;
  const isStatic = defaults?.defaultMode === NP50_DEFAULT_MODE_STATIC;
  const animKind = animation?.animation ?? NP50_FW_ANIMATION_COLOR;
  const showColorPicker =
    animKind === NP50_FW_ANIMATION_COLOR || animKind === NP50_FW_ANIMATION_BREATHE;
  const hex = animation
    ? np50RgbToHex(animation.r, animation.g, animation.b)
    : '#ffffff';

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="HYTE NP50"
        actions={saving ? <span className={styles.savingBadge}>{t('devices.saving')}</span> : null}
      />
      <div className={`${styles.pageBody} pageBody`}>
        <SettingsSection
          title={t('devices.np50.fanSection')}
          description={t('devices.np50.fanSectionDescription')}
          boxClassName={styles.sectionBox}
        >
          <SettingSelect
            label={t('devices.np50.defaultMode')}
            value={String(defaults?.defaultMode ?? NP50_DEFAULT_MODE_STATIC)}
            onChange={v => {
              if (!defaults) return;
              const m = Number(v) as Np50DefaultMode;
              void commitDefaults({ ...defaults, defaultMode: m });
            }}
            options={[
              { value: String(NP50_DEFAULT_MODE_STATIC), label: t('devices.np50.modeStaticSetpoint') },
              { value: String(NP50_DEFAULT_MODE_MOTHERBOARD), label: t('devices.np50.modeMotherboardPwm') },
            ]}
            disabled={!defaultsLoaded}
          />
          <SettingSlider
            label={t('devices.np50.staticFanPercent')}
            value={defaults?.staticFanPercent ?? 50}
            min={0}
            max={100}
            step={1}
            editable
            trackFill
            formatValue={v => `${Math.round(v)}%`}
            disabled={!defaultsLoaded || !isStatic}
            ariaLabel={t('devices.np50.staticFanPercentAria')}
            onChange={(v: number) => {
              if (!defaults) return;
              setDefaults({ ...defaults, staticFanPercent: Math.round(v) });
            }}
            onCommit={() => {
              if (defaults) void commitDefaults(defaults);
            }}
          />
        </SettingsSection>

        <SettingsSection
          title={t('devices.np50.ledSection')}
          description={t('devices.np50.ledSectionDescription')}
          boxClassName={styles.sectionBox}
        >
          <SettingSelect
            label={t('devices.fwAnimation.effect')}
            value={String(animKind)}
            onChange={v => {
              if (!animation) return;
              const k = Number(v) as Np50FwAnimationKind;
              void commitAnimation({ ...animation, animation: k });
            }}
            options={[
              { value: String(NP50_FW_ANIMATION_COLOR), label: t('devices.fwAnimation.solidColor') },
              { value: String(NP50_FW_ANIMATION_RAINBOW), label: t('devices.fwAnimation.rainbowCycle') },
              { value: String(NP50_FW_ANIMATION_BREATHE), label: t('devices.fwAnimation.breathing') },
              { value: String(NP50_FW_ANIMATION_RAINBOW_GRADIENT), label: t('devices.fwAnimation.rainbowGradient') },
            ]}
            disabled={!animationLoaded}
          />
          <SettingSlider
            label={t('devices.y70.brightness')}
            value={animation?.brightness ?? 100}
            min={0}
            max={100}
            step={1}
            editable
            trackFill
            formatValue={v => `${Math.round(v)}%`}
            disabled={!animationLoaded}
            ariaLabel={t('devices.y70.brightness')}
            onChange={(v: number) => {
              if (!animation) return;
              setAnimation({ ...animation, brightness: Math.round(v) });
            }}
            onCommit={() => {
              if (animation) void commitAnimation(animation);
            }}
          />
          {showColorPicker && animationLoaded && (
            <div className={styles.colorBlock}>
              <HsvPicker
                value={hex}
                onPreview={(next: string) => {
                  if (!animation) return;
                  const { r, g, b } = np50HexToRgb(next);
                  setAnimation({ ...animation, r, g, b });
                }}
                onCommit={(next: string) => {
                  if (!animation) return;
                  const { r, g, b } = np50HexToRgb(next);
                  void commitAnimation({ ...animation, r, g, b });
                }}
              />
            </div>
          )}
        </SettingsSection>
      </div>
    </div>
  );
}
