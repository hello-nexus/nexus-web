import { useEffect, useState } from 'react';
import { mount, readView } from './boot';
import { SkinSamplePanel } from './SkinSamplePanel';
import { ControlsBar, type View } from './ControlsBar';
import { useSkinState } from './useSkinState';

function Preview() {
  const api = useSkinState();
  const [view, setV] = useState<View>(readView);
  const { state, eff } = api;
  useEffect(() => {
    const q = new URLSearchParams({ skin: state.skin ?? '', variant: state.variant ?? '', theme: state.ownMode, scene: view.scene, overlay: view.overlay ? '1' : '0', zoom: String(view.zoom) });
    history.replaceState(null, '', `?${q.toString()}`);
  }, [state, view]);
  return (
    <>
      <ControlsBar api={api} view={view} setView={p => setV(v => ({ ...v, ...p }))} />
      <div className="stage" data-harness-stage>
        <SkinSamplePanel skin={eff.skin} mode={eff.mode} font={eff.font} accent={eff.accent} scene={view.scene} overlay={view.overlay} zoom={view.zoom} />
      </div>
    </>
  );
}
mount(<Preview />);
