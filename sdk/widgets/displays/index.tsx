// Displays — SDK CONTROL widget. Live display list via displays.list (host-action
// data) + brightness sliders that WRITE via displays.setBrightness (host-action
// control). Exercises the full dispatch path: read + write. Optimistic local
// slider state keeps dragging responsive despite the async host round-trip.

import { useEffect, useState } from 'react';
import { mount, useHostAction, useDispatch } from '@hellonexus/sdk';
import { Stack, Text, Slider, Icon, Divider } from '@hellonexus/ui';

interface BrightnessControl { supported: boolean; min: number; max: number; current: number | null }
interface Display {
  id: string; name: string; manufacturer: string; model: string;
  isInternal: boolean; brightnessControl: BrightnessControl;
}
interface DisplayList { displays: Display[]; hint: string }

function DisplayRow({ d, onSet }: { d: Display; onSet: (id: string, v: number) => void }) {
  const bc = d.brightnessControl;
  const [val, setVal] = useState(bc.current ?? 50);
  // Reconcile from the host when not actively dragging.
  useEffect(() => { if (typeof bc.current === 'number') setVal(bc.current); }, [bc.current]);

  const label = (
    <Stack direction="row" gap={6} align="center">
      <Icon name={d.isInternal ? 'monitor' : 'monitor'} size={13} tone="text-dim" />
      <Text value={d.name || d.model || d.manufacturer || 'Display'} size={12} weight="medium" truncate />
    </Stack>
  );

  if (!bc.supported) {
    return (
      <Stack direction="row" gap={8} align="center" justify="between">
        {label}
        <Text value="No control" size={10} tone="text-faded" />
      </Stack>
    );
  }

  return (
    <Stack direction="column" gap={5}>
      <Stack direction="row" gap={8} align="baseline" justify="between">
        {label}
        <Text value={`${Math.round(val)}%`} size={11} weight="semibold" tone="accent" tabular />
      </Stack>
      <Slider
        value={val} min={bc.min} max={bc.max} tone="accent"
        onInput={(v) => setVal(v)}
        onChange={(v) => { setVal(v); onSet(d.id, Math.round(v)); }}
      />
    </Stack>
  );
}

function Displays() {
  const { data, loading } = useHostAction<DisplayList>('displays.list', { refreshMs: 5000 });
  const dispatch = useDispatch();
  const onSet = (id: string, value: number) => { void dispatch('displays.setBrightness', { id, value }); };

  if (!data || data.displays.length === 0) {
    return (
      <Stack direction="column" padding={14} gap={6} align="center" justify="center" grow>
        <Icon name="monitor" size={28} tone="text-dim" />
        <Text value={loading ? 'Loading…' : 'No displays detected'} size={12} tone="text-faded" align="center" />
      </Stack>
    );
  }

  return (
    <Stack direction="column" padding={14} gap={10} grow justify="center">
      <Stack direction="row" gap={6} align="center" justify="between">
        <Text value="Displays" size={10} weight="semibold" tone="text-faded" transform="uppercase" letterSpacing={0.08} />
        <Text value={`${data.displays.length}`} size={10} tone="text-faded" tabular />
      </Stack>
      <Divider />
      <Stack direction="column" gap={14} grow justify="center">
        {data.displays.map((d) => <DisplayRow key={d.id} d={d} onSet={onSet} />)}
      </Stack>
    </Stack>
  );
}

mount(Displays);
