import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  getKrakenFirmwareLighting,
  setKrakenFirmwareLighting,
  type KrakenEffect,
  type KrakenFirmwareChannel,
} from '../../../api/nzxt-kraken';
import { useTranslation } from '../../../lib/i18n';
import lianli from './LianLiDevicePage.module.scss';
import styles from './KrakenFirmwareLighting.module.scss';

const SPEED_KEYS = ['slowest', 'slower', 'normal', 'faster', 'fastest'];

interface Draft {
  effect: string;
  speed: number;
  forward: boolean;
  colors: string[];
  /** Which swatch the picker is editing. */
  active: number;
}

function draftOf(channel: KrakenFirmwareChannel): Draft {
  return {
    effect: channel.effect,
    speed: channel.speed,
    forward: channel.forward,
    colors: channel.colors.length > 0 ? [...channel.colors] : ['#ff0000'],
    active: 0,
  };
}

/**
 * The animations the cooler plays on its own, one block per RGB channel. Mirrors the
 * Q-series lighting-firmware section: the cooler keeps running the last write whenever
 * Nexus is not driving that channel, and there is no way to read the current one back,
 * so the values shown are the last write Nexus made.
 */
export function KrakenFirmwareLightingSection() {
  const { t } = useTranslation();
  const [effects, setEffects] = useState<KrakenEffect[]>([]);
  const [channels, setChannels] = useState<KrakenFirmwareChannel[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      const data = await getKrakenFirmwareLighting();
      if (!aliveRef.current || data === null) return;
      setEffects(data.effects);
      setChannels(data.channels);
      const next: Record<string, Draft> = {};
      for (const c of data.channels) next[c.id] = draftOf(c);
      setDrafts(next);
    })();
    return () => { aliveRef.current = false; };
  }, []);

  const patch = useCallback((id: string, next: Partial<Draft>) => {
    setDrafts(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], ...next } } : prev));
  }, []);

  const save = useCallback(async (channel: KrakenFirmwareChannel, draft: Draft, spec: KrakenEffect) => {
    setSaving(channel.id);
    setFailed(null);
    try {
      const ok = await setKrakenFirmwareLighting({
        channel: channel.id,
        effect: draft.effect,
        speed: draft.speed,
        forward: draft.forward,
        colors: draft.colors.slice(0, spec.maxColors),
      });
      if (aliveRef.current && ok === null) setFailed(channel.id);
    } finally {
      if (aliveRef.current) setSaving(null);
    }
  }, []);

  if (channels.length === 0) return null;

  return (
    <SettingsSection
      title={t('devices.q60.lightingFirmwareSection')}
      boxClassName={lianli.sectionBox}
    >
      <p className={lianli.customNote} data-settings-aside="true">
        {t('devices.q60.lightingFirmwareHelp')}
      </p>
      {/* Bench-proven on an Elite V2: while the host pushes LCD frames the cooler freezes
          whatever animation is set, and resumes it once the screen stops being streamed. */}
      <p className={lianli.customNote} data-settings-aside="true">
        {t('devices.nzxt-kraken.lightingFirmwareScreenNote')}
      </p>

      {channels.map(channel => {
        const draft = drafts[channel.id];
        if (!draft) return null;
        const spec = effects.find(e => e.id === draft.effect) ?? effects[0];
        if (!spec) return null;
        const shown = draft.colors.slice(0, Math.max(spec.maxColors, 0));
        const active = Math.min(draft.active, Math.max(shown.length - 1, 0));

        return (
          <div key={channel.id} className={styles.channelBlock}>
            <span className={styles.channelTitle}>{channel.accessoryName}</span>

            <SettingSelect
              label={t('devices.fwAnimation.effect')}
              value={draft.effect}
              onChange={v => {
                const next = effects.find(e => e.id === v);
                if (!next) return;
                // Keep only as many colours as the new animation reads, and top up to its floor.
                const colors = draft.colors.slice(0, Math.max(next.maxColors, 0));
                while (colors.length < next.minColors) colors.push('#ff0000');
                patch(channel.id, { effect: v, colors, active: 0 });
              }}
              options={effects.map(e => ({ value: e.id, label: t(`devices.krakenEffect.${e.id}`) }))}
            />

            <SettingSlider
              editable
              trackFill
              label={t('devices.lianli.lightingSpeed')}
              value={draft.speed}
              min={0}
              max={4}
              step={1}
              formatValue={v => t(`devices.nzxt-kraken.speed.${SPEED_KEYS[Math.round(v)] ?? 'normal'}`)}
              ariaLabel={t('devices.lianli.lightingSpeedAria')}
              onChange={(v: number) => { patch(channel.id, { speed: Math.round(v) }); }}
            />

            {spec.directional && (
              <SettingSelect
                label={t('devices.lianli.lightingDirection')}
                value={draft.forward ? 'forward' : 'backward'}
                onChange={v => { patch(channel.id, { forward: v === 'forward' }); }}
                options={[
                  { value: 'forward', label: t('devices.nzxt-kraken.directionForward') },
                  { value: 'backward', label: t('devices.nzxt-kraken.directionBackward') },
                ]}
              />
            )}

            {spec.maxColors > 0 && (
              <>
                <div className={styles.swatchRow}>
                  {shown.map((hex, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`${styles.swatch} ${i === active ? styles.swatchActive : ''}`}
                      style={{ background: hex }}
                      aria-label={t('devices.nzxt-kraken.colorSlot', { n: i + 1 })}
                      onClick={() => { patch(channel.id, { active: i }); }}
                    />
                  ))}
                  {shown.length < spec.maxColors && (
                    <Button
                      size="sm"
                      tone="neutral"
                      icon={<Plus size={14} />}
                      onClick={() => {
                        patch(channel.id, { colors: [...draft.colors, '#ff0000'], active: shown.length });
                      }}
                    >
                      {t('devices.lianli.addColor')}
                    </Button>
                  )}
                  {shown.length > spec.minColors && (
                    <Button
                      size="sm"
                      tone="neutral"
                      icon={<X size={14} />}
                      onClick={() => {
                        const colors = draft.colors.filter((_, i) => i !== active);
                        patch(channel.id, { colors, active: 0 });
                      }}
                    >
                      {t('devices.lianli.removeColor')}
                    </Button>
                  )}
                </div>
                <div className={lianli.colorBlock} data-settings-aside="true">
                  <HsvPicker
                    value={shown[active] ?? '#ff0000'}
                    onPreview={(next: string) => {
                      const colors = [...draft.colors];
                      colors[active] = next;
                      patch(channel.id, { colors });
                    }}
                    onCommit={(next: string) => {
                      const colors = [...draft.colors];
                      colors[active] = next;
                      patch(channel.id, { colors });
                    }}
                  />
                </div>
              </>
            )}

            {failed === channel.id && (
              <p className={lianli.customNote} data-settings-aside="true">
                {t('devices.nzxt-kraken.lightingFirmwareFailed')}
              </p>
            )}

            {channel.nexusDriven && (
              <p className={lianli.customNote} data-settings-aside="true">
                {t('devices.nzxt-kraken.lightingFirmwareOverridden')}
              </p>
            )}

            <div className={styles.saveRow} data-settings-aside="true">
              <Button
                type="button"
                size="sm"
                tone="accent"
                disabled={saving !== null}
                onClick={() => { void save(channel, draft, spec); }}
              >
                {saving === channel.id ? t('devices.saving') : t('devices.q60.saveLighting')}
              </Button>
            </div>
          </div>
        );
      })}
    </SettingsSection>
  );
}
