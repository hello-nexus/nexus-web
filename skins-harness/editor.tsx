import { useEffect, useState } from 'react';
import { mount, readView } from './boot';
import { SkinSamplePanel } from './SkinSamplePanel';
import { useSkinState } from './useSkinState';
import { SettingsSection } from '../src/components/common/SettingsSection/SettingsSection';
import { SettingRow, SettingSelect } from '../src/components/common/SettingRow/SettingRow';
import { ChipGroup } from '../src/components/common/ChipGroup/ChipGroup';
import { ColorPickerWithPresets } from '../src/components/common/ColorPickerWithPresets/ColorPickerWithPresets';
import { PRESET_ACCENTS } from '../src/lib/settings';
import { PANEL_FONTS } from '../src/panel/theme/panelFont';
import { PANEL_SKINS, skinDef, skinFontLabel } from '../src/panel/skins/skins';
import styles from '../src/panel/editor/PanelThemeSettings.module.scss';

// A faithful copy of the Theme / Text / Accent sections of PanelThemeSettings
// (same shared components and styles), with the Skin row at the top and the
// lock states wired. The real component needs the background-effect
// controllers and device hooks, which the harness does not provide.
function Editor() {
  const api = useSkinState();
  const { state, eff, setSkin, setVariant, setMode, setFont, setAccent } = api;
  const def = skinDef(eff.skin);
  const [view] = useState(readView);
  useEffect(() => {
    const q = new URLSearchParams({ skin: state.skin ?? '', variant: state.variant ?? '', theme: state.ownMode, scene: view.scene });
    history.replaceState(null, '', `?${q.toString()}`);
  }, [state, view]);
  const fontOptions = [
    ...(eff.font === 'pixel' ? [{ value: 'pixel', label: skinFontLabel('pixel') }] : []),
    ...PANEL_FONTS.map(f => ({ value: f.id as string, label: f.family })),
  ];
  return (
    <div className="editorPage" data-harness-editor>
      <div className="editorCol">
        <SettingsSection title="Theme" boxClassName={styles.themeBox}>
          <div className="stack"><div className="stackLabel">Skin</div>
            <ChipGroup
              wrap
              ariaLabel="Skin"
              activeKey={state.skin ?? 'none'}
              onChange={k => setSkin(k === 'none' ? null : k as never)}
              options={[{ key: 'none', label: 'None' }, ...PANEL_SKINS.map(s => ({ key: s.id, label: s.label }))]}
            />
          </div>
          {def && def.variants.length > 0 && (
            <div className="stack"><div className="stackLabel">Variant</div>
              <ChipGroup
                wrap
                ariaLabel="Variant"
                activeKey={state.variant ?? def.variants[0].id}
                onChange={setVariant}
                options={def.variants.map(v => ({ key: v.id, label: v.label }))}
              />
            </div>
          )}
          <SettingRow label="Mode" description={eff.modeLocked ? `Fixed by the ${def?.label} skin` : undefined} disabled={eff.modeLocked}>
            <ChipGroup
              ariaLabel="Mode"
              activeKey={eff.mode}
              onChange={k => setMode(k as 'dark' | 'light')}
              options={[{ key: 'dark', label: 'Dark', disabled: eff.modeLocked }, { key: 'light', label: 'Light', disabled: eff.modeLocked }]}
            />
          </SettingRow>
        </SettingsSection>
        <SettingsSection title="Text" boxClassName={styles.themeBox}>
          <SettingSelect
            label="Font"
            value={eff.font ?? 'lexend'}
            options={fontOptions}
            onChange={v => setFont(v as never)}
            disabled={eff.fontLocked}
            description={eff.fontLocked ? `Fixed by the ${def?.label} skin` : undefined}
          />
        </SettingsSection>
        <SettingsSection title="Accent Color" boxClassName={styles.themeBox}>
          <ColorPickerWithPresets
            value={eff.accent}
            presets={PRESET_ACCENTS}
            fallback={eff.accent}
            onPreview={setAccent}
            onCommit={setAccent}
            allowCustom
            disabled={eff.accentLocked}
          />
          {eff.accentLocked && <div className="lockNote">{def?.variants.length ? 'Fixed by the skin. Use Variant.' : `Fixed by the ${def?.label} skin`}</div>}
        </SettingsSection>
      </div>
      <div className="editorPanel">
        <SkinSamplePanel skin={eff.skin} variant={eff.variant} mode={eff.mode} font={eff.font} accent={eff.accent} scene={view.scene} overlay zoom={1.5} />
      </div>
    </div>
  );
}
mount(<Editor />);
