import { Fragment, useCallback, useEffect, useState } from 'react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingSelect, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { ColorPickerWithPresets } from '../../common/ColorPickerWithPresets/ColorPickerWithPresets';
import {
  getLianLiFlexLcd,
  setLianLiFlexLcd,
  type LianLiFlexLcd,
  type LianLiFlexLcdChain,
  type LianLiFlexLcdPatch,
} from '../../../api/lianli-wireless';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiWirelessDevicePage.module.scss';

const TEXT_COLOR_PRESETS = ['#FFFFFF', '#FF0000', '#FF8000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF'] as const;

type SourceKind = 'temp' | 'clock' | 'usage' | 'ramGB';
interface SourceSpec { index: number; kind: SourceKind; target: 'CPU' | 'GPU' | 'RAM'; unit?: string }

// The readings the service fills, at their positions in L-Connect's 25 data sources.
const SOURCES: SourceSpec[] = [
  { index: 0, kind: 'temp', target: 'CPU', unit: '°C' },
  { index: 1, kind: 'temp', target: 'CPU', unit: '°F' },
  { index: 2, kind: 'clock', target: 'CPU', unit: 'MHz' },
  { index: 3, kind: 'clock', target: 'CPU', unit: 'GHz' },
  { index: 4, kind: 'usage', target: 'CPU' },
  { index: 8, kind: 'temp', target: 'GPU', unit: '°C' },
  { index: 9, kind: 'temp', target: 'GPU', unit: '°F' },
  { index: 10, kind: 'clock', target: 'GPU', unit: 'MHz' },
  { index: 11, kind: 'clock', target: 'GPU', unit: 'GHz' },
  { index: 12, kind: 'usage', target: 'GPU' },
  { index: 19, kind: 'usage', target: 'RAM' },
  { index: 20, kind: 'ramGB', target: 'RAM' },
];

type ColorRole = 'graph' | 'graph2' | 'label' | 'value' | 'unit';
const ROLES: Record<number, ColorRole[]> = {
  5: ['graph', 'graph2', 'label', 'value', 'unit'],
  4: ['graph', 'label', 'value', 'unit'],
  3: ['label', 'value', 'unit'],
};

/** Built-in themes of the TL / SL-INF LCD Flex fans on this PC's radio: the fan's own screen draws them from readings sent over the air. */
export function LianLiFlexLcdThemesSection({ reloadKey = '' }: {
  /** Changes when a chain is bound, unbound or changes its fan count, so the list follows the radio. */
  reloadKey?: string;
}) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [data, setData] = useState<LianLiFlexLcd | null>(null);

  const reload = useCallback(async () => {
    const next = await getLianLiFlexLcd();
    if (next) setData(next);
  }, []);

  useEffect(() => {
    let alive = true;
    void getLianLiFlexLcd().then(next => { if (alive && next) setData(next); });
    return () => { alive = false; };
  }, [reloadKey]);

  // Optimistic: a refused save reloads what the service holds.
  const commit = useCallback(async (mac: string, patch: LianLiFlexLcdPatch, local: (chain: LianLiFlexLcdChain) => LianLiFlexLcdChain) => {
    setData(prev => (prev ? { ...prev, chains: prev.chains.map(c => (c.mac === mac ? local(c) : c)) } : prev));
    if (!await setLianLiFlexLcd(mac, patch)) await reload();
  }, [reload]);

  if (!data || data.chains.length === 0) return null;

  const sourceLabel = (spec: SourceSpec) => {
    if (spec.kind === 'ramGB') return t('devices.lianli-wireless.flexLcd.src.ramGB');
    const key = `devices.lianli-wireless.flexLcd.src.${spec.kind}` as Parameters<typeof t>[0];
    return t(key, { target: spec.target, unit: spec.unit ?? '' });
  };
  const roleLabel = (role: ColorRole) => t(({
    graph: 'devices.lianli-wireless.flexLcd.graphColor',
    graph2: 'devices.lianli-wireless.flexLcd.graphColor2',
    label: 'devices.lianli-wireless.aioScreen.labelColor',
    value: 'devices.lianli-wireless.aioScreen.valueColor',
    unit: 'devices.lianli-wireless.aioScreen.unitColor',
  } as const)[role]);

  return (<>
    {data.chains.map(chain => {
      const typeLabel = t(chain.family === 'slInfFlex' ? 'devices.lianli-wireless.fanTypeSlInfFlex' : 'devices.lianli-wireless.fanTypeTlFlex');
      const multiple = data.chains.filter(c => c.family === chain.family).length > 1;
      return (<Fragment key={chain.mac}>
        {chain.upDownSwap != null && (
          <SettingsSection
            title={multiple ? `${typeLabel} ${chain.mac.slice(-4)}` : typeLabel}
            boxClassName={styles.sectionBox}
          >
            <SettingToggle
              label={t('devices.lianli-flex.upDownSwap')}
              description={t('devices.lianli-flex.upDownSwapHint')}
              checked={chain.upDownSwap}
              onChange={on => { void commit(chain.mac, { upDownSwap: on }, c => ({ ...c, upDownSwap: on })); }}
            />
          </SettingsSection>
        )}
        <SettingsSection
          title={t('devices.lianli-wireless.flexLcd.title', { type: multiple ? `${typeLabel} ${chain.mac.slice(-4)}` : typeLabel })}
          boxClassName={styles.sectionBox}
        >
          <SettingToggle
            label={t('devices.lianli-wireless.flexLcd.enable')}
            description={t('devices.lianli-wireless.flexLcd.enableHint')}
            checked={chain.enabled}
            onChange={() => { void commit(chain.mac, { enabled: !chain.enabled }, c => ({ ...c, enabled: !c.enabled })); }}
          />
          {chain.enabled && (<>
            <SettingSlider
              editable
              trackFill
              label={t('devices.lianli-wireless.aioScreen.brightness')}
              value={chain.brightness}
              min={5}
              max={100}
              step={5}
              formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
              // A typed value fires onChange and onCommit both, so only onCommit saves.
              onChange={(v: number) => setData(prev => (prev ? { ...prev, chains: prev.chains.map(c => (c.mac === chain.mac ? { ...c, brightness: v } : c)) } : prev))}
              onCommit={(v: number) => { void commit(chain.mac, { brightness: v }, c => ({ ...c, brightness: v })); }}
            />
            <SettingSelect
              label={t('devices.lianli-wireless.rotationLabel')}
              value={String(chain.rotation)}
              onChange={v => { void commit(chain.mac, { rotation: Number(v) }, c => ({ ...c, rotation: Number(v) })); }}
              options={[0, 1, 2, 3].map(i => ({ value: String(i), label: t('devices.lianli-wireless.rotationDegrees', { n: i * 90 }) }))}
            />
            {chain.fans.map((fan, index) => {
              const theme = data.themes[fan.theme];
              const roles = ROLES[theme?.colorCount ?? 0] ?? [];
              return (
                <div key={index}>
                  <SettingRow label={t('devices.lianli-wireless.fanN', { n: index + 1 })} />
                  <SettingSelect
                    label={t('devices.lianli-wireless.aioScreen.theme')}
                    value={String(fan.theme)}
                    onChange={v => {
                      const next = Number(v);
                      void commit(chain.mac, { fans: [{ index, theme: next }] }, c => ({
                        ...c, fans: c.fans.map((f, i) => (i === index ? { ...f, theme: next, colors: null } : f)),
                      }));
                    }}
                    options={data.themes.map(th => ({ value: String(th.index), label: t('devices.lianli-wireless.aioScreen.themeN', { n: th.index + 1 }) }))}
                  />
                  <SettingSelect
                    label={t('devices.lianli-wireless.flexLcd.source')}
                    value={String(fan.source)}
                    onChange={v => {
                      const next = Number(v);
                      void commit(chain.mac, { fans: [{ index, source: next }] }, c => ({
                        ...c, fans: c.fans.map((f, i) => (i === index ? { ...f, source: next } : f)),
                      }));
                    }}
                    options={[
                      // A source this page does not offer keeps its number instead of passing for another reading.
                      ...(SOURCES.some(s => s.index === fan.source) ? [] : [{ value: String(fan.source), label: `#${fan.source}` }]),
                      ...SOURCES.map(spec => ({ value: String(spec.index), label: sourceLabel(spec) })),
                    ]}
                  />
                  {roles.map((role, colorIndex) => {
                    const current = fan.colors?.[colorIndex] ?? theme?.defaults[colorIndex] ?? '#FFFFFF';
                    return (
                      <SettingRow key={`${fan.theme}-${role}`} label={roleLabel(role)} wrapControl stackOnNarrow>
                        <ColorPickerWithPresets
                          value={current}
                          presets={TEXT_COLOR_PRESETS}
                          allowCustom
                          pickerPortal
                          onCommit={hex => {
                            const colors = roles.map((_, i) => (i === colorIndex ? hex.toUpperCase() : (fan.colors?.[i] ?? theme?.defaults[i] ?? '#FFFFFF')));
                            void commit(chain.mac, { fans: [{ index, colors }] }, c => ({
                              ...c, fans: c.fans.map((f, i) => (i === index ? { ...f, colors } : f)),
                            }));
                          }}
                        />
                      </SettingRow>
                    );
                  })}
                </div>
              );
            })}
          </>)}
        </SettingsSection>
      </Fragment>);
    })}
  </>);
}
