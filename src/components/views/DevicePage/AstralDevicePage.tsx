import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Rotate3d, Zap } from 'lucide-react';
import {
  calibrateAstral, cancelAstralShutdown, fetchAstral, saveAstralSettings, shutdownAstralNow,
  type AstralCard, type AstralSettings, type AstralState,
} from '../../../api/astral';
import { useSensors } from '../../../hooks/useSensors';
import { useTranslation } from '../../../lib/i18n';
import { Badge } from '../../common/Badge/Badge';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { Notice, NoticeSecondary } from '../../common/Notice/Notice';
import { SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import {
  AstralArcArrow, AstralConnector, AstralEndView, AstralSideView, AstralTiltLabels,
  SAG_EXTENT, SAG_PIVOT, SAG_VIEW, TILT_EXTENT, TILT_PIVOT, TILT_VIEW,
} from './AstralArt';
import {
  CALIBRATE_SECONDS, CRITICAL_SECONDS, LIMITS, TIME_CHOICES, WARN_DEG, alertTone, clock, finite, fitStage, levelStatus, pinTone, pollDelayMs,
  secondsLeft, sensorId, signedDegrees, tiltDirection, tiltWord, unitScale, withCurrent, worstPins, type StageExtent,
} from './astralUtils';
import styles from './AstralDevicePage.module.scss';

type Tab = 'level' | 'power';
type ConfirmKind = 'calibrate' | 'equalizer' | 'shutdown' | 'now';
interface Confirm { kind: ConfirmKind; gpuId?: string }

const P = 'devices.astral.';
const TABS: readonly { key: Tab; icon: ReactNode }[] = [
  { key: 'level', icon: <Rotate3d size={14} /> },
  { key: 'power', icon: <Zap size={14} /> },
];
// Both views share one shape so the two panels line up.
const STAGE_ASPECT = 1.9;
// The tilt view is scaled differently from the side view; its arrow is drawn larger by the ratio so the markers match.
const TILT_MARK_SCALE = unitScale(SAG_EXTENT, STAGE_ASPECT) / unitScale(TILT_EXTENT, STAGE_ASPECT);
// The card turns by the reading, never more than this far.
const MAX_TURN = 25;
const turn = (v: number | undefined) => Math.min(MAX_TURN, Math.max(-MAX_TURN, v ?? 0));

interface StageProps {
  extent: StageExtent;
  upright?: boolean;
  art: ReactNode;
  rotation: number;
  arrow: ReactNode;
  labels?: ReactNode;
  alt: string;
}

// One view: the reference line through the pivot (level for sag, upright for tilt), the card
// turned by the reading about its pivot, and the arrow and labels that hold still.
function Stage({ extent, upright, art, rotation, arrow, labels, alt }: StageProps) {
  const fit = fitStage(extent, STAGE_ASPECT);
  const box = {
    left: `${fit.x * 100}%`,
    top: `${fit.y * 100}%`,
    width: `${(fit.size / STAGE_ASPECT) * 100}%`,
    height: `${fit.size * 100}%`,
  };
  return (
    <div className={styles.stage} style={{ paddingTop: `${100 / STAGE_ASPECT}%` }} role="img" aria-label={alt}>
      <div className={upright ? styles.uprightLine : styles.levelLine} style={upright ? { left: box.left } : { top: box.top }} />
      <div className={`${styles.layer} ${styles.turning}`} style={{ ...box, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}>{art}</div>
      <div className={styles.layer} style={box}>{arrow}</div>
      {labels && <div className={styles.layer} style={box}>{labels}</div>}
    </div>
  );
}

interface PanelProps {
  title: string;
  stage: ReactNode;
  value: number | undefined;
  over: boolean;
  words: string;
  hint: string;
  legend: string;
}

// One reading: its title, the drawing, the signed number, the direction in words, what it
// means and what + and - stand for.
function Panel({ title, stage, value, over, words, hint, legend }: PanelProps) {
  return (
    <section className={styles.panel} aria-label={title}>
      <h3 className={styles.panelTitle}>{title}</h3>
      {stage}
      <div className={`${styles.reading} ${over ? styles.bad : ''}`}>{value === undefined ? '--' : signedDegrees(value)}</div>
      <div className={`${styles.words} ${over ? styles.bad : ''}`}>{words}</div>
      <p className={styles.hint}>{hint}</p>
      <p className={styles.legend}>{legend}</p>
    </section>
  );
}

/** The ROG Astral page: Level Sense (sag and lean) and the Power detector (12V-2x6 pins). */
export function AstralDevicePage() {
  const { t } = useTranslation();
  const sensors = useSensors(true);
  const [state, setState] = useState<AstralState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('level');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);
  // Bumped when a write starts and when it lands; a poll that began before either is stale.
  const writeSeq = useRef(0);
  const writing = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Slow while nothing moves; fast while a countdown, calibration or fault is live. A failed poll keeps retrying.
  const delay = pollDelayMs(state);
  useEffect(() => {
    const load = () => {
      const seq = writeSeq.current;
      void fetchAstral().then(next => {
        if (!alive.current) return;
        setLoadFailed(!next);
        if (next && seq === writeSeq.current && writing.current === 0) setState(next);
      });
    };
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
  const run = useCallback(async (send: () => Promise<AstralState | null>, failKey = 'failed') => {
    writeSeq.current += 1;
    writing.current += 1;
    let next: AstralState | null = null;
    try {
      next = await send();
    } finally {
      writing.current -= 1;
      writeSeq.current += 1;
    }
    if (!alive.current) return;
    setFailed(next ? null : failKey);
    if (next) setState(next);
  }, []);

  if (!state || state.cards.length === 0) {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand + model name */}
        <ViewHeader title="ROG Astral" />
        <div className={styles.body}>
          {loadFailed && <Notice tone="critical" role="alert">{t(`${P}loadFailed`)}</Notice>}
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
  const times = (current: number) =>
    withCurrent(TIME_CHOICES, current).map(n => ({ value: String(n), label: t(`${P}seconds`, { n }) }));
  const multi = state.cards.length > 1;

  const confirmActions: Record<ConfirmKind, { onConfirm: () => void; destructive: boolean; action: string }> = {
    calibrate: { onConfirm: () => { if (confirm?.gpuId) { const id = confirm.gpuId; void run(() => calibrateAstral(id), 'calibrateFailed'); } }, destructive: false, action: 'calibrate' },
    equalizer: { onConfirm: () => set({ equalizer: true }), destructive: true, action: 'turnOn' },
    shutdown: { onConfirm: () => set({ overcurrentShutdown: true }), destructive: false, action: 'turnOn' },
    now: { onConfirm: () => { void run(shutdownAstralNow); }, destructive: true, action: 'shutdownNow' },
  };
  const pending = confirm ? confirmActions[confirm.kind] : null;

  const levelView = (card: AstralCard) => {
    const level = levelStatus(card);
    const sag = finite(live.get(sensorId(card.gpuId, 'level/sag')));
    const lean = finite(live.get(sensorId(card.gpuId, 'level/lean')));
    const calibratedAt = card.level.calibratedAtMs;
    const overSag = sag !== undefined && Math.abs(sag) > WARN_DEG;
    const overLean = lean !== undefined && Math.abs(lean) > WARN_DEG;
    const over = overSag || overLean;
    const word = (key: 'sag' | 'lean', value: number | undefined, plus: string, minus: string) => {
      const w = tiltWord(value, plus, minus);
      if (w === '') return '';
      return t(w === 'unchanged' ? `${P}unchanged` : `${P}${key}.${w}`);
    };
    return (
      <div key={card.gpuId} className={styles.tab}>
        {multi && <h3 className={styles.panelTitle}>{card.name}</h3>}
        {level === 'none' && <Notice tone="info" role="status">{t(`${P}noSensor`)}</Notice>}
        {level !== 'none' && (
          <>
            <div className={styles.statusRow}>
              <Badge label={over ? t(`${P}over`, { limit: WARN_DEG.toFixed(2) }) : t(`${P}ok`)} color={over ? 'var(--bad)' : 'var(--good)'} />
              <span className={`${styles.status} ${level === 'calibrating' ? styles.accent : ''}`} role="status">
                {level === 'calibrating'
                  ? t(`${P}calibrating`, { seconds: CALIBRATE_SECONDS })
                  : calibratedAt == null
                    ? t(`${P}notCalibrated`)
                    : t(`${P}calibrated`, { when: new Date(calibratedAt).toLocaleString() })}
              </span>
              <Button size="sm" tone="accent" disabled={level === 'calibrating'} onClick={() => setConfirm({ kind: 'calibrate', gpuId: card.gpuId })}>
                {t(`${P}calibrate`)}
              </Button>
            </div>
            <p className={styles.centeredHint}>{t(`${P}calibrateHint`)}</p>
            <div className={styles.panels}>
              <Panel
                title={t(`${P}sag.title`)}
                stage={(
                  <Stage
                    extent={SAG_EXTENT}
                    art={<AstralSideView />}
                    rotation={turn(sag)}
                    arrow={(
                      <AstralArcArrow viewBox={SAG_VIEW} cx={SAG_PIVOT[0]} cy={SAG_PIVOT[1]} r={486} a0={-6.6} a1={6.6}
                        on={tiltDirection(sag)} signGap={26} />
                    )}
                    alt={t(`${P}sag.view`)}
                  />
                )}
                value={sag}
                over={overSag}
                words={word('sag', sag, 'down', 'up')}
                hint={t(`${P}sag.hint`)}
                legend={t(`${P}sag.legend`)}
              />
              <Panel
                title={t(`${P}lean.title`)}
                stage={(
                  <Stage
                    extent={TILT_EXTENT}
                    upright
                    art={<AstralEndView />}
                    rotation={turn(lean === undefined ? 0 : -lean)}
                    arrow={(
                      <AstralArcArrow viewBox={TILT_VIEW} cx={TILT_PIVOT[0]} cy={TILT_PIVOT[1]} r={222} a0={-76} a1={-104}
                        on={tiltDirection(lean)} k={TILT_MARK_SCALE} signGap={26} />
                    )}
                    labels={<AstralTiltLabels fans={t(`${P}fans`)} backplate={t(`${P}backplate`)} />}
                    alt={t(`${P}lean.view`)}
                  />
                )}
                value={lean}
                over={overLean}
                words={word('lean', lean, 'fans', 'back')}
                hint={t(`${P}lean.hint`)}
                legend={t(`${P}lean.legend`)}
              />
            </div>
          </>
        )}
      </div>
    );
  };

  // Amps and state both come from the same polled snapshot, so a pin never shows a newer reading beside an older verdict.
  const powerView = (card: AstralCard) => {
    const total = card.pins.reduce((sum, p) => sum + p.amps, 0);
    return (
      <div key={card.gpuId} className={styles.powerColumn}>
        <div className={styles.connector}>
          <AstralConnector pins={card.pins.map((p, i) => ({ amps: p.amps, tone: pinTone(p.state), label: t(`${P}pinLabel`, { n: i + 1, state: t(`${P}state.${p.state}`) }) }))} label={multi ? `${card.name}, ${t(`${P}connector`)}` : t(`${P}connector`)} />
          <span className={styles.total}>{t(`${P}total`, { value: total.toFixed(1) })}</span>
        </div>
        <p className={styles.hint}>{t(`${P}watchHint`)}</p>
      </div>
    );
  };

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
        {failed && <Notice tone="critical" role="alert">{t(`${P}${failed}`)}</Notice>}
        {loadFailed && <Notice tone="critical" role="alert">{t(`${P}loadFailed`)}</Notice>}

        {state.cards.map(card => {
          const tone = alertTone(card.state);
          return tone && (
            <Notice key={card.gpuId} tone={tone} role={tone === 'critical' ? 'alert' : 'status'}>
              {multi ? `${card.name}: ` : ''}{t(`${P}alert.${card.state}`, { pins: worstPins(card) })}
              {card.state === 'overcurrent' && !eq && <NoticeSecondary>{t(`${P}alert.equalizerHint`)}</NoticeSecondary>}
            </Notice>
          );
        })}
        {state.countdown && (
          <Notice
            tone="critical"
            role="alert"
            actions={(
              <>
                <Button size="sm" tone="accent" onClick={() => { void run(cancelAstralShutdown); }}>{t(`${P}cancelShutdown`)}</Button>
                <Button size="sm" tone="danger" onClick={() => setConfirm({ kind: 'now' })}>{t(`${P}shutdownNow`)}</Button>
              </>
            )}
          >
            {t(`${P}countdown.${state.countdown.reason}`, { left: clock(secondsLeft(state.countdown.endsAtMs, now)) })}
          </Notice>
        )}
        {state.heldOff && <Notice tone="info" role="status">{t(`${P}heldOff`)}</Notice>}

        {tab === 'level' && state.cards.map(levelView)}

        {tab === 'power' && (
          <div className={styles.powerGrid}>
            <div className={styles.powerColumn}>
              {state.cards.map(powerView)}
            </div>
            <div className={styles.powerColumn}>
              <SettingsSection title={t(`${P}alertsTitle`)} boxClassName={styles.sectionBox}>
                <SettingToggle label={t(`${P}alerts`)} description={t(`${P}alertsHint`)} checked={s.alerts} onChange={on => set({ alerts: on })} />
              </SettingsSection>

              <SettingsSection title={t(`${P}equalizerTitle`)} boxClassName={styles.sectionBox}>
                <Notice tone="warning">{t(`${P}equalizerWarning`)}</Notice>
                <SettingToggle
                  label={t(`${P}equalizer`)}
                  description={t(`${P}equalizerHint`, { over: LIMITS.overcurrent.equalizer, crit: LIMITS.critical.equalizer })}
                  checked={eq}
                  onChange={on => (on ? setConfirm({ kind: 'equalizer' }) : set({ equalizer: false }))}
                />
              </SettingsSection>

              <SettingsSection title={t(`${P}autoTitle`)} boxClassName={styles.sectionBox}>
                <SettingToggle
                  label={t(`${P}overShutdown`)}
                  description={t(`${P}overShutdownHint`, { limit: limits.over })}
                  checked={s.overcurrentShutdown}
                  onChange={on => (on ? setConfirm({ kind: 'shutdown' }) : set({ overcurrentShutdown: false }))}
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
                  description={t(`${P}critShutdownHint`, { limit: limits.crit, seconds: CRITICAL_SECONDS })}
                  checked={s.criticalShutdown}
                  onChange={on => set({ criticalShutdown: on })}
                />
              </SettingsSection>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirm !== null}
        title={confirm ? t(`${P}confirm.${confirm.kind}.title`) : ''}
        message={confirm ? t(`${P}confirm.${confirm.kind}.message`, { over: LIMITS.overcurrent.equalizer, crit: LIMITS.critical.equalizer, seconds: CALIBRATE_SECONDS }) : ''}
        confirmLabel={t(`${P}${pending?.action ?? 'turnOn'}`)}
        destructive={pending?.destructive ?? false}
        onConfirm={() => { pending?.onConfirm(); setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
