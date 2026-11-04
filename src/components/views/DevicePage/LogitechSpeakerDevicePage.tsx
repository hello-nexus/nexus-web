import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Music, Radio, Speaker, User, Volume2 } from 'lucide-react';
import {
  deleteSpeakerPreset, resetSpeakerChannels, saveSpeakerPreset, setSpeakerChannel, setSpeakerEq,
  setSpeakerSubwoofer, setSpeakerSurround, setSpeakerVolume, testSpeakerChannel,
  type SpeakerRoom, type SpeakerState,
} from '../../../api/logitechSpeaker';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../../common/Button/Button';
import { ChannelLayout, type ChannelNode } from '../../common/ChannelLayout/ChannelLayout';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Notice } from '../../common/Notice/Notice';
import { PresetToolbar } from '../../common/PresetToolbar/PresetToolbar';
import { SettingRow, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { Slider } from '../../common/Slider/Slider';
import { Spinner } from '../../common/Spinner/Spinner';
import { Stepper } from '../../common/Stepper/Stepper';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { useLogitechSpeaker } from './useLogitechSpeaker';
import {
  SPEAKER_FACING, SPEAKER_POS, currentPreset, hzLabel, isFlat, signedDb, testOrder, volMax, volOf,
} from './speakerUtils';
import styles from './LogitechSpeakerDevicePage.module.scss';

type Tab = 'acoustics' | 'surround';
type Change = (call: () => Promise<SpeakerState | null>) => Promise<boolean>;

const P = 'devices.logitechSpeaker.';
const TABS: readonly { key: Tab; icon: ReactNode }[] = [
  { key: 'acoustics', icon: <Music size={14} /> },
  { key: 'surround', icon: <Radio size={14} /> },
];
const ROOMS: readonly SpeakerRoom[] = ['gaming', 'movie'];
const EQ_LENGTH_PX = 190;
const HZ = 'Hz';
const DB = 'dB';
// The service keeps any number of user presets; the toolbar needs a cap.
const PRESET_LIMIT = 999;
const MANUAL_ID = '__manual__';
// How long a speaker stays lit after its test sound starts, and the gap between speakers in Test all.
const TEST_LIT_MS = 1300;
const TEST_GAP_MS = 1600;
const ICON_PX = 20;

interface TabProps { state: SpeakerState; change: Change; report: (key: string) => void }

// One scale for the bands: the labels above and below the track, and the gap between them, are
// shared with the scale column and the zero line so all three line up.
const EQ_VARS = {
  '--slider-vertical-label-height': '1.25rem',
  '--slider-vertical-value-height': '1.5rem',
  '--slider-vertical-gap': '0.35rem',
} as CSSProperties;

function EqBands({ state, change }: TabProps) {
  const { t } = useTranslation();
  const [live, setLive] = useState<Record<number, number>>({});
  const eqOn = state.eqEnabled;
  const min = state.bandMinDb;
  const max = state.bandMaxDb;
  // Bands being dragged, and how many commits still await an answer.
  const open = useRef(new Set<number>());
  const inflight = useRef(0);
  // The latest bands this page has asked for, so a second commit keeps the first.
  const wanted = useRef(state.bands);
  const latest = useRef(state.bands);
  latest.current = state.bands;
  const key = state.bands.join(',');

  // Once nothing is awaiting an answer, the service's bands win and only open drags keep a local value.
  const settle = () => {
    if (inflight.current > 0) return;
    wanted.current = latest.current;
    setLive(prev => {
      const keep = Object.entries(prev).filter(([i]) => open.current.has(Number(i)));
      return keep.length === Object.keys(prev).length ? prev : Object.fromEntries(keep);
    });
  };
  // The key changes with the values, not with a poll's new array.
  useEffect(settle, [key]);
  // A disabled slider drops its gesture without committing, so its local values go too.
  useEffect(() => {
    if (eqOn) return;
    open.current.clear();
    setLive({});
  }, [eqOn]);

  const commit = (index: number, db: number) => {
    open.current.delete(index);
    wanted.current = wanted.current.map((b, i) => (i === index ? db : b));
    const bands = wanted.current;
    inflight.current += 1;
    void change(() => setSpeakerEq({ bands })).finally(() => {
      inflight.current -= 1;
      settle();
    });
  };
  // Where a gain sits down the track, 0 at the top (max) to 1 at the bottom (min).
  const down = (db: number) => (max - db) / (max - min);
  const along = (frac: number) => `calc(var(--slider-thumb-size) / 2 + (var(--eq-length) - var(--slider-thumb-size)) * ${frac})`;

  return (
    <div className={styles.eq} style={{ ...EQ_VARS, '--eq-length': `${EQ_LENGTH_PX}px` } as CSSProperties}>
      <span className={styles.zeroLine} style={{ top: `calc(var(--eq-top) + ${along(down(0))})` }} aria-hidden />
      <div className={styles.scale} aria-hidden>
        <span className={styles.unit}>{HZ}</span>
        <div className={styles.marks}>
          {[max, 0, min].map(db => <span key={db} className={styles.mark} style={{ top: along(down(db)) }}>{signedDb(db)}</span>)}
        </div>
        <span className={styles.unit}>{DB}</span>
      </div>
      <div className={styles.bands} role="group" aria-label={t(`${P}bands`)}>
        {state.bands.map((band, i) => {
          const hz = state.bandHz[i] ?? 0;
          return (
            <Slider
              key={hz || i}
              orientation="vertical"
              length={EQ_LENGTH_PX}
              editable
              trackFill
              label={hzLabel(hz)}
              ariaLabel={t(`${P}band`, { hz })}
              min={min}
              max={max}
              step={0.5}
              value={live[i] ?? band}
              formatValue={signedDb}
              disabled={!eqOn}
              onChange={v => { open.current.add(i); setLive(prev => ({ ...prev, [i]: v })); }}
              onCommit={v => commit(i, v)}
            />
          );
        })}
      </div>
    </div>
  );
}

function AcousticsTab({ state, change, report }: TabProps) {
  const { t } = useTranslation();
  const [volume, setVolume] = useState<number | null>(null);
  const [sub, setSub] = useState<number | null>(null);
  const eqOn = state.eqEnabled;

  return (
    <>
      <SettingsSection title={t(`${P}output`)} boxClassName={styles.box}>
        <SettingSlider
          label={t(`${P}volume`)}
          editable
          trackFill
          min={0}
          max={100}
          value={volume ?? Math.round((state.volume ?? 0) * 100)}
          onChange={v => setVolume(v)}
          onCommit={v => { void change(() => setSpeakerVolume(v / 100)).then(() => setVolume(cur => (cur === v ? null : cur))); }}
        />
        <SettingSlider
          label={t(`${P}subwoofer`)}
          editable
          trackFill
          min={0}
          max={100}
          disabled={state.subwooferLevel === undefined}
          value={sub ?? state.subwooferLevel ?? 0}
          onChange={v => setSub(v)}
          onCommit={v => { void change(() => setSpeakerSubwoofer(Math.round(v))).then(() => setSub(cur => (cur === v ? null : cur))); }}
        />
      </SettingsSection>

      <SettingsSection
        title={t(`${P}equalizer`)}
        boxClassName={styles.box}
        action={(
          <Button size="sm" disabled={!eqOn || isFlat(state.bands)} onClick={() => { void change(() => setSpeakerEq({ preset: 'Flat' })); }}>
            {t(`${P}flat`)}
          </Button>
        )}
      >
        <SettingToggle
          label={t(`${P}advancedEq`)}
          checked={eqOn}
          onChange={on => { void change(() => setSpeakerEq({ enabled: on })); }}
        />
        <SettingRow label={t(`${P}preset`)}>
          <SpeakerPresets state={state} change={change} report={report} />
        </SettingRow>
        <EqBands state={state} change={change} report={report} />
      </SettingsSection>
    </>
  );
}

/** The EQ presets as the shared preset dropdown: G HUB's own first, then the user's, with new, rename and delete. */
function SpeakerPresets({ state, change, report }: TabProps) {
  // With Advanced EQ off nothing is selected and saving is off; on, an unmatched curve is Manual.
  const eqOn = state.eqEnabled;
  const current = eqOn ? currentPreset(state.presets, state.preset) : undefined;
  const manual = eqOn && !current;
  const own = state.presets.filter(p => !p.builtIn);
  const builtIns = state.presets.filter(p => p.builtIn);
  const { t } = useTranslation();
  const select = (preset: string) => { void change(() => setSpeakerEq({ preset })); };

  return (
    <PresetToolbar
      showHistory={false}
      translationPrefix="cooling.presets"
      cap={PRESET_LIMIT}
      presetCount={own.length}
      presets={own.map(p => ({ id: p.name, name: p.name }))}
      activeId={current && !current.builtIn ? current.name : null}
      builtins={[...(manual ? [{ id: MANUAL_ID, label: t(`${P}manual`) }] : []), ...builtIns.map(p => ({ id: p.name, label: p.name }))]}
      activeBuiltinId={manual ? MANUAL_ID : current?.builtIn ? current.name : null}
      onSelectBuiltin={id => { if (id !== MANUAL_ID) select(id); }}
      presetsHeader={t(`${P}presetsCustom`)}
      inlineSave={{ label: t(`${P}savePreset`), disabled: !manual }}
      onLoad={select}
      reservedNames={builtIns.map(p => p.name)}
      onCreate={async name => {
        const trimmed = name.trim();
        if (!(await change(() => saveSpeakerPreset(trimmed, state.bands)))) return { error: true, msg: t(`${P}failed`) };
        await change(() => setSpeakerEq({ preset: trimmed }));
        return { error: false };
      }}
      onRename={(id, name) => {
        const preset = own.find(p => p.name === id);
        const trimmed = name.trim();
        if (!preset || trimmed === id) return;
        // The service matches names without case, so a case-only rename is a replace and must not delete.
        const sameName = trimmed.toLowerCase() === id.toLowerCase();
        void (async () => {
          if (!(await change(() => saveSpeakerPreset(trimmed, preset.bands)))) return;
          const removed = sameName || await change(() => deleteSpeakerPreset(id));
          // The new name is selected last: with the bands equal to several presets the service names none.
          await change(() => setSpeakerEq({ preset: trimmed }));
          if (!removed) report(`${P}renameIncomplete`);
        })();
      }}
      onDelete={id => { void change(() => deleteSpeakerPreset(id)); }}
    />
  );
}

function SurroundTab({ state, change, report }: TabProps) {
  const { t } = useTranslation();
  const [lit, setLit] = useState<number | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  // A step the user just took, shown until the speaker's own answer arrives.
  const [pending, setPending] = useState<Record<number, number>>({});
  const timer = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  const test = (index: number) => {
    setLit(index);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLit(null), TEST_LIT_MS);
    void testSpeakerChannel(index).then(res => { if (!res || res.error) report(`${P}testFailed`); });
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

  const setVol = (index: number, vol: number) => {
    setPending(prev => ({ ...prev, [index]: vol }));
    void change(() => setSpeakerChannel(index, vol / 10)).then(() => {
      if (!alive.current) return;
      // A newer step on the same speaker keeps showing until its own answer.
      setPending(prev => {
        if (prev[index] !== vol) return prev;
        const rest = { ...prev };
        delete rest[index];
        return rest;
      });
    });
  };

  const max = volMax(state.channelMaxGain);
  const nodes: ChannelNode[] = state.channels.flatMap((channel, index) => {
    const pos = SPEAKER_POS[channel];
    if (!pos) return [];
    const name = t(`${P}channel.${channel}`);
    return [{
      id: String(index),
      label: name,
      pos,
      icon: channel === 'subwoofer'
        ? <Speaker size={ICON_PX} aria-hidden />
        : <Volume2 size={ICON_PX} aria-hidden style={{ transform: `rotate(${SPEAKER_FACING[channel] ?? 0}deg)` }} />,
      control: (
        <Stepper orientation="horizontal" pad={false} label={t(`${P}volumeOf`, { speaker: name })} min={0} max={max} value={pending[index] ?? volOf(state.channelGains[index])} onChange={v => setVol(index, v)} />
      ),
    }];
  });

  return (
    <>
      <SettingsSection title={t(`${P}surround`)} boxClassName={styles.box}>
        <SettingToggle
          label={t(`${P}dts`)}
          checked={state.surroundEnabled}
          onChange={on => { void change(() => setSpeakerSurround({ enabled: on })); }}
        />
        <SettingRow label={t(`${P}mode`)} disabled={!state.surroundEnabled}>
          <ChipGroup
            ariaLabel={t(`${P}mode`)}
            options={ROOMS.map(room => ({ key: room, label: t(`${P}${room}`), disabled: !state.surroundEnabled }))}
            activeKey={state.room}
            onChange={room => { void change(() => setSpeakerSurround({ room: room as SpeakerRoom })); }}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title={t(`${P}speakers`)}
        description={t(`${P}speakersHint`)}
        boxClassName={styles.box}
        action={(
          <div className={styles.actions}>
            <Button size="sm" icon={<Volume2 size={14} />} disabled={testingAll} onClick={() => { void testAll(); }}>{t(`${P}testAll`)}</Button>
            <Button size="sm" onClick={() => { setPending({}); void change(() => resetSpeakerChannels()); }}>{t(`${P}reset`)}</Button>
          </div>
        )}
      >
        <ChannelLayout
          nodes={nodes}
          aspect={1.25}
          activeId={lit === null ? null : String(lit)}
          hint={t(`${P}testHint`)}
          ariaLabel={t(`${P}speakers`)}
          center={<><User size={ICON_PX} aria-hidden /><span>{t(`${P}listener`)}</span></>}
          onActivate={id => test(Number(id))}
        />
      </SettingsSection>
    </>
  );
}

/** The Logitech G560 page: G HUB's Acoustics (volume, subwoofer, equalizer with presets) and Surround sound (DTS:X, per-speaker volume and test sounds). */
export function LogitechSpeakerDevicePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('acoustics');
  const { state, loadFailed, failure, report, change } = useLogitechSpeaker();

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="Logitech G560"
        tabs={state?.present ? TABS.map(({ key, icon }) => ({ key, icon, label: t(`${P}${key}`) })) : undefined}
        activeTab={tab}
        onTabChange={key => setTab(key as Tab)}
      />
      <div className={styles.body}>
        {failure && <Notice tone="critical" role="alert">{t(failure)}</Notice>}
        {loadFailed && !state && <Notice tone="critical" role="alert">{t(`${P}loadFailed`)}</Notice>}
        {!state && !loadFailed && <div className={styles.loading}><Spinner size={28} /></div>}
        {state && !state.present && (
          <EmptyState icon={<Speaker size={40} />} title={t(`${P}notFound`)} hint={t(`${P}notFoundHint`)} />
        )}
        {state?.present && (
          <div className={styles.tab}>
            {tab === 'surround'
              ? <SurroundTab state={state} change={change} report={report} />
              : <AcousticsTab state={state} change={change} report={report} />}
          </div>
        )}
      </div>
    </div>
  );
}
