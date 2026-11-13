import { useState } from 'react';
import { mount, readView } from './boot';
import { SkinSamplePanel } from './SkinSamplePanel';
import { Btn, type View } from './ControlsBar';
import { PANEL_SKINS } from '../src/panel/skins/skins';
import { effective, readSkinState, variantsOf } from './useSkinState';
import { SCENES } from './scenes';

function Gallery() {
  const [view, setV] = useState<View>(readView);
  const [mode, setMode] = useState<'dark' | 'light'>(readSkinState().ownMode);
  const items = [{ id: null, label: 'Stock', variant: null as string | null }, ...PANEL_SKINS.flatMap(k =>
    (variantsOf(k).length ? variantsOf(k).map(v => ({ id: k.id as string | null, label: `${k.label} ${v.label}`, variant: v.id as string | null })) : [{ id: k.id as string | null, label: k.label, variant: null as string | null }]))];
  return (
    <>
      <div className="bar">
        <div className="grp"><b>Mode</b><Btn on={mode === 'dark'} onClick={() => setMode('dark')}>Dark</Btn><Btn on={mode === 'light'} onClick={() => setMode('light')}>Light</Btn></div>
        <div className="grp"><b>Overlay</b><Btn on={view.overlay} onClick={() => setV(v => ({ ...v, overlay: !v.overlay }))}>{view.overlay ? 'On' : 'Off'}</Btn></div>
        <div className="grp"><b>Scene</b>{SCENES.map(sc => <Btn key={sc.id} on={view.scene === sc.id} onClick={() => setV(v => ({ ...v, scene: sc.id }))}>{sc.label}</Btn>)}</div>
      </div>
      <div className="gallery" data-harness-gallery>
        {items.map(it => {
          const st = { ...readSkinState(), skin: it.id as never, variant: it.variant, ownMode: mode };
          const e = effective(st);
          return (
            <figure key={`${it.id}-${it.variant}`}>
              <SkinSamplePanel skin={e.skin} variant={e.variant} mode={e.mode} font={e.font} accent={e.accent} scene={view.scene} overlay={view.overlay} />
              <figcaption>{it.label}{e.skin && e.modeLocked ? ` (${e.mode} only)` : ''}</figcaption>
            </figure>
          );
        })}
      </div>
    </>
  );
}
mount(<Gallery />);
