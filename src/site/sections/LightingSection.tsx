import { useMemo, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { PaletteRing } from '../../components/common/PaletteRing/PaletteRing';
import { Slider } from '../../components/common/Slider/Slider';
import { defaultStateFor, defaultParamsFor, EFFECTS, type EffectState } from '../../types/lighting';
import { buildDefaultTemplates, MAX_COLORIZE } from '../../types/lightingTemplates';
import { useInViewport } from '../hooks/useInViewport';
import { useAutoRotateHue } from '../hooks/useAutoRotateHue';
import { DemoFrame } from '../components/DemoFrame';
import { PlasmaCanvas } from '../components/PlasmaCanvas';
import styles from '../site.module.scss';

// Effects the demo bundles (site/main.tsx primes each composed shader).
const DEMO_EFFECTS = ['plasma', 'fire', 'spiral', 'neongrid', 'terrace'] as const;

// Demo starting look: a visible arc window (not the full-wrap rainbow) so the
// auto-rotation reads on the wheel, starting in the blue family.
const START_HUE = 0.62;
const START_COLORIZE = 0.55;

// CSS swatch approximating a preset's palette: the hue window the shader
// samples (colorize narrows the sampled span; 0 = full spectrum).
function slotSwatch(slot: EffectState): string {
  const span = 360 * (1 - Math.min(MAX_COLORIZE, slot.colorize) / MAX_COLORIZE);
  const start = slot.hue * 360 - span / 2;
  const stops: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const h = ((start + (span * i) / 4) % 360 + 360) % 360;
    stops.push(`hsl(${Math.round(h)} 90% 55%)`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export function LightingSection() {
  const { t } = useTranslation();
  const [ref, inView] = useInViewport<HTMLElement>();

  const [effect, setEffect] = useState<string>('plasma');
  const def = useMemo(() => EFFECTS.find(e => e.key === effect), [effect]);
  const slots = useMemo(() => buildDefaultTemplates(effect).slots, [effect]);
  const base = useMemo(() => defaultStateFor(effect), [effect]);
  const [speed, setSpeed] = useState(base.speed);
  const [saturation, setSaturation] = useState(base.saturation);
  const [params, setParams] = useState<Record<string, number>>(() => defaultParamsFor(effect));
  const { hue, colorize, onUserChange } = useAutoRotateHue(START_HUE, START_COLORIZE, inView);

  // Latest-value ref for the render loop; the shader reads it every frame.
  const stateRef = useRef<EffectState>(base);
  stateRef.current = { ...base, speed, saturation, hue, colorize, params };

  const pickEffect = (key: string) => {
    setEffect(key);
    setParams(defaultParamsFor(key));
  };

  const applySlot = (slot: EffectState) => {
    setSpeed(slot.speed);
    setSaturation(slot.saturation);
    setParams({ ...defaultParamsFor(effect), ...slot.params });
    onUserChange(slot.hue, slot.colorize);
  };

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
            className={styles.lightingCanvas}
          />
          <div className={styles.effectTabs}>
            {DEMO_EFFECTS.map(key => {
              const d = EFFECTS.find(e => e.key === key);
              if (!d) return null;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={key === effect}
                  className={key === effect ? `${styles.effectTab} ${styles.effectTabActive}` : styles.effectTab}
                  onClick={() => pickEffect(key)}
                >
                  {t(d.labelKey)}
                </button>
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
            <div className={styles.lightingPresets}>
              {slots.map((slot, i) => (
                <button
                  key={`${effect}-${i}`}
                  type="button"
                  className={styles.presetChip}
                  style={{ background: slotSwatch(slot) }}
                  onClick={() => applySlot(slot)}
                  aria-label={t('site.lighting.preset', { n: i + 1 })}
                />
              ))}
            </div>
            <div className={styles.lightingSliders}>
              <Slider
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
              {(def?.params ?? []).slice(0, 1).map(p => (
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
              ))}
              <Slider
                label={t('lighting.controls.saturation')}
                value={saturation}
                min={0}
                max={2}
                step={0.05}
                // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
                orientation="stacked"
                editable
                trackFill
                formatValue={v => v.toFixed(2)}
                onChange={setSaturation}
              />
            </div>
          </div>
        </div>
      </DemoFrame>
    </section>
  );
}
