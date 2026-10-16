import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, Power, Zap } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Spinner } from '../../common/Spinner/Spinner';
import { Button } from '../../common/Button/Button';
import { Badge } from '../../common/Badge/Badge';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { Notice } from '../../common/Notice/Notice';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import {
  astralShutdownNow,
  calibrateAstralLevelSense,
  cancelAstralShutdown,
  getAstralLevelSense,
  getAstralPower,
  setAstralPowerConfig,
  type AstralLevelSense,
  type AstralPowerSettings,
  type AstralPowerState,
} from '../../../api/astral';
import {
  AstralArcArrow,
  AstralConnector,
  AstralEndView,
  AstralSideView,
  AstralTiltLabels,
  SAG_EXTENT,
  SAG_PIVOT,
  SAG_VIEW,
  TILT_EXTENT,
  TILT_PIVOT,
  TILT_VIEW,
} from './AstralArt';
import {
  CALIBRATE_MS,
  WARN_DEG,
  amps,
  ampsText,
  astralCardName,
  clockLeft,
  fitStage,
  limitText,
  signedDegrees,
  tiltDirection,
  tiltWordKey,
  withCurrentTime,
  type StageExtent,
} from './astralUtils';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';
import { formatDateTime, hour12OptionFor, type DateFormat } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';
import own from './AstralDevicePage.module.scss';

const POLL_MS = 1000;
const ALERT_POPUP_MS = 2 * 60 * 1000;
const OVERCURRENT_TIMES = [10, 30, 60, 120, 300];
const COUNTDOWN_TIMES = [30, 60, 120, 300];
// Both views share one shape so the two panels line up.
const STAGE_ASPECT = 1.9;

type AstralTab = 'levelsense' | 'power';

// Reads a state once a second while `active`; null until the first answer. A write
// that hands back the new state shows it at once through `set`.
function usePolled<T>(load: () => Promise<T | null>, active: boolean): [T | null, (next: T) => void] {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const run = async () => {
      const next = await load();
      if (alive && next) setValue(next);
    };
    void run();
    const id = window.setInterval(() => { void run(); }, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [load, active]);
  return [value, setValue];
}

// The current time, kept fresh on an interval while `on`, for countdowns.
function useNow(on: boolean, ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [on, ms]);
  return now;
}

interface StageProps {
  extent: StageExtent;
  upright?: boolean;
  art: ReactNode;
  rotation: number;
  arrow: ReactNode;
  labels?: ReactNode;
  alt: string;
}

// One view: the reference line across it through the pivot (level for sag, upright for
// tilt), the card turned by the reading about its pivot, the arrow and any labels that
// hold still.
function Stage({ extent, upright, art, rotation, arrow, labels, alt }: StageProps) {
  const fit = fitStage(extent, STAGE_ASPECT);
  const box = {
    left: `${fit.x * 100}%`,
    top: `${fit.y * 100}%`,
    width: `${(fit.size / STAGE_ASPECT) * 100}%`,
    height: `${fit.size * 100}%`,
  };
  return (
    <div className={own.stage} style={{ paddingTop: `${100 / STAGE_ASPECT}%` }} role="img" aria-label={alt}>
      <div className={upright ? own.uprightLine : own.levelLine} style={upright ? { left: box.left } : { top: box.top }} />
      <div className={`${own.layer} ${own.turning}`} style={{ ...box, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}>{art}</div>
      <div className={own.layer} style={box}>{arrow}</div>
      {labels && <div className={own.layer} style={box}>{labels}</div>}
    </div>
  );
}

interface PanelProps {
  title: string;
  stage: ReactNode;
  value: number;
  over: boolean;
  words: string;
  hint: string;
  legend: string;
}

// One reading: its title, the drawing, the signed number, the direction in words, what
// it means and what + and - stand for.
function Panel({ title, stage, value, over, words, hint, legend }: PanelProps) {
  return (
    <section className={own.panel} aria-label={title}>
      <h3 className={own.panelTitle}>{title}</h3>
      {stage}
      <div className={`${own.reading} ${over ? own.bad : ''}`}>{signedDegrees(value)}</div>
      <div className={`${own.words} ${over ? own.bad : ''}`}>{words}</div>
      <p className={own.hint}>{hint}</p>
      <p className={own.legend}>{legend}</p>
    </section>
  );
}

function LevelSenseTab() {
  const { t, language } = useTranslation();
  const { timeFormat, dateFormat } = useUnitPrefs();
  const [state, setState] = usePolled<AstralLevelSense>(getAstralLevelSense, true);
  // The service takes a few seconds to calibrate; the words say so meanwhile.
  const [busy, setBusy] = useState(false);
  const busyTimer = useRef(0);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => window.clearTimeout(busyTimer.current), []);

  const gpu = state?.gpus[0];
  const sag = gpu?.sag;
  const lean = gpu?.lean;
  if (!state) {
    return <div className={own.loading}><Spinner size={28} /></div>;
  }
  if (!gpu || typeof sag !== 'number' || typeof lean !== 'number') {
    return <EmptyState icon={<Activity size={40} />} title={t('devices.astral.noSensor')} hint={t('devices.astral.noSensorHint')} />;
  }

  const overSag = Math.abs(sag) > WARN_DEG;
  const overLean = Math.abs(lean) > WARN_DEG;
  const over = overSag || overLean;
  const calibrating = busy || gpu.calibrating;
  // A calibration date always carries its year: the pattern picked in Settings, DD/MM/YYYY
  // while that is the system one, and the time on the 12h / 24h choice.
  const datePattern: DateFormat = dateFormat === 'system' ? 'dd/mm/yyyy' : dateFormat;
  const calibratedText = gpu.calibratedAtMs
    ? t('devices.astral.calibrated', {
      when: formatDateTime(
        new Date(gpu.calibratedAtMs),
        datePattern,
        { hour: 'numeric', minute: '2-digit', hour12: hour12OptionFor(timeFormat) },
        { locale: language, variant: 'year' },
      ),
    })
    : t('devices.astral.notCalibrated');

  const calibrate = async () => {
    setConfirming(false);
    setFailed(false);
    setBusy(true);
    window.clearTimeout(busyTimer.current);
    busyTimer.current = window.setTimeout(() => setBusy(false), CALIBRATE_MS);
    const reply = await calibrateAstralLevelSense();
    if (!reply || reply.gpus.length === 0) {
      window.clearTimeout(busyTimer.current);
      setBusy(false);
      setFailed(true);
      return;
    }
    const next = await getAstralLevelSense();
    if (next) setState(next);
  };

  // Sag: the free end (right, away from the bracket) dropping turns the card clockwise
  // about the bracket. Tilt: the top edge leaning toward the fans (left) turns it
  // counterclockwise about the slot.
  const turn = (v: number) => Math.min(25, Math.max(-25, v));
  const limit = WARN_DEG.toFixed(2);

  return (
    <div className={own.tab}>
      <div className={own.statusRow}>
        <Badge label={over ? t('devices.astral.over', { limit }) : t('devices.astral.ok')} color={over ? 'var(--bad, #ef4444)' : 'var(--good, #10b981)'} />
        <span className={`${own.status} ${calibrating ? own.accent : failed ? own.bad : ''}`} role="status">
          {calibrating ? t('devices.astral.calibrating') : failed ? t('devices.astral.calibrateFailed') : calibratedText}
        </span>
        <Button size="sm" tone="accent" disabled={calibrating} onClick={() => setConfirming(true)}>
          {t('devices.astral.calibrate')}
        </Button>
      </div>
      <p className={own.centredHint}>{t('devices.astral.calibrateHint')}</p>
      <div className={own.panels}>
        <Panel
          title={t('devices.astral.sag')}
          stage={(
            <Stage
              extent={SAG_EXTENT}
              art={<AstralSideView warn={overSag} />}
              rotation={turn(sag)}
              arrow={(
                <AstralArcArrow viewBox={SAG_VIEW} cx={SAG_PIVOT[0]} cy={SAG_PIVOT[1]} r={372} a0={-9} a1={9}
                  color="#f59e0b" on={tiltDirection(sag)} warn={overSag} signGap={26} />
              )}
              alt={t('devices.astral.sideView')}
            />
          )}
          value={sag}
          over={overSag}
          words={t(tiltWordKey(sag, WARN_DEG, {
            plusSlight: 'devices.astral.sagDownSlight',
            plus: 'devices.astral.sagDown',
            minusSlight: 'devices.astral.sagUpSlight',
            minus: 'devices.astral.sagUp',
          }, 'devices.astral.unchanged'))}
          hint={t('devices.astral.sagHint')}
          legend={t('devices.astral.sagLegend')}
        />
        <Panel
          title={t('devices.astral.lean')}
          stage={(
            <Stage
              extent={TILT_EXTENT}
              upright
              art={<AstralEndView warn={overLean} />}
              rotation={turn(-lean)}
              arrow={(
                <AstralArcArrow viewBox={TILT_VIEW} cx={TILT_PIVOT[0]} cy={TILT_PIVOT[1]} r={222} a0={-76} a1={-104}
                  color="#22d3ee" on={tiltDirection(lean)} warn={overLean} signGap={26} />
              )}
              labels={<AstralTiltLabels fans={t('devices.astral.fans')} backplate={t('devices.astral.backplate')} />}
              alt={t('devices.astral.endView')}
            />
          )}
          value={lean}
          over={overLean}
          words={t(tiltWordKey(lean, WARN_DEG, {
            plusSlight: 'devices.astral.leanFansSlight',
            plus: 'devices.astral.leanFans',
            minusSlight: 'devices.astral.leanBackSlight',
            minus: 'devices.astral.leanBack',
          }, 'devices.astral.unchanged'))}
          hint={t('devices.astral.leanHint')}
          legend={t('devices.astral.leanLegend')}
        />
      </div>
      <ConfirmModal
        open={confirming}
        title={t('devices.astral.calibrateConfirmTitle')}
        message={t('devices.astral.calibrateConfirmMessage')}
        confirmLabel={t('devices.astral.calibrate')}
        cancelLabel={t('confirm.cancel')}
        destructive={false}
        onConfirm={() => { void calibrate(); }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

type Confirm = { kind: 'now' } | { kind: 'equalizer' | 'shutdown'; patch: Partial<AstralPowerSettings> };

interface PowerTabProps {
  power: AstralPowerState | null;
  setPower: (next: AstralPowerState) => void;
}

function PowerTab({ power, setPower }: PowerTabProps) {
  const { t, language } = useTranslation();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const countdown = power?.countdown ?? null;
  const now = useNow(!!countdown, 250);

  if (!power) {
    return <div className={own.loading}><Spinner size={28} /></div>;
  }
  if (!power.supported) {
    return <EmptyState icon={<Zap size={40} />} title={t('devices.astral.noPower')} hint={t('devices.astral.noPowerHint')} />;
  }

  const s = power.settings;
  const pins = power.gpus[0]?.pinAmps ?? [];
  const total = pins.reduce((sum, v) => sum + amps(v), 0);
  const duration = (seconds: number) => (seconds < 60
    ? t(pluralKey('slideshow.seconds', language, seconds), { count: seconds })
    : t(pluralKey('slideshow.minutes', language, seconds / 60), { count: seconds / 60 }));
  const timeOptions = (times: readonly number[], current: number) =>
    withCurrentTime(times, current).map(v => ({ value: String(v), label: duration(v) }));

  const set = async (patch: Partial<AstralPowerSettings>) => {
    setBusy(true);
    setFailed(false);
    try {
      const next = await setAstralPowerConfig(patch);
      if (next?.settings) setPower(next);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    const next = await getAstralPower();
    if (next) setPower(next);
  };
  // Turning on what can shut the PC down, or what raises the limits, asks first.
  const toggle = (patch: (on: boolean) => Partial<AstralPowerSettings>, kind?: 'equalizer' | 'shutdown') => (on: boolean) => {
    if (on && kind) setConfirm({ kind, patch: patch(true) });
    else void set(patch(on));
  };

  return (
    <div className={own.powerGrid}>
      <div className={own.powerColumn}>
        {countdown ? (
          <div className={own.countdown} role="alert">
            <div className={own.countdownTitle}>
              <Power size={20} aria-hidden />
              <span>{power.shuttingDown ? t('devices.astral.shuttingDown') : t('devices.astral.countdownTitle', { left: clockLeft(countdown.endsAtMs - now) })}</span>
            </div>
            {countdown.text && <p className={own.countdownText}>{countdown.text}</p>}
            {!power.shuttingDown && (
              <div className={own.countdownActions}>
                <Button size="sm" tone="accent" onClick={() => { void cancelAstralShutdown().then(refresh); }}>{t('devices.astral.cancelShutdown')}</Button>
                <Button size="sm" tone="danger" onClick={() => setConfirm({ kind: 'now' })}>{t('devices.astral.shutdownNow')}</Button>
              </div>
            )}
          </div>
        ) : power.heldOff ? (
          <Notice tone="info" role="status">{t('devices.astral.heldOff')}</Notice>
        ) : null}
        <div className={own.connector}>
          <AstralConnector
            pins={pins}
            label={t('devices.astral.connectorAlt')}
            pinLowAmps={power.pinLowAmps}
            pinWarnAmps={power.pinWarnAmps}
            pinCautionAmps={power.pinCautionAmps}
          />
          <span className={own.total}>{t('devices.astral.total', { value: ampsText(total) })}</span>
        </div>
        <p className={own.hint}>{t('devices.astral.watchHint')}</p>
      </div>
      <div className={own.powerColumn}>
        {failed && <Notice tone="critical" role="alert">{t('devices.astral.saveFailed')}</Notice>}
        <SettingsSection title={t('devices.astral.alertsTitle')} boxClassName={styles.sectionBox}>
          <SettingToggle label={t('devices.astral.trayAlerts')} description={t('devices.astral.trayAlertsHint')}
            checked={s.trayAlerts} disabled={busy} onChange={toggle(on => ({ trayAlerts: on }))} />
          <SettingToggle label={t('devices.astral.inAppAlerts')} description={t('devices.astral.inAppAlertsHint')}
            checked={s.inAppAlerts} disabled={busy} onChange={toggle(on => ({ inAppAlerts: on }))} />
        </SettingsSection>
        <SettingsSection title={t('devices.astral.equalizerTitle')} boxClassName={styles.sectionBox}>
          <Notice tone="warning">{t('devices.astral.equalizerWarning')}</Notice>
          <SettingToggle label={t('devices.astral.equalizer')} description={t('devices.astral.equalizerHint')}
            checked={s.equalizer} disabled={busy} onChange={toggle(on => ({ equalizer: on }), 'equalizer')} />
          <SettingToggle label={t('devices.astral.hideReminder')}
            checked={s.hideEqualizerReminder} disabled={busy} onChange={toggle(on => ({ hideEqualizerReminder: on }))} />
        </SettingsSection>
        <SettingsSection title={t('devices.astral.autoTitle')} boxClassName={styles.sectionBox}>
          <SettingToggle label={t('devices.astral.overShutdown')}
            description={t('devices.astral.overShutdownHint', { limit: limitText(power.overcurrentAmps) })}
            checked={s.overcurrentShutdown} disabled={busy} onChange={toggle(on => ({ overcurrentShutdown: on }), 'shutdown')} />
          <p className={own.note}>{t('devices.astral.overNote')}</p>
          <SettingSelect label={t('devices.astral.overFor')} value={String(s.overcurrentSeconds)}
            options={timeOptions(OVERCURRENT_TIMES, s.overcurrentSeconds)} disabled={busy}
            onChange={v => { void set({ overcurrentSeconds: Number(v) }); }} />
          <SettingSelect label={t('devices.astral.countdownFor')} value={String(s.countdownSeconds)}
            options={timeOptions(COUNTDOWN_TIMES, s.countdownSeconds)} disabled={busy}
            onChange={v => { void set({ countdownSeconds: Number(v) }); }} />
          <SettingToggle label={t('devices.astral.critShutdown')}
            description={t('devices.astral.critShutdownHint', { limit: limitText(power.criticalAmps) })}
            checked={s.criticalShutdown} disabled={busy} onChange={toggle(on => ({ criticalShutdown: on }), 'shutdown')} />
          <p className={own.note}>{t('devices.astral.critNote')}</p>
        </SettingsSection>
      </div>
      <ConfirmModal
        open={confirm !== null}
        title={confirm?.kind === 'now' ? t('devices.astral.confirmNowTitle')
          : confirm?.kind === 'equalizer' ? t('devices.astral.confirmEqualizerTitle') : t('devices.astral.confirmShutdownTitle')}
        message={confirm?.kind === 'now' ? t('devices.astral.confirmNowMessage')
          : confirm?.kind === 'equalizer' ? t('devices.astral.confirmEqualizerMessage') : t('devices.astral.confirmShutdownMessage')}
        confirmLabel={confirm?.kind === 'now' ? t('devices.astral.shutdownNow') : t('devices.astral.turnOn')}
        cancelLabel={t('confirm.cancel')}
        onConfirm={() => {
          const answered = confirm;
          setConfirm(null);
          if (answered?.kind === 'now') void astralShutdownNow().then(refresh);
          else if (answered) void set(answered.patch);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// Pop-ups while the page is open: a running countdown (cancel it, or hide it and let it
// run) and the latest alert, once each.
function PowerPopups({ power, onCancel }: { power: AstralPowerState | null; onCancel: () => void }) {
  const { t } = useTranslation();
  const [seenAlertAt, setSeenAlertAt] = useState(0);
  const [hiddenCountdown, setHiddenCountdown] = useState(0);
  const countdown = power?.countdown ?? null;
  const alert = power?.alert ?? null;
  const now = useNow(!!countdown || !!alert, 500);
  // An alert that came with a countdown is answered by the countdown, however it ends.
  const coveredAt = countdown && alert && alert.atMs <= countdown.startedAtMs + 3000 ? alert.atMs : 0;
  useEffect(() => {
    if (coveredAt > 0) setSeenAlertAt(prev => Math.max(prev, coveredAt));
  }, [coveredAt]);

  if (countdown && !power?.shuttingDown && hiddenCountdown !== countdown.startedAtMs) {
    // The countdown says what its alert said and more: answering it answers both.
    const done = () => {
      setHiddenCountdown(countdown.startedAtMs);
      setSeenAlertAt(prev => Math.max(prev, alert?.atMs ?? 0));
    };
    return (
      <ConfirmModal
        open
        title={t('devices.astral.countdownTitle', { left: clockLeft(countdown.endsAtMs - now) })}
        message={countdown.text}
        confirmLabel={t('devices.astral.cancelShutdown')}
        cancelLabel={t('devices.astral.hide')}
        destructive={false}
        onConfirm={() => { done(); onCancel(); }}
        onCancel={done}
      />
    );
  }
  // While a countdown runs, its card on the page says it all.
  if (!countdown && alert && alert.atMs > seenAlertAt && now - alert.atMs < ALERT_POPUP_MS) {
    return (
      <ConfirmModal
        open
        title={alert.title}
        message={alert.text}
        hideConfirm
        cancelLabel={t('confirm.ok')}
        onConfirm={() => setSeenAlertAt(alert.atMs)}
        onCancel={() => setSeenAlertAt(alert.atMs)}
      />
    );
  }
  return null;
}

/**
 * A ROG Astral card's page, with GPU Tweak III's two features as tabs: Level Sense
 * (how the card sits against the level it was calibrated at, from its G-sensor) and
 * the Power detector (the current through each 12V pin of its 12V-2x6 connector, with
 * alerts and an optional auto-shutdown). Nexus only reads the card.
 */
export function AstralDevicePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AstralTab>('levelsense');
  const [power, setPower] = usePolled<AstralPowerState>(getAstralPower, true);
  const [levelName, setLevelName] = useState<string | undefined>(undefined);
  const named = useRef(false);

  // The title is the card's name, from whichever feature found it first.
  const loadName = useCallback(async () => {
    if (named.current) return;
    const state = await getAstralLevelSense();
    if (state?.gpus[0]?.name) {
      named.current = true;
      setLevelName(state.gpus[0].name);
    }
  }, []);
  useEffect(() => { void loadName(); }, [loadName]);

  const title = astralCardName(power?.gpus[0]?.name ?? levelName);
  const tabs = [
    // GPU Tweak III's feature name, the same in every language.
    { key: 'levelsense', label: 'Level Sense', icon: <Activity size={14} /> },
    { key: 'power', label: t('devices.astral.powerTab'), icon: <Zap size={14} /> },
  ];

  return (
    <div className={styles.page}>
      <ViewHeader title={title} tabs={tabs} activeTab={tab} onTabChange={key => setTab(key as AstralTab)} />
      <div className={`${styles.pageBody} pageBody`}>
        {tab === 'levelsense' ? <LevelSenseTab /> : <PowerTab power={power} setPower={setPower} />}
      </div>
      <PowerPopups power={power} onCancel={() => { void cancelAstralShutdown(); }} />
    </div>
  );
}
