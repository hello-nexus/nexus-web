import type { ReactNode } from 'react';
import { PANEL_FONTS, type PanelFontId } from '../src/panel/theme/panelFont';
import { PANEL_SKINS, skinDef, skinFontLabel } from '../src/panel/skins/skins';
import { SCENES } from './scenes';
import { variantsOf, type EffectiveSkin, type useSkinState } from './useSkinState';

export function Btn({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}>{children}</button>;
}

const ACCENTS = ['#2fd8ff', '#ff2bd6', '#41a6f6', '#38b764', '#ffcd75', '#ef7d57', '#a78bfa'];

type Api = ReturnType<typeof useSkinState>;
export interface View { scene: string; overlay: boolean; zoom: number }

export function ControlsBar({ api, view, setView, full = true }: { api: Api; view: View; setView: (p: Partial<View>) => void; full?: boolean }) {
  const { state, eff, setSkin, setVariant, setMode, setFont, setAccent } = api;
  const def = skinDef(eff.skin);
  const e: EffectiveSkin = eff;
  return (
    <div className="bar" data-harness-bar>
      <div className="grp"><b>Skin</b>
        <Btn on={state.skin === null} onClick={() => setSkin(null)}>None</Btn>
        {PANEL_SKINS.map(k => <Btn key={k.id} on={state.skin === k.id} onClick={() => setSkin(k.id)}>{k.label}</Btn>)}
      </div>
      {def && variantsOf(def).length > 0 && (
        <div className="grp"><b>Variant</b>
          {variantsOf(def).map(v => <Btn key={v.id} on={state.variant === v.id} onClick={() => setVariant(v.id)}>{v.label}</Btn>)}
        </div>
      )}
      <div className="grp"><b>Mode{e.modeLocked ? ' (locked)' : ''}</b>
        <Btn on={e.mode === 'dark'} disabled={e.modeLocked} onClick={() => setMode('dark')}>Dark</Btn>
        <Btn on={e.mode === 'light'} disabled={e.modeLocked} onClick={() => setMode('light')}>Light</Btn>
      </div>
      <div className="grp"><b>Font{e.fontLocked ? ' (locked)' : ''}</b>
        <select disabled={e.fontLocked} value={e.font ?? 'lexend'} onChange={ev => setFont(ev.target.value as PanelFontId)}>
          {e.font === 'pixel' && <option value="pixel">{skinFontLabel('pixel')}</option>}
          {PANEL_FONTS.map(f => <option key={f.id} value={f.id}>{f.family}</option>)}
        </select>
      </div>
      <div className="grp"><b>Accent{e.accentLocked ? ' (locked)' : ''}</b>
        {ACCENTS.map(c => (
          <button key={c} type="button" disabled={e.accentLocked} aria-pressed={e.accent.toLowerCase() === c} title={c}
            style={{ width: 18, height: 18, padding: 0, background: c, opacity: e.accentLocked ? 0.35 : 1 }} onClick={() => setAccent(c)} />
        ))}
        <input type="color" disabled={e.accentLocked} value={e.accent} onChange={ev => setAccent(ev.target.value)} />
      </div>
      {full && <>
        <div className="grp"><b>Overlay</b><Btn on={view.overlay} onClick={() => setView({ overlay: !view.overlay })}>{view.overlay ? 'On' : 'Off'}</Btn></div>
        <div className="grp"><b>Scene</b>
          {SCENES.map(sc => <Btn key={sc.id} on={view.scene === sc.id} onClick={() => setView({ scene: sc.id })}>{sc.label}</Btn>)}
        </div>
        <div className="grp"><b>Zoom</b>
          {[1, 1.5, 2].map(z => <Btn key={z} on={view.zoom === z} onClick={() => setView({ zoom: z })}>{z}x</Btn>)}
        </div>
      </>}
    </div>
  );
}
