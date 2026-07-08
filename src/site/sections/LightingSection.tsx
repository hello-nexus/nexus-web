import { useMemo, useRef, useState, type RefObject } from 'react';
import { Lightbulb } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { PaletteRing } from '../../components/common/PaletteRing/PaletteRing';
import { Slider } from '../../components/common/Slider/Slider';
import { defaultStateFor, defaultParamsFor, EFFECTS, type EffectState, type EffectParamDef } from '../../types/lighting';
import { buildDefaultTemplates } from '../../types/lightingTemplates';
import { useInViewport } from '../hooks/useInViewport';
import { useAutoRotateHue } from '../hooks/useAutoRotateHue';
import { useFakeAudio } from '../hooks/useFakeAudio';
import type { AudioSnapshot } from '../../hooks/useAudioState';
import { DemoFrame } from '../components/DemoFrame';
import { PlasmaCanvas } from '../components/PlasmaCanvas';
import styles from '../site.module.scss';

// Effects the demo bundles (site/main.tsx primes each composed shader), each
// with its three sliders ('speed'/'saturation' tokens or uniform names) -
// varied so the demo surfaces different parameter kinds. Beat Builder rides
// the synthetic audio feed (no speed: the beat drives it) with the three
// highest-impact controls.
const DEMO_EFFECTS: ReadonlyArray<{ key: string; controls: readonly string[] }> = [
  { key: 'plasma', controls: ['speed', 'u_warp', 'saturation'] },
  { key: 'fire', controls: ['speed', 'u_turbulence', 'saturation'] },
  { key: 'spiral', controls: ['speed', 'u_arms', 'u_tightness'] },
  { key: 'neongrid', controls: ['speed', 'u_density', 'u_glow'] },
  { key: 'beatbuilder', controls: ['u_barCount', 'u_centerGain', 'u_flash'] },
];

// Demo starting look: a visible arc window (not the full-wrap rainbow) so the
// auto-rotation reads on the wheel, starting in the blue family.
const START_HUE = 0.62;
const START_COLORIZE = 0.55;

// Each effect's baseline is its first preset slot (the app's default look).
function slotZero(key: string): EffectState {
  const slot = buildDefaultTemplates(key).slots[0];
  return { ...defaultStateFor(key), ...slot, params: { ...defaultParamsFor(key), ...slot?.params } };
}

// Static per-thumbnail shader state: the effect's first-slot look, slowed so
// the strip reads as a set of previews rather than five competing animations.
function thumbState(key: string): EffectState {
  const s = slotZero(key);
  s.speed = Math.min(s.speed, 25);
  return s;
}

function EffectThumb({ effectKey, active, selected, onSelect, label, audioRef }: {
  effectKey: string;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
  label: string;
  audioRef: RefObject<AudioSnapshot | null>;
}) {
  // Lazy seed: a bare useRef(init) would rebuild the template state on every
  // parent render (the auto-rotating hue re-renders the section constantly).
  const [thumb] = useState(() => thumbState(effectKey));
  const stateRef = useRef(thumb);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      className={selected ? `${styles.effectThumb} ${styles.effectThumbActive}` : styles.effectThumb}
      onClick={onSelect}
    >
      <PlasmaCanvas
        effect={effectKey}
        stateRef={stateRef}
        active={active}
        audioRef={audioRef}
        maxDevicePixelRatio={1}
        className={styles.effectThumbCanvas}
      />
    </button>
  );
}

export function LightingSection() {
  const { t } = useTranslation();
  const [ref, inView] = useInViewport<HTMLElement>();

  const [effect, setEffect] = useState<string>('plasma');
  const controls = DEMO_EFFECTS.find(e => e.key === effect)?.controls ?? [];
  const def = useMemo(() => EFFECTS.find(e => e.key === effect), [effect]);
  const base = useMemo(() => slotZero(effect), [effect]);
  const [speed, setSpeed] = useState(base.speed);
  const [saturation, setSaturation] = useState(base.saturation);
  const [params, setParams] = useState<Record<string, number>>(base.params);
  const { hue, colorize, onUserChange } = useAutoRotateHue(START_HUE, START_COLORIZE, inView);
  const audioRef = useFakeAudio(inView);

  // Latest-value ref for the render loop; the shader reads it every frame.
  const stateRef = useRef<EffectState>(base);
  stateRef.current = { ...base, speed, saturation, hue, colorize, params };

  const pickEffect = (key: string) => {
    const next = slotZero(key);
    setEffect(key);
    setSpeed(next.speed);
    setSaturation(next.saturation);
    setParams(next.params);
  };

  const paramDef = (name: string): EffectParamDef | undefined =>
    def?.params.find(p => p.name === name);

  return (
    <section ref={ref} className={`${styles.section} ${styles.sectionFlipped}`}>
      <div className={styles.sectionText}>
        <p className={styles.eyebrow}>
          <Lightbulb size={15} aria-hidden />
          <span>{t('welcome.capabilities.lighting')}</span>
        </p>
        <h2>{t('site.lighting.title')}</h2>
        <p className={styles.lead}>{t('site.lighting.lead')}</p>
        <ul className={styles.points}>
          <li>{t('site.lighting.point1')}</li>
          <li>{t('site.lighting.point2')}</li>
          <li>{t('site.lighting.point3')}</li>
        </ul>
        <p className={styles.hint}>{t('site.lighting.hint')}</p>
      </div>
      <DemoFrame className={styles.sectionDemo}>
        <div className={styles.lightingDemo}>
          <PlasmaCanvas
            effect={effect}
            stateRef={stateRef}
            active={inView}
            audioRef={audioRef}
            className={styles.lightingCanvas}
          />
          <div className={styles.effectThumbs}>
            {DEMO_EFFECTS.map(({ key }) => {
              const d = EFFECTS.find(e => e.key === key);
              if (!d) return null;
              return (
                <EffectThumb
                  key={key}
                  effectKey={key}
                  active={inView}
                  selected={key === effect}
                  onSelect={() => pickEffect(key)}
                  label={t(d.labelKey)}
                  audioRef={audioRef}
                />
              );
            })}
          </div>
          <div className={styles.lightingControls}>
            <div className={styles.lightingRing}>
              <PaletteRing
                hue={hue}
                colorize={colorize}
                onChange={(h, c) => onUserChange(h, c)}
                onCommit={() => {}}
              />
            </div>
            <div className={styles.lightingSliders}>
              {controls.map(name => {
                if (name === 'speed') {
                  return (
                    <Slider
                      key={`${effect}-speed`}
                      label={t('lighting.controls.speed')}
                      value={speed}
                      min={-100}
                      max={100}
                      // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
                      orientation="stacked"
                      editable
                      trackFill
                      zeroMarker
                      onChange={setSpeed}
                    />
                  );
                }
                if (name === 'saturation') {
                  return (
                    <Slider
                      key={`${effect}-saturation`}
                      label={t('lighting.controls.saturation')}
                      value={saturation}
                      min={0}
                      max={2}
                      step={0.05}
                      orientation="stacked"
                      editable
                      trackFill
                      formatValue={v => v.toFixed(2)}
                      onChange={setSaturation}
                    />
                  );
                }
                const p = paramDef(name);
                if (!p) return null;
                return (
                  <Slider
                    key={`${effect}-${p.name}`}
                    label={p.labelKey ? t(p.labelKey) : p.label}
                    value={params[p.name] ?? p.defaultValue}
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    orientation="stacked"
                    editable
                    trackFill
                    formatValue={v => (p.step >= 1 ? String(Math.round(v)) : v.toFixed(2))}
                    onChange={v => setParams(prev => ({ ...prev, [p.name]: v }))}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </DemoFrame>
    </section>
  );
}
