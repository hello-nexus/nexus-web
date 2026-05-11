import { useState } from 'react';
import { Sun, Volume2 } from 'lucide-react';
import { PanelMixerSlider } from '../panel/widgets/common/PanelMixerSlider';
import styles from './StorybookModal.module.scss';

export function PanelMixerSliderPreview() {
  const [brightness, setBrightness] = useState(72);
  const [volume, setVolume] = useState(48);
  const [muted, setMuted] = useState(false);

  return (
    <div className={styles.previewPanelMixer}>
      <PanelMixerSlider
        topLabel="DISPLAY 1"
        value={brightness}
        min={0}
        max={100}
        valueLabel={`${brightness}`}
        icon={<Sun strokeWidth={1.7} />}
        ariaLabel="Brightness display 1"
        onChange={setBrightness}
        onCommit={setBrightness}
        className={styles.previewMixerControl}
      />
      <PanelMixerSlider
        topLabel="SPOTIFY"
        value={muted ? 0 : volume}
        min={0}
        max={100}
        valueLabel={`${muted ? 0 : volume}`}
        icon={<Volume2 strokeWidth={1.8} />}
        iconButton={{
          ariaLabel: muted ? 'Unmute' : 'Mute',
          ariaPressed: muted,
          active: muted,
          onClick: () => setMuted(v => !v),
        }}
        ariaLabel="Media volume"
        onChange={setVolume}
        onCommit={setVolume}
        className={styles.previewMixerControl}
      />
    </div>
  );
}
