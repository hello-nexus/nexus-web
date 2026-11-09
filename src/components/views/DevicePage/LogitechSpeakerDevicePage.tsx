import { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Music, Plus, Radio, Speaker, Volume2 } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Spinner } from '../../common/Spinner/Spinner';
import { Button } from '../../common/Button/Button';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { Notice } from '../../common/Notice/Notice';
import { Slider } from '../../common/Slider/Slider';
import { TextInput } from '../../common/TextInput/TextInput';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import {
  deleteSpeakerPreset,
  getSpeaker,
  saveSpeakerPreset,
  setSpeakerChannel,
  setSpeakerEq,
  setSpeakerSubwoofer,
  setSpeakerSurround,
  setSpeakerVolume,
  testSpeakerChannel,
  type SpeakerState,
} from '../../../api/logitechSpeaker';
import { EQ_TRACK_PX, SpeakerEqSlider, eqPos } from './SpeakerEqSlider';
import { SpeakerIcon, SurroundCross } from './SpeakerArt';
import { hzLabel, signedDb, testOrder, typedDb, volMax, volOf, parseNumber } from './speakerUtils';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiDevicePage.module.scss';
import own from './LogitechSpeakerDevicePage.module.scss';

const POLL_MS = 3000;
/** How long a speaker stays lit after its test sound starts. */
const TEST_MS = 1300;
/** The gap between speakers in "Test all speakers". */
const TEST_GAP_MS = 1600;
const HZ = 'Hz';
const DB = 'dB';
const VOL = 'VOL';
const STACKED = 'stacked' as const;
const GAMING = 'gaming';
const MOVIE = 'movie';

type SpeakerTab = 'acoustics' | 'surround';
type Change = () => Promise<SpeakerState | null>;

// The dB scale beside the bands, lined up with the sliders: +max, 0 and min.
function EqScale({ min, max, side }: { min: number; max: number; side: 'left' | 'right' }) {
  const marks: Array<[number, string]> = [[max, `+${max} ${DB}`], [0, `0 ${DB}`], [min, `${min} ${DB}`]];
  return (
    <div className={`${own.eqScale} ${side === 'left' ? own.eqScaleLeft : ''}`} aria-hidden="true">
      <span className={own.eqUnit}>{HZ}</span>
      <div className={own.eqScaleMarks} style={{ height: EQ_TRACK_PX }}>
        {marks.map(([db, text]) => (
          <span key={db} className={own.eqMark} style={{ top: eqPos(db, min, max) }}>{text}</span>
        ))}
      </div>
      <span className={own.eqUnitBottom}>{DB}</span>
    </div>
  );
}

interface EqGraphProps {
  state: SpeakerState;
  eqOn: boolean;
  onBand: (index: number, db: number) => void;
}

// The ten bands as G HUB draws them: the frequency over each, the slider, and the gain
// under it, which can be typed.
function EqGraph({ state, eqOn, onBand }: EqGraphProps) {
  const { t } = useTranslation();
  const min = state.bandMinDb;
  const max = state.bandMaxDb;
  const [live, setLive] = useState<Record<number, number>>({});
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  useEffect(() => { setLive({}); }, [state.bands]);

  const commitDraft = (i: number) => {
    const draft = drafts[i];
    if (draft === undefined) return;
    setDrafts(prev => {
      const next = { ...prev };
      delete next[i];
      return next;
    });
    const db = typedDb(draft, min, max);
    if (db !== null) onBand(i, db);
  };

  return (
    <div className={own.eqWrap}>
      <div className={own.eqGraph}>
        <EqScale min={min} max={max} side="left" />
        {state.bands.map((band, i) => {
          const value = live[i] ?? band;
          const hz = state.bandHz[i] ?? 0;
          return (
            <div key={hz || i} className={own.eqBand}>
              <span className={`${own.eqHz} ${eqOn ? '' : own.dim}`}>{hzLabel(hz)}</span>
              <SpeakerEqSlider
                value={value}
                min={min}
                max={max}
                label={`${hz} ${HZ}`}
                valueText={`${signedDb(value)} ${DB}`}
                disabled={!eqOn}
                onInput={db => setLive(prev => ({ ...prev, [i]: db }))}
                onCommit={db => onBand(i, db)}
              />
              <TextInput
                size="sm"
                align="center"
                maxLength={6}
                disabled={!eqOn}
                ariaLabel={t('devices.logitechSpeaker.bandValue', { hz })}
                value={drafts[i] ?? signedDb(value)}
                onInput={v => setDrafts(prev => ({ ...prev, [i]: v }))}
                onSubmit={() => commitDraft(i)}
                onBlur={() => commitDraft(i)}
              />
            </div>
          );
        })}
        <EqScale min={min} max={max} side="right" />
      </div>
      <p className={own.note}>{t('devices.logitechSpeaker.eqExplainRange')}</p>
      <p className={own.note}>{t('devices.logitechSpeaker.eqExplainMove')}</p>
    </div>
  );
}

function AcousticsTab({ state, change }: { state: SpeakerState; change: (c: Change) => Promise<boolean> }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [volume, setVolume] = useState<number | null>(null);
  const [sub, setSub] = useState<number | null>(null);
  const eqOn = state.eqEnabled;
  const current = state.presets.find(p => p.name === state.preset);

  const setBand = (i: number, db: number) => {
    const bands = state.bands.map((b, j) => (j === i ? db : b));
    void change(() => setSpeakerEq({ bands }));
  };
  const savePreset = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (await change(() => saveSpeakerPreset(trimmed, state.bands)) && await change(() => setSpeakerEq({ preset: trimmed }))) {
      setSaving(false);
      setName('');
    }
  };

  return (
    <>
      <SettingsSection title={t('devices.logitechSpeaker.speaker')} boxClassName={styles.sectionBox}>
        <Slider
          orientation={STACKED}
          label={t('devices.logitechSpeaker.volume')}
          trackFill
          min={0}
          max={100}
          value={volume ?? Math.round((state.volume ?? 0) * 100)}
          onChange={v => setVolume(v)}
          onCommit={v => { void change(() => setSpeakerVolume(v / 100)).then(() => setVolume(null)); }}
        />
        <Slider
          orientation={STACKED}
          label={t('devices.logitechSpeaker.subwoofer')}
          trackFill
          min={0}
          max={100}
          disabled={state.subwooferLevel == null}
          value={sub ?? state.subwooferLevel ?? 70}
          onChange={v => setSub(v)}
          onCommit={v => { void change(() => setSpeakerSubwoofer(Math.round(v))).then(() => setSub(null)); }}
        />
      </SettingsSection>
      <SettingsSection title={t('devices.logitechSpeaker.eq')} boxClassName={styles.sectionBox}>
        <SettingToggle
          label={t('devices.logitechSpeaker.advancedEq')}
          description={t('devices.logitechSpeaker.advancedEqHint')}
          checked={eqOn}
          onChange={on => { void change(() => setSpeakerEq({ enabled: on })); }}
        />
        <SettingSelect
          label={t('devices.logitechSpeaker.preset')}
          value={current?.name ?? ''}
          placeholder={t('devices.logitechSpeaker.custom')}
          options={state.presets.map(p => ({ value: p.name, label: p.name }))}
          disabled={!eqOn}
          onChange={v => { if (v) void change(() => setSpeakerEq({ preset: v, enabled: true })); }}
        />
        <div className={`${own.presetName} ${eqOn ? '' : own.dim}`}>{current?.name ?? t('devices.logitechSpeaker.custom')}</div>
        <EqGraph state={state} eqOn={eqOn} onBand={setBand} />
        {saving ? (
          <div className={own.row}>
            <div className={own.grow}>
              <TextInput
                value={name}
                placeholder={t('devices.logitechSpeaker.presetName')}
                ariaLabel={t('devices.logitechSpeaker.presetName')}
                maxLength={40}
                onInput={setName}
                onSubmit={() => { void savePreset(); }}
              />
            </div>
            <Button size="sm" tone="accent" disabled={!name.trim()} onClick={() => { void savePreset(); }}>
              {t('devices.logitechSpeaker.save')}
            </Button>
            <Button size="sm" tone="ghost" onClick={() => { setSaving(false); setName(''); }}>{t('confirm.cancel')}</Button>
          </div>
        ) : (
          <div className={own.row}>
            <Button size="sm" tone="neutral" disabled={!eqOn} onClick={() => { void change(() => setSpeakerEq({ preset: 'Flat' })); }}>
              {t('devices.logitechSpeaker.flat')}
            </Button>
            <Button size="sm" tone="neutral" disabled={!eqOn} onClick={() => setSaving(true)}>
              {t('devices.logitechSpeaker.savePreset')}
            </Button>
            {current && !current.builtIn && (
              <Button size="sm" tone="danger" onClick={() => { void change(() => deleteSpeakerPreset(current.name)); }}>
                {t('devices.logitechSpeaker.deletePreset')}
              </Button>
            )}
          </div>
        )}
      </SettingsSection>
    </>
  );
}

interface SpeakerSpotProps {
  channel: string;
  index: number;
  state: SpeakerState;
  playing: boolean;
  side: 'left' | 'right' | 'top';
  onTest: (index: number) => void;
  change: (c: Change) => Promise<boolean>;
}

// One speaker: its icon (a click plays its test sound) and its VOL stepper.
function SpeakerSpot({ channel, index, state, playing, side, onTest, change }: SpeakerSpotProps) {
  const { t } = useTranslation();
  const level = volOf(state.channelGains[index]);
  const max = volMax(state.channelMaxGain);
  const [draft, setDraft] = useState<string | null>(null);
  const name = t(`devices.logitechSpeaker.channel.${channel}`);
  const setLevel = (v: number) => {
    const clamped = Math.min(max, Math.max(0, v));
    void change(() => setSpeakerChannel(index, clamped / 10));
  };
  const commit = () => {
    if (draft === null) return;
    const typed = parseNumber(draft);
    setDraft(null);
    if (typed !== null) setLevel(Math.round(typed));
  };
  const icon = (
    <button type="button" className={`${own.speaker} ${playing ? own.playing : ''}`} onClick={() => onTest(index)}
      aria-label={t('devices.logitechSpeaker.testOne', { speaker: name })}>
      <span className={channel === 'subwoofer' ? own.subIcon : own.speakerIcon}><SpeakerIcon channel={channel} /></span>
      <span className={own.speakerName}>{name}</span>
    </button>
  );
  const vol = (
    <div className={own.vol}>
      <span className={own.volLabel}>{VOL}</span>
      <Button size="sm" tone="ghost" icon={<Minus size={14} />} aria-label={t('devices.logitechSpeaker.lower')}
        disabled={level <= 0} onClick={() => setLevel(level - 1)} />
      <div className={own.volInput}>
        <TextInput size="sm" align="center" maxLength={3} value={draft ?? String(level)}
          ariaLabel={t('devices.logitechSpeaker.volumeOf', { speaker: name })}
          onInput={setDraft} onSubmit={commit} onBlur={commit} />
      </div>
      <Button size="sm" tone="ghost" icon={<Plus size={14} />} aria-label={t('devices.logitechSpeaker.higher')}
        disabled={level >= max} onClick={() => setLevel(level + 1)} />
    </div>
  );
  return (
    <div className={`${own.spot} ${side === 'top' ? own.spotTop : ''}`}>
      {side === 'right' ? <>{icon}{vol}</> : <>{vol}{icon}</>}
    </div>
  );
}

function SurroundTab({ state, change }: { state: SpeakerState; change: (c: Change) => Promise<boolean> }) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState<number | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const timer = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
    window.clearTimeout(timer.current);
  }, []);

  const test = (index: number) => {
    setPlaying(index);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPlaying(null), TEST_MS);
    void testSpeakerChannel(index);
  };
  const testAll = async () => {
    setTestingAll(true);
    try {
      for (const index of testOrder(state.channels)) {
        if (!alive.current) return;
        test(index);
        await new Promise(resolve => window.setTimeout(resolve, TEST_GAP_MS));
      }
    } finally {
      if (alive.current) setTestingAll(false);
    }
  };

  const spot = (channel: string, side: 'left' | 'right' | 'top') => {
    const index = state.channels.indexOf(channel);
    return index < 0 ? <div className={own.cell} />
      : (
        <div className={own.cell}>
          <SpeakerSpot channel={channel} index={index} state={state} playing={playing === index} side={side} onTest={test} change={change} />
        </div>
      );
  };
  const blank = () => <div className={own.cell} />;

  return (
    <>
      <SettingsSection title={t('devices.logitechSpeaker.surround')} boxClassName={styles.sectionBox}>
        <SettingToggle
          label={t('devices.logitechSpeaker.dtsToggle')}
          description={t('devices.logitechSpeaker.dtsHint')}
          checked={state.surroundEnabled}
          onChange={on => { void change(() => setSpeakerSurround({ enabled: on })); }}
        />
        <SettingRow label={t('devices.logitechSpeaker.mode')} disabled={!state.surroundEnabled}>
          <ChipGroup
            ariaLabel={t('devices.logitechSpeaker.mode')}
            options={[
              { key: GAMING, label: t('devices.logitechSpeaker.gaming'), disabled: !state.surroundEnabled },
              { key: MOVIE, label: t('devices.logitechSpeaker.movie'), disabled: !state.surroundEnabled },
            ]}
            activeKey={state.room === MOVIE ? MOVIE : GAMING}
            onChange={room => { void change(() => setSpeakerSurround({ room })); }}
          />
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('devices.logitechSpeaker.speakers')} boxClassName={styles.sectionBox}>
        <p className={own.note}>{t('devices.logitechSpeaker.speakersHint', { min: 0, max: volMax(state.channelMaxGain) })}</p>
        <p className={own.note}>{t('devices.logitechSpeaker.speakersTestHint')}</p>
        <div className={own.layout}>
          {spot('subwoofer', 'right')}{blank()}{spot('center', 'top')}{blank()}{blank()}
          {blank()}{spot('frontLeft', 'left')}{blank()}{spot('frontRight', 'right')}{blank()}
          {spot('sideLeft', 'left')}{blank()}
          <div className={`${own.cell} ${own.cross}`}>
            <SurroundCross front={t('devices.logitechSpeaker.front')} back={t('devices.logitechSpeaker.back')} />
          </div>
          {blank()}{spot('sideRight', 'right')}
          {blank()}{spot('rearLeft', 'left')}{blank()}{spot('rearRight', 'right')}{blank()}
        </div>
        <div className={`${own.row} ${own.centred}`}>
          <Button size="sm" tone="neutral" icon={<Volume2 size={14} />} disabled={testingAll} onClick={() => { void testAll(); }}>
            {t('devices.logitechSpeaker.testAll')}
          </Button>
          <Button size="sm" tone="ghost" onClick={() => { void change(() => setSpeakerChannel(undefined)); }}>
            {t('devices.logitechSpeaker.resetSpeakers')}
          </Button>
        </div>
      </SettingsSection>
    </>
  );
}

/**
 * A Logitech speaker's page (the G560), with G HUB's Acoustics and Surround sound pages
 * as tabs: volume and subwoofer level, the ten-band EQ with the speaker's own presets,
 * DTS:X and each speaker's volume with a test sound. Everything goes through the
 * service, which writes it to Logitech's speaker effect the way G HUB does.
 */
export function LogitechSpeakerDevicePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SpeakerTab>('acoustics');
  const [state, setState] = useState<SpeakerState | null>(null);
  const [failed, setFailed] = useState(false);
  const busy = useRef(0);

  const refresh = useCallback(async () => {
    if (busy.current > 0) return;
    const next = await getSpeaker();
    if (next && busy.current === 0) setState(next);
  }, []);
  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // A change hands back the state after it, shown at once; a poll landing meanwhile is dropped.
  const change = useCallback(async (call: Change) => {
    busy.current += 1;
    try {
      const next = await call();
      if (next) setState(next);
      setFailed(!next);
      return !!next;
    } finally {
      busy.current -= 1;
    }
  }, []);

  const title = state?.model ? `Logitech ${state.model}` : 'Logitech G560';
  const tabs = [
    { key: 'acoustics', label: t('devices.logitechSpeaker.acoustics'), icon: <Music size={14} /> },
    { key: 'surround', label: t('devices.logitechSpeaker.surround'), icon: <Radio size={14} /> },
  ];

  return (
    <div className={styles.page}>
      <ViewHeader title={title} tabs={tabs} activeTab={tab} onTabChange={key => setTab(key as SpeakerTab)} />
      <div className={`${styles.pageBody} pageBody`}>
        {!state ? (
          <div className={own.loading}><Spinner size={28} /></div>
        ) : !state.present ? (
          <EmptyState icon={<Speaker size={40} />} title={t('devices.logitechSpeaker.notFound')} hint={t('devices.logitechSpeaker.notFoundHint')} />
        ) : (
          <div className={own.tab}>
            {failed && <Notice tone="critical" role="alert">{t('devices.logitechSpeaker.failed')}</Notice>}
            {tab === 'surround' ? <SurroundTab state={state} change={change} /> : <AcousticsTab state={state} change={change} />}
          </div>
        )}
      </div>
    </div>
  );
}
