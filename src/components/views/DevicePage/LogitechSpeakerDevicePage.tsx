import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Notice } from '../../common/Notice/Notice';
import { PromptModal } from '../../common/PromptModal/PromptModal';
import { SettingRow, SettingSelect, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { Slider } from '../../common/Slider/Slider';
import { Spinner } from '../../common/Spinner/Spinner';
import { Stepper } from '../../common/Stepper/Stepper';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { useLogitechSpeaker } from './useLogitechSpeaker';
import {
  SPEAKER_FACING, SPEAKER_POS, currentPreset, hzLabel, isFlat, presetNameTaken, signedDb, testOrder, volMax, volOf,
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
const EQ_LENGTH_PX = 170;
// How long a speaker stays lit after its test sound starts, and the gap between speakers in Test all.
const TEST_LIT_MS = 1300;
const TEST_GAP_MS = 1600;
const ICON_PX = 20;

interface TabProps { state: SpeakerState; change: Change }

function EqBands({ state, change }: TabProps) {
  const { t } = useTranslation();
  const [live, setLive] = useState<Record<number, number>>({});
  const eqOn = state.eqEnabled;
  // A fresh state replaces any value still being dragged.
  useEffect(() => { setLive({}); }, [state.bands]);

  const commit = (index: number, db: number) => {
    const bands = state.bands.map((b, i) => (i === index ? db : b));
    void change(() => setSpeakerEq({ bands }));
  };

  return (
    <div className={styles.bands} role="group" aria-label={t(`${P}bands`)}>
      {state.bands.map((band, i) => {
        const hz = state.bandHz[i] ?? 0;
        return (
          <Slider
            key={hz || i}
            orientation="vertical"
            length={EQ_LENGTH_PX}
            editable
            zeroMarker
            trackFill
            label={hzLabel(hz)}
            ariaLabel={t(`${P}band`, { hz })}
            min={state.bandMinDb}
            max={state.bandMaxDb}
            step={0.5}
            value={live[i] ?? band}
            formatValue={signedDb}
            disabled={!eqOn}
            onChange={v => setLive(prev => ({ ...prev, [i]: v }))}
            onCommit={v => commit(i, v)}
          />
        );
      })}
    </div>
  );
}

function AcousticsTab({ state, change }: TabProps) {
  const { t } = useTranslation();
  const [volume, setVolume] = useState<number | null>(null);
  const [sub, setSub] = useState<number | null>(null);
  const [dialog, setDialog] = useState<'save' | 'rename' | 'delete' | null>(null);
  const eqOn = state.eqEnabled;
  const current = currentPreset(state.presets, state.preset);
  const custom = current && !current.builtIn ? current : undefined;
  const builtIns = state.presets.filter(p => p.builtIn);
  const own = state.presets.filter(p => !p.builtIn);

  const options = [
    ...(builtIns.length > 0 ? [{ value: '', label: t(`${P}presetsDefault`), header: true }] : []),
    ...builtIns.map(p => ({ value: p.name, label: p.name })),
    ...(own.length > 0 ? [{ value: '', label: t(`${P}presetsCustom`), header: true }] : []),
    ...own.map(p => ({ value: p.name, label: p.name })),
  ];

  const nameError = (name: string, except?: string) => {
    if (name.trim() === '') return t(`${P}nameEmpty`);
    return presetNameTaken(state.presets, name, except) ? t(`${P}nameTaken`) : null;
  };

  const save = async (name: string) => {
    const trimmed = name.trim();
    if (!(await change(() => saveSpeakerPreset(trimmed, state.bands)))) return t(`${P}failed`);
    await change(() => setSpeakerEq({ preset: trimmed }));
    setDialog(null);
    return null;
  };

  const rename = async (name: string) => {
    if (!custom) return null;
    const trimmed = name.trim();
    if (trimmed !== custom.name) {
      if (!(await change(() => saveSpeakerPreset(trimmed, custom.bands)))) return t(`${P}failed`);
      await change(() => deleteSpeakerPreset(custom.name));
    }
    setDialog(null);
    return null;
  };

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
          onCommit={v => { void change(() => setSpeakerVolume(v / 100)).then(() => setVolume(null)); }}
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
          onCommit={v => { void change(() => setSpeakerSubwoofer(Math.round(v))).then(() => setSub(null)); }}
        />
      </SettingsSection>

      <SettingsSection title={t(`${P}equalizer`)} description={t(`${P}equalizerHint`, { min: state.bandMinDb, max: state.bandMaxDb })} boxClassName={styles.box}>
        <SettingToggle
          label={t(`${P}advancedEq`)}
          checked={eqOn}
          onChange={on => { void change(() => setSpeakerEq({ enabled: on })); }}
        />
        <SettingSelect
          label={t(`${P}preset`)}
          value={current?.name ?? ''}
          placeholder={t(`${P}custom`)}
          options={options}
          disabled={!eqOn}
          onChange={v => { if (v) void change(() => setSpeakerEq({ preset: v })); }}
        />
        <div className={styles.actions}>
          <Button size="sm" disabled={!eqOn} onClick={() => setDialog('save')}>{t(`${P}savePreset`)}</Button>
          {custom && <Button size="sm" onClick={() => setDialog('rename')}>{t(`${P}rename`)}</Button>}
          {custom && <Button size="sm" tone="danger" onClick={() => setDialog('delete')}>{t(`${P}deletePreset`)}</Button>}
          <Button size="sm" tone="ghost" disabled={!eqOn || isFlat(state.bands)} onClick={() => { void change(() => setSpeakerEq({ preset: 'Flat' })); }}>
            {t(`${P}flat`)}
          </Button>
        </div>
        <EqBands state={state} change={change} />
      </SettingsSection>

      <PromptModal
        open={dialog === 'save'}
        title={t(`${P}saveTitle`)}
        placeholder={t(`${P}presetName`)}
        maxLength={40}
        confirmLabel={t(`${P}save`)}
        validate={name => nameError(name)}
        onConfirm={save}
        onCancel={() => setDialog(null)}
      />
      <PromptModal
        open={dialog === 'rename' && custom !== undefined}
        title={t(`${P}renameTitle`)}
        placeholder={t(`${P}presetName`)}
        initialValue={custom?.name ?? ''}
        maxLength={40}
        confirmLabel={t(`${P}save`)}
        validate={name => nameError(name, custom?.name)}
        onConfirm={rename}
        onCancel={() => setDialog(null)}
      />
      <ConfirmModal
        open={dialog === 'delete' && custom !== undefined}
        title={t(`${P}deleteTitle`)}
        message={t(`${P}deleteMessage`, { name: custom?.name ?? '' })}
        confirmLabel={t(`${P}deletePreset`)}
        onConfirm={() => {
          if (custom) void change(() => deleteSpeakerPreset(custom.name));
          setDialog(null);
        }}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}

function SurroundTab({ state, change }: TabProps) {
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
        <Stepper label={t(`${P}volumeOf`, { speaker: name })} min={0} max={max} value={pending[index] ?? volOf(state.channelGains[index])} onChange={v => setVol(index, v)} />
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

      <SettingsSection title={t(`${P}speakers`)} description={t(`${P}speakersHint`)} boxClassName={styles.box}>
        <ChannelLayout
          nodes={nodes}
          activeId={lit === null ? null : String(lit)}
          hint={t(`${P}testHint`)}
          ariaLabel={t(`${P}speakers`)}
          center={<><User size={ICON_PX} aria-hidden /><span>{t(`${P}listener`)}</span></>}
          onActivate={id => test(Number(id))}
        />
        <div className={styles.actions}>
          <Button size="sm" icon={<Volume2 size={14} />} disabled={testingAll} onClick={() => { void testAll(); }}>{t(`${P}testAll`)}</Button>
          <Button size="sm" tone="ghost" onClick={() => { setPending({}); void change(() => resetSpeakerChannels()); }}>{t(`${P}reset`)}</Button>
        </div>
      </SettingsSection>
    </>
  );
}

/** The Logitech G560 page: G HUB's Acoustics (volume, subwoofer, equalizer with presets) and Surround sound (DTS:X, per-speaker volume and test sounds). */
export function LogitechSpeakerDevicePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('acoustics');
  const { state, loadFailed, failed, change } = useLogitechSpeaker();

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
        {failed && <Notice tone="critical" role="alert">{t(`${P}failed`)}</Notice>}
        {loadFailed && !state && <Notice tone="critical" role="alert">{t(`${P}loadFailed`)}</Notice>}
        {!state && !loadFailed && <div className={styles.loading}><Spinner size={28} /></div>}
        {state && !state.present && (
          <EmptyState icon={<Speaker size={40} />} title={t(`${P}notFound`)} hint={t(`${P}notFoundHint`)} />
        )}
        {state?.present && (
          <div className={styles.tab}>
            {tab === 'surround' ? <SurroundTab state={state} change={change} /> : <AcousticsTab state={state} change={change} />}
          </div>
        )}
      </div>
    </div>
  );
}
