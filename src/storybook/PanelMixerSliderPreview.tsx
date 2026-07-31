import { useState } from 'react';
import { Sun, Volume2 } from 'lucide-react';
import { PanelMixerSlider } from '../panel/widgets/common/PanelMixerSlider';
import styles from './StorybookModal.module.scss';

export function PanelMixerSliderPreview() {
  const [brightness, setBrightness] = useState(72);
  const [lastBrightness, setLastBrightness] = useState(72);
  const [volume, setVolume] = useState(48);
  const [muted, setMuted] = useState(false);
  const brightnessOff = brightness <= 0;

  const toggleBrightness = () => {
    if (brightnessOff) {
      setBrightness(lastBrightness || 100);
    } else {
      setLastBrightness(brightness);
      setBrightness(0);
    }
  };

  return (
    <div className={styles.previewPanelMixer}>
      <PanelMixerSlider
        topLabel="AOC 3402"
        indexBadge="#1"
        value={brightness}
        min={0}
        max={100}
        valueLabel={`${brightness}`}
        icon={<Sun strokeWidth={1.7} />}
        iconButton={{
          ariaLabel: brightnessOff ? 'Restore brightness' : 'Turn off',
          ariaPressed: brightnessOff,
          active: brightnessOff,
          onClick: toggleBrightness,
        }}
        ariaLabel="Brightness display 1"
        onChange={v => {
          setBrightness(v);
          if (v > 0) setLastBrightness(v);
        }}
        onCommit={v => {
          setBrightness(v);
          if (v > 0) setLastBrightness(v);
        }}
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
