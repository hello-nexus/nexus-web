import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { CurveGraph } from '../../../panel/widgets/cooling/page/CurveEditor';
import type { CurvePoint } from '../../../api/cooling';
import { Spinner } from '../../common/Spinner/Spinner';
import { Stepper } from '../../common/Stepper/Stepper';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { useLogitechSpeaker } from './useLogitechSpeaker';
import {
  SPEAKER_FACING, SPEAKER_POS, builtInPresetLabelKey, currentPreset, dbLabel, hzLabel, isFlat, testOrder, volMax, volOf,
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
// The service keeps any number of user presets; the toolbar needs a cap.
const PRESET_LIMIT = 999;
const MANUAL_ID = '__manual__';
// How long a speaker stays lit after its test sound starts, and the gap between speakers in Test all.
const TEST_LIT_MS = 1300;
const TEST_GAP_MS = 1600;
const ICON_PX = 20;

interface TabProps { state: SpeakerState; change: Change; report: (key: string) => void }

// Bands sit on a fixed grid, one column each; the axis runs half a column past the first and last.
const GRAPH_H = 230;
const KEY_STEP_DB = 0.5;
const DB_STEP = 0.5;
const EASING = 'smooth';

function EqBands({ state, change }: TabProps) {
  const { t } = useTranslation();
  const [live, setLive] = useState<Record<number, number>>({});
  const eqOn = state.eqEnabled;
  const min = state.bandMinDb;
  const max = state.bandMaxDb;
  // Bands being dragged, and how many commits still await an answer.
  const open = useRef(new Set<number>());
  const inflight = useRef(0);
  const moved = useRef<number | null>(null);
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
  // A disabled graph drops its gesture without committing, so its local values go too.
  useEffect(() => {
    if (eqOn) return;
    open.current.clear();
    moved.current = null;
    setLive({});
  }, [eqOn]);

  const commit = (index: number, db: number) => {
    open.current.delete(index);
    wanted.current = wanted.current.map((b, i) => (i === index ? db : b));
    // Shown until the service answers, so the next step starts from here and not from the old band.
    setLive(prev => ({ ...prev, [index]: db }));
    const bands = wanted.current;
    inflight.current += 1;
    void change(() => setSpeakerEq({ bands })).finally(() => {
      inflight.current -= 1;
      settle();
    });
  };

  const shown = state.bands.map((b, i) => live[i] ?? b);
  const points = shown.map((speed, temp) => ({ temp, speed }));
  const axis = {
    xTicks: state.bands.map((_, i) => i),
    formatX: (v: number) => hzLabel(state.bandHz[v] ?? 0),
    xName: t('lighting.studio.param.frequency'),
    yName: t('lighting.studio.param.gain'),
  };
  const yAxis = {
    min, max, step: DB_STEP, lines: [0],
    labels: [{ value: max, label: dbLabel(max) }, { value: min, label: dbLabel(min) }],
    formatValue: dbLabel,
  };
  const drag = useMemo(() => ({
    isLocked: () => !eqOn,
    // The graph names the band it moves, drag or key, so no value comparison has to guess it.
    apply: (pts: CurvePoint[], index: number, value: number) => {
      moved.current = index;
      return pts.map((pt, i) => (i === index ? { ...pt, speed: value } : pt));
    },
  }), [eqOn]);

  return (
    <CurveGraph
      points={points}
      height={GRAPH_H}
      tempMin={-0.5}
      tempMax={shown.length - 0.5}
      editable={eqOn}
      easing={EASING}
      axis={axis}
      yAxis={yAxis}
      verticalDrag={drag}
      keyboardStep={KEY_STEP_DB}
      onPreview={next => {
        const i = moved.current;
        if (i === null) return;
        open.current.add(i);
        setLive(prev => ({ ...prev, [i]: next[i].speed }));
      }}
      onCancel={() => {
        const i = moved.current;
        moved.current = null;
        if (i === null) return;
        open.current.delete(i);
        setLive(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => Number(k) !== i)));
      }}
      onChange={next => {
        const i = moved.current;
        moved.current = null;
        if (i !== null) commit(i, next[i].speed);
      }}
    />
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
  // Only a built-in's label is translated; the id and the wire value stay its English name.
  const labelOf = (name: string) => { const key = builtInPresetLabelKey(name); return key ? t(key) : name; };

  return (
    <PresetToolbar
      showHistory={false}
      translationPrefix="cooling.presets"
      cap={PRESET_LIMIT}
      presetCount={own.length}
      presets={own.map(p => ({ id: p.name, name: p.name }))}
      activeId={current && !current.builtIn ? current.name : null}
      builtins={[...(manual ? [{ id: MANUAL_ID, label: t(`${P}manual`) }] : []), ...builtIns.map(p => ({ id: p.name, label: labelOf(p.name) }))]}
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
