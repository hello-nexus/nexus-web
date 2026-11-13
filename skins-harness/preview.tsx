import { useEffect, useState } from 'react';
import { mount, readState, writeState, PANEL_SKINS, type HarnessState } from './boot';
import { SkinSamplePanel } from './SkinSamplePanel';
import { SCENES } from './scenes';

function Btn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick}>{children}</button>;
}

function Preview() {
  const [s, setS] = useState<HarnessState>(readState);
  useEffect(() => writeState(s), [s]);
  const set = (p: Partial<HarnessState>) => setS(prev => ({ ...prev, ...p }));
  return (
    <>
      <div className="bar" data-harness-bar>
        <div className="grp"><b>Skin</b>
          <Btn on={s.skin === null} onClick={() => set({ skin: null })}>None</Btn>
          {PANEL_SKINS.map(k => <Btn key={k.id} on={s.skin === k.id} onClick={() => set({ skin: k.id })}>{k.label}</Btn>)}
        </div>
        <div className="grp"><b>Theme</b>
          <Btn on={s.theme === 'dark'} onClick={() => set({ theme: 'dark' })}>Dark</Btn>
          <Btn on={s.theme === 'light'} onClick={() => set({ theme: 'light' })}>Light</Btn>
        </div>
        <div className="grp"><b>Overlay</b>
          <Btn on={s.overlay} onClick={() => set({ overlay: !s.overlay })}>{s.overlay ? 'On' : 'Off'}</Btn>
        </div>
        <div className="grp"><b>Filter</b>
          {(['off', 'on', 'bloom'] as const).map(m => <Btn key={m} on={s.filter === m} onClick={() => set({ filter: m })}>{m}</Btn>)}
        </div>
        <div className="grp"><b>Scene</b>
          {SCENES.map(sc => <Btn key={sc.id} on={s.scene === sc.id} onClick={() => set({ scene: sc.id })}>{sc.label}</Btn>)}
        </div>
        <div className="grp"><b>Zoom</b>
          {[1, 1.5, 2].map(z => <Btn key={z} on={s.zoom === z} onClick={() => set({ zoom: z })}>{z}x</Btn>)}
        </div>
      </div>
      <div className="stage" data-harness-stage>
        <SkinSamplePanel {...s} />
      </div>
    </>
  );
}

mount(<Preview />);
