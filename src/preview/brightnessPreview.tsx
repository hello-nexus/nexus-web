/* eslint-disable i18next/no-literal-string -- dev-only preview scaffolding, never shipped */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../lib/polyfills';
import '../styles/variables.scss';
import '../styles/global.scss';
import { loadSettings, applyThemeMode, applyAccentColor, applyBackgroundMode } from '../lib/settings';
import { I18nProvider } from '../lib/i18n';
import { Button } from '../components/common/Button/Button';
import { ToastProvider } from '../components/common/Toast/Toast';
import { BrightnessScheduleModal } from '../components/views/SettingsView/BrightnessScheduleModal';
import { MonitorSettingsPanel, SettingsPanel } from '../components/views/DevicePage/PanelDevicePage';
import { GlobalBrightnessSliderView } from '../panel/widgets/lighting/page/GlobalBrightnessSlider';
import { useScheduleBinding } from '../hooks/useScheduleBinding';
import type { BrightnessScheduleState } from '../hooks/useBrightnessSchedule';
import { scheduledBrightness, SUN_DEFAULT_DAY, SUN_DEFAULT_NIGHT } from '../lib/brightnessSchedule';
import type { BrightnessSchedule } from '../api/lighting';

// Dev-only preview: the real components with local state, no service.
const { general } = loadSettings();
applyThemeMode(general.themeMode);
applyAccentColor(general.accentColor);
applyBackgroundMode(general.backgroundMode);

const DEFAULTS = [
  { hour: 0, brightness: 10 }, { hour: 7, brightness: 10 }, { hour: 9, brightness: 100 },
  { hour: 19, brightness: 100 }, { hour: 22, brightness: 10 },
];

/** A schedule that lives in React state instead of the service. */
function useMockSchedule(initialOn: boolean): BrightnessScheduleState {
  const [schedule, setSchedule] = useState<BrightnessSchedule>({ enabled: initialOn, points: DEFAULTS });
  const minute = 14 * 60;
  return {
    schedule, defaults: DEFAULTS, minute,
    current: schedule.enabled ? Math.round(scheduledBrightness(schedule.points, minute)) : null,
    sunShift: false, location: null, sun: null, sunPoints: null,
    sunLevels: { night: SUN_DEFAULT_NIGHT, day: SUN_DEFAULT_DAY },
    saveSun: async () => { /* not part of this preview */ },
    save: async next => { setSchedule(next); },
  };
}

const frame: React.CSSProperties = {
  width: 300, padding: 16, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12,
};
const row: React.CSSProperties = { display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' };
const cap: React.CSSProperties = { color: 'var(--text-dim)', fontSize: 12, marginBottom: 8 };

/** One master brightness bar with its own schedule and lighting switch. */
function MasterFrame({ title, scheduleOn, follows }: { title: string; scheduleOn: boolean; follows: boolean }) {
  const state = useMockSchedule(scheduleOn);
  const [lightingFollows, setLightingFollows] = useState(follows);
  const [percent, setPercent] = useState(80);
  const [open, setOpen] = useState(false);
  const binding = useScheduleBinding({ state, follows: lightingFollows, onFollowsChange: setLightingFollows, onEdit: () => setOpen(true) });
  return (
    <div>
      <div style={cap}>{title}</div>
      <div style={frame}>
        <GlobalBrightnessSliderView
          percent={percent}
          scheduled={state.current}
          binding={binding}
          follows={lightingFollows}
          onChange={setPercent}
          onCommit={setPercent}
        />
      </div>
      {open && (
        <BrightnessScheduleModal open onClose={() => setOpen(false)} state={state} />
      )}
    </div>
  );
}

function PreviewA() {
  return (
    <div style={row}>
      <MasterFrame title="Schedule off" scheduleOn={false} follows />
      <MasterFrame title="Schedule on, lighting follows" scheduleOn follows />
      <MasterFrame title="Schedule on, lighting not following" scheduleOn follows={false} />
    </div>
  );
}

function PreviewB() {
  const off = useMockSchedule(false);
  const on = useMockSchedule(true);
  const [which, setWhich] = useState<'off' | 'on' | null>(null);
  return (
    <div style={row}>
      <Button type="button" onClick={() => setWhich('off')}>Open: schedule off</Button>
      <Button type="button" onClick={() => setWhich('on')}>Open: schedule on</Button>
      {which && (
        <BrightnessScheduleModal
          open
          onClose={() => setWhich(null)}
          state={which === 'off' ? off : on}
        />
      )}
    </div>
  );
}

const noop = () => { /* preview */ };
const ORIENTATIONS = ['Landscape', 'Portrait', 'LandscapeFlipped', 'PortraitFlipped'] as const;

function DevicePair({ title, scheduleOn, follows, kind }: {
  title: string; scheduleOn: boolean; follows: boolean; kind: 'y70' | 'display';
}) {
  const state = useMockSchedule(scheduleOn);
  const [deviceFollows, setDeviceFollows] = useState(follows);
  const [brightness, setBrightness] = useState(60);
  const [open, setOpen] = useState(false);
  const binding = useScheduleBinding({ state, follows: deviceFollows, onFollowsChange: setDeviceFollows, onEdit: () => setOpen(true) });
  return (
    <div style={{ width: 520 }}>
      <div style={cap}>{title}</div>
      {kind === 'y70' ? (
        <SettingsPanel
          schedule={binding} brightness={brightness} onBrightness={setBrightness}
          orientation="Landscape" onOrientation={noop} orientationOptions={ORIENTATIONS}
          forceOrientation={false} onForceOrientationToggle={noop} onCompatibilityRenderingToggle={noop}
          onKeepCursorOffToggle={noop} screenOn onScreenToggle={noop} autoLaunch onAutoLaunchToggle={noop}
          reserveMonitor={false} onReserveMonitorToggle={noop} onAlwaysOnTopToggle={noop}
          showDisplayControls showAutoLaunch={false} usbDisconnected={false} displayDisconnected={false}
        />
      ) : (
        <MonitorSettingsPanel
          schedule={binding} brightness={brightness} onBrightness={setBrightness}
          orientation={null} onOrientation={noop} orientationOptions={ORIENTATIONS}
          screenOff={null} onScreenOffToggle={noop} sleepWithHost={null} onSleepWithHostToggle={noop}
          sleepWhenLocked={null} onSleepWhenLockedToggle={noop} autoOrient={null} onAutoOrientToggle={noop}
          alwaysOnTop={null} onAlwaysOnTopToggle={noop} widgetsLocked={null} onWidgetsLockedToggle={noop}
          reserveMonitor={null} onReserveMonitorToggle={noop} keepCursorOff={null} onKeepCursorOffToggle={noop}
          xeneonSettings={null} onXeneonChange={noop} onXeneonCommit={noop} hardwareResetBusy={false}
        />
      )}
      {open && (
        <BrightnessScheduleModal open onClose={() => setOpen(false)} state={state} />
      )}
    </div>
  );
}

function PreviewC() {
  return (
    <div style={row}>
      <DevicePair kind="y70" title="Y70 Touch: schedule on, following" scheduleOn follows />
      <DevicePair kind="y70" title="Y70 Touch: schedule on, not following" scheduleOn follows={false} />
      <DevicePair kind="y70" title="Y70 Touch: schedule off (switch inert)" scheduleOn={false} follows />
      <DevicePair kind="display" title="External display: schedule on, following" scheduleOn follows />
      <DevicePair kind="display" title="External display: schedule on, not following" scheduleOn follows={false} />
    </div>
  );
}

function Preview() {
  const view = new URLSearchParams(location.search).get('p') ?? 'a';
  return (
    <I18nProvider>
    <ToastProvider>
      <div style={{ padding: 24, minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
        <nav style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <a href="?p=a">A: master brightness</a>
          <a href="?p=b">B: settings modal</a>
          <a href="?p=c">C: device settings</a>
        </nav>
        {view === 'a' && <PreviewA />}
        {view === 'b' && <PreviewB />}
        {view === 'c' && <PreviewC />}
      </div>
    </ToastProvider>
    </I18nProvider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>);
