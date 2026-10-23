import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, Zap } from 'lucide-react';
import {
  calibrateAstral, cancelAstralShutdown, fetchAstral, saveAstralSettings, shutdownAstralNow,
  type AstralCard, type AstralSettings, type AstralState,
} from '../../../api/astral';
import { useSensors } from '../../../hooks/useSensors';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../../common/Button/Button';
import { Card } from '../../common/Card/Card';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { Notice, NoticeSecondary } from '../../common/Notice/Notice';
import { SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { AstralArt } from './AstralArt';
import {
  LIMITS, TIME_CHOICES, alertTone, clock, finite, levelStatus, pollDelayMs, secondsLeft, sensorId,
  signedDegrees, tiltWord, withCurrent, worstPins,
} from './astralUtils';
import styles from './AstralDevicePage.module.scss';

type Tab = 'level' | 'power';
type Confirm = 'calibrate' | 'equalizer' | 'shutdown' | 'now';

const P = 'devices.astral.';
const TABS: readonly { key: Tab; icon: ReactNode }[] = [
  { key: 'power', icon: <Zap size={14} /> },
  { key: 'level', icon: <Activity size={14} /> },
];
const ART_VIEW = { sag: 'side', lean: 'end' } as const;

/** The ROG Astral page: Level Sense (sag and lean) and the Power detector (12V-2x6 pins). */
export function AstralDevicePage() {
  const { t } = useTranslation();
  const sensors = useSensors(true);
  const [state, setState] = useState<AstralState | null>(null);
  const [tab, setTab] = useState<Tab>('power');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Slow while nothing moves; once a second while a countdown, calibration or fault is live.
  const delay = pollDelayMs(state);
  useEffect(() => {
    const load = () => { void fetchAstral().then(next => { if (alive.current && next) setState(next); }); };
    load();
    const id = window.setInterval(load, delay);
    return () => window.clearInterval(id);
  }, [delay]);

  const counting = !!state?.countdown;
  useEffect(() => {
    if (!counting) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [counting]);

  const live = useMemo(() => {
    const map = new Map<string, number>();
    for (const gpu of sensors.gpuComponents) for (const s of gpu.sensors) map.set(s.id, s.value);
    return map;
  }, [sensors.gpuComponents]);

  // Every write answers with the full state; a failed one says so and leaves the controls as they were.
  const run = useCallback(async (send: () => Promise<AstralState | null>) => {
    const next = await send();
    if (!alive.current) return;
    setFailed(!next);
    if (next) setState(next);
  }, []);

  const card: AstralCard | undefined = state?.cards[0];
  if (!state || !card) {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand + model name */}
        <ViewHeader title="ROG Astral" />
        <div className={styles.body}>
          {state && <Notice tone="info" role="status">{t(`${P}noCard`)}</Notice>}
        </div>
      </div>
    );
  }

  const s = state.settings;
  const set = (patch: Partial<AstralSettings>) => { void run(() => saveAstralSettings(patch)); };
  const eq = s.equalizer;
  const limits = {
    over: LIMITS.overcurrent[eq ? 'equalizer' : 'normal'],
    crit: LIMITS.critical[eq ? 'equalizer' : 'normal'],
  };
  const tone = alertTone(card.state);
  const level = levelStatus(card);
  const sag = finite(live.get(sensorId(card.gpuId, 'level/sag')));
  const lean = finite(live.get(sensorId(card.gpuId, 'level/lean')));
  const amps = card.pins.map((p, i) => finite(live.get(sensorId(card.gpuId, `pin${i + 1}/current`))) ?? p.amps);
  const total = amps.reduce((a, b) => a + b, 0);
  const times = (current: number) =>
    withCurrent(TIME_CHOICES, current).map(n => ({ value: String(n), label: t(`${P}seconds`, { n }) }));

  const confirms: Record<Confirm, { onConfirm: () => void; destructive: boolean; action: string }> = {
    calibrate: { onConfirm: () => { void run(() => calibrateAstral(card.gpuId)); }, destructive: false, action: 'calibrate' },
    equalizer: { onConfirm: () => set({ equalizer: true }), destructive: true, action: 'turnOn' },
    shutdown: { onConfirm: () => set({ overcurrentShutdown: true }), destructive: false, action: 'turnOn' },
    now: { onConfirm: () => { void run(shutdownAstralNow); }, destructive: true, action: 'shutdownNow' },
  };
  const pending = confirm ? confirms[confirm] : null;

  const readingCard = (key: 'sag' | 'lean', value: number | undefined, plus: string, minus: string) => (
    <Card title={t(`${P}${key}.title`)}>
      <div className={styles.reading}>
        <AstralArt view={ART_VIEW[key]} degrees={value ?? 0} label={t(`${P}${key}.view`)} />
        <span className={styles.value}>{value === undefined ? '--' : signedDegrees(value)}</span>
        <span className={styles.dim}>{t(`${P}${key}.${tiltWord(value, plus, minus)}`)}</span>
      </div>
    </Card>
  );

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="ROG Astral"
        tabs={TABS.map(({ key, icon }) => ({ key, icon, label: t(`${P}tab.${key}`) }))}
        activeTab={tab}
        onTabChange={key => setTab(key as Tab)}
      />
      <div className={styles.body}>
        {failed && <Notice tone="critical" role="alert">{t(`${P}failed`)}</Notice>}

        {tab === 'level' && (
          <>
            {level === 'none' && <Notice tone="info" role="status">{t(`${P}noSensor`)}</Notice>}
            {level === 'calibrating' && <Notice tone="info" role="status">{t(`${P}calibrating`)}</Notice>}
            {level !== 'none' && (
              <div className={styles.pair}>
                {readingCard('sag', sag, 'down', 'up')}
                {readingCard('lean', lean, 'fans', 'back')}
              </div>
            )}
            {level !== 'none' && (
              <SettingsSection title={t(`${P}calibrationTitle`)} boxClassName={styles.sectionBox}>
                <span className={styles.dim}>
                  {card.level.calibratedAtMs === null
                    ? t(`${P}notCalibrated`)
                    : t(`${P}calibrated`, { when: new Date(card.level.calibratedAtMs).toLocaleString() })}
                </span>
                <div>
                  <Button size="sm" disabled={level === 'calibrating'} onClick={() => setConfirm('calibrate')}>
                    {t(`${P}calibrate`)}
                  </Button>
                </div>
              </SettingsSection>
            )}
          </>
        )}

        {tab === 'power' && (
          <>
            {tone && (
              <Notice tone={tone} role={tone === 'critical' ? 'alert' : 'status'}>
                {t(`${P}alert.${card.state}`, { pins: worstPins(card) })}
                {card.state === 'overcurrent' && !eq && <NoticeSecondary>{t(`${P}alert.equalizerHint`)}</NoticeSecondary>}
              </Notice>
            )}
            {state.countdown && (
              <Notice
                tone="critical"
                role="alert"
                actions={(
                  <>
                    <Button size="sm" onClick={() => { void run(cancelAstralShutdown); }}>{t(`${P}cancelShutdown`)}</Button>
                    <Button size="sm" tone="danger" onClick={() => setConfirm('now')}>{t(`${P}shutdownNow`)}</Button>
                  </>
                )}
              >
                {t(`${P}countdown.${state.countdown.reason}`, { left: clock(secondsLeft(state.countdown.endsAtMs, now)) })}
              </Notice>
            )}
            {state.heldOff && <Notice tone="info" role="status">{t(`${P}heldOff`)}</Notice>}

            <Card title={t(`${P}connector`)} subtitle={t(`${P}total`, { value: total.toFixed(1) })}>
              <div className={styles.pins}>
                {card.pins.map((p, i) => (
                  <div key={i} className={`${styles.pin} ${styles[p.state]}`} role="group" aria-label={t(`${P}pinLabel`, { n: i + 1, state: t(`${P}state.${p.state}`) })}>
                    <span className={styles.dim}>{t(`${P}pin`, { n: i + 1 })}</span>
                    <span>{`${amps[i].toFixed(1)} A`}</span>
                  </div>
                ))}
              </div>
            </Card>

            <SettingsSection title={t(`${P}alertsTitle`)} boxClassName={styles.sectionBox}>
              <SettingToggle label={t(`${P}alerts`)} description={t(`${P}alertsHint`)} checked={s.alerts} onChange={on => set({ alerts: on })} />
            </SettingsSection>

            <SettingsSection title={t(`${P}equalizerTitle`)} boxClassName={styles.sectionBox}>
              <Notice tone="warning">{t(`${P}equalizerWarning`)}</Notice>
              <SettingToggle
                label={t(`${P}equalizer`)}
                description={t(`${P}equalizerHint`)}
                checked={eq}
                onChange={on => (on ? setConfirm('equalizer') : set({ equalizer: false }))}
              />
            </SettingsSection>

            <SettingsSection title={t(`${P}autoTitle`)} boxClassName={styles.sectionBox}>
              <SettingToggle
                label={t(`${P}overShutdown`)}
                description={t(`${P}overShutdownHint`, { limit: limits.over })}
                checked={s.overcurrentShutdown}
                onChange={on => (on ? setConfirm('shutdown') : set({ overcurrentShutdown: false }))}
              />
              <SettingSelect
                label={t(`${P}overFor`)}
                value={String(s.overcurrentSeconds)}
                options={times(s.overcurrentSeconds)}
                disabled={!s.overcurrentShutdown}
                onChange={v => set({ overcurrentSeconds: Number(v) })}
              />
              <SettingSelect
                label={t(`${P}countdownFor`)}
                value={String(s.countdownSeconds)}
                options={times(s.countdownSeconds)}
                disabled={!s.overcurrentShutdown}
                onChange={v => set({ countdownSeconds: Number(v) })}
              />
              <SettingToggle
                label={t(`${P}critShutdown`)}
                description={t(`${P}critShutdownHint`, { limit: limits.crit })}
                checked={s.criticalShutdown}
                onChange={on => set({ criticalShutdown: on })}
              />
            </SettingsSection>
          </>
        )}
      </div>

      <ConfirmModal
        open={pending !== null}
        title={t(`${P}confirm.${confirm}.title`)}
        message={t(`${P}confirm.${confirm}.message`)}
        confirmLabel={t(`${P}${pending?.action ?? 'turnOn'}`)}
        destructive={pending?.destructive ?? false}
        onConfirm={() => { pending?.onConfirm(); setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
