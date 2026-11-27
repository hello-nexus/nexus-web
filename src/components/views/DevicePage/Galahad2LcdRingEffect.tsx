import { useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { ColorSlots } from '../../common/ColorSlots/ColorSlots';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  getGalahad2LcdRingEffect,
  setGalahad2LcdRingEffect,
  type Galahad2LcdRingEffect,
  type Galahad2LcdRingEffectSpec,
} from '../../../api/lianli-galahad2-lcd';
import { useTranslation } from '../../../lib/i18n';
import lianli from './LianLiDevicePage.module.scss';

const SPEED_KEYS = ['slowest', 'slower', 'normal', 'faster', 'fastest'];
const DEFAULT_COLOR = '#ff0000';

interface Draft {
  /** Empty until an animation has been written once. */
  effect: string;
  speed: number;
  brightness: number;
  colors: string[];
}

/** Trims or tops up the color list to exactly what the animation reads. */
export function fitColors(colors: string[], count: number): string[] {
  const next = colors.slice(0, count);
  while (next.length < count) next.push(DEFAULT_COLOR);
  return next;
}

function draftOf(data: Galahad2LcdRingEffect): Draft {
  const spec = data.effects.find(e => e.id === data.effect);
  return {
    effect: spec ? spec.id : '',
    speed: data.speed,
    brightness: data.brightness,
    colors: fitColors(data.colors, spec?.colors ?? 0),
  };
}

interface Galahad2LcdRingEffectSectionProps {
  onSectionNavigate?: (section: string) => void;
}

/**
 * The animations the pump ring plays on its own. The panel cannot report what it plays,
 * so the values shown are the last write Nexus made. Every change is written at once.
 */
export function Galahad2LcdRingEffectSection({ onSectionNavigate }: Galahad2LcdRingEffectSectionProps) {
  const { t } = useTranslation();
  const [effects, setEffects] = useState<Galahad2LcdRingEffectSpec[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nexusDriven, setNexusDriven] = useState(false);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const aliveRef = useRef(true);
  /** Writes go out one at a time, in order, so the ring ends on the last one made. */
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  /** Only the newest write may touch state when it settles. */
  const seqRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      const data = await getGalahad2LcdRingEffect();
      if (!aliveRef.current || data === null || !data.isConnected || data.effects.length === 0) return;
      setEffects(data.effects);
      setNexusDriven(data.nexusDriven);
      setDraft(draftOf(data));
    })();

    // The flag flips on another page, so re-read it whenever this one is looked at again.
    const refreshDriven = () => {
      if (document.visibilityState === 'hidden') return;
      void (async () => {
        const data = await getGalahad2LcdRingEffect();
        if (aliveRef.current && data !== null) setNexusDriven(data.nexusDriven);
      })();
    };
    window.addEventListener('focus', refreshDriven);
    document.addEventListener('visibilitychange', refreshDriven);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', refreshDriven);
      document.removeEventListener('visibilitychange', refreshDriven);
    };
  }, []);

  const apply = useCallback((next: Draft) => {
    const seq = ++seqRef.current;
    setDraft(next);
    setFailed(false);
    chainRef.current = chainRef.current.then(async () => {
      const ok = await setGalahad2LcdRingEffect(next);
      if (!aliveRef.current || seq !== seqRef.current || ok !== null) return;
      // A refusal usually means the ring was handed to Nexus lighting meanwhile. Re-read so
      // the controls show what the ring really plays, and only report a failure when the
      // ring was still free to take the write.
      const fresh = await getGalahad2LcdRingEffect();
      if (!aliveRef.current || seq !== seqRef.current) return;
      if (fresh) {
        setDraft(draftOf(fresh));
        setNexusDriven(fresh.nexusDriven);
        setFailed(!fresh.nexusDriven);
      } else {
        setFailed(true);
      }
    });
  }, []);

  if (!draft) return null;
  const spec = effects.find(e => e.id === draft.effect);
  const activeIndex = Math.min(active, Math.max((spec?.colors ?? 1) - 1, 0));
  const locked = nexusDriven;
  const effectLabel = (id: string) => (id === 'breathing' ? t('devices.fwAnimation.breathing') : t(`devices.galahad2Ring.${id}`));

  const setColor = (hex: string, commit: boolean) => {
    const colors = [...draft.colors];
    colors[activeIndex] = hex;
    if (commit) apply({ ...draft, colors });
    else setDraft({ ...draft, colors });
  };

  return (
    <SettingsSection
      title={t('devices.q60.lightingFirmwareSection')}
      boxClassName={lianli.sectionBox}
      description={<p>{t('devices.q60.lightingFirmwareHelp')}</p>}
    >
      <SettingSelect
        label={t('devices.fwAnimation.effect')}
        value={draft.effect}
        placeholder={t('devices.galahad2Ring.noEffect')}
        disabled={locked}
        onChange={v => {
          const next = effects.find(e => e.id === v);
          if (!next) return;
          setActive(0);
          apply({ ...draft, effect: v, colors: fitColors(draft.colors, next.colors) });
        }}
        options={effects.map(e => ({ value: e.id, label: effectLabel(e.id) }))}
      />

      <SettingSlider
        editable
        trackFill
        disabled={locked || !spec}
        label={t('devices.lianli.lightingSpeed')}
        value={draft.speed}
        min={0}
        max={4}
        step={1}
        formatValue={v => t(`devices.nzxt-kraken.speed.${SPEED_KEYS[Math.round(v)] ?? 'normal'}`)}
        ariaLabel={t('devices.lianli.lightingSpeedAria')}
        onChange={(v: number) => { setDraft({ ...draft, speed: Math.round(v) }); }}
        onCommit={(v: number) => { apply({ ...draft, speed: Math.round(v) }); }}
      />

      <SettingSlider
        editable
        trackFill
        disabled={locked || !spec}
        label={t('devices.lianli.lightingBrightness')}
        value={draft.brightness}
        min={0}
        max={4}
        step={1}
        ariaLabel={t('devices.lianli.lightingBrightnessAria')}
        onChange={(v: number) => { setDraft({ ...draft, brightness: Math.round(v) }); }}
        onCommit={(v: number) => { apply({ ...draft, brightness: Math.round(v) }); }}
      />

      {spec && spec.colors > 0 && !locked && (
        <>
          {spec.colors > 1 && (
            <ColorSlots
              ariaLabel={t('devices.lianli.colorN', { n: activeIndex + 1 })}
              colors={draft.colors}
              activeIndex={activeIndex}
              onSelect={setActive}
              slotLabel={i => t('devices.lianli.colorN', { n: i + 1 })}
            />
          )}
          <div className={lianli.colorBlock} data-settings-aside="true">
            <HsvPicker
              value={draft.colors[activeIndex] ?? DEFAULT_COLOR}
              onPreview={(hex: string) => { setColor(hex, false); }}
              onCommit={(hex: string) => { setColor(hex, true); }}
            />
          </div>
        </>
      )}

      {failed && (
        <p className={lianli.customNote} data-settings-aside="true">
          {t('devices.galahad2Ring.failed')}
        </p>
      )}

      {nexusDriven && (
        <>
          <p className={lianli.customNote} data-settings-aside="true">
            {t('devices.galahad2Ring.overridden')}
          </p>
          {onSectionNavigate && (
            <Button
              size="sm"
              tone="neutral"
              icon={<Lightbulb size={14} />}
              onClick={() => onSectionNavigate('lighting')}
            >
              {t('smartLights.colorOnLightingPage')}
            </Button>
          )}
        </>
      )}
    </SettingsSection>
  );
}
