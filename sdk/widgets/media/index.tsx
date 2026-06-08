// Media — now-playing + transport, on the host-action data/control path.
// Exercises media.nowPlaying (read), media.transport (write play/pause/next/prev),
// media.setVolume (write). The album-art image is a known gap (the art endpoint is
// loopback, which the net.fetch proxy blocks) — shown as a music glyph for now.

import { mount, useHostAction, useDispatch } from '@hellonexus/sdk';
import { Stack, Text, Button, Icon, Slider } from '@hellonexus/ui';

interface NowPlaying {
  sourceAppName: string;
  song: { title: string; artist: string; album: string };
  playback: { playing: boolean; positionMs: number; durationMs: number };
  controls: { isPrevEnabled: boolean; isNextEnabled: boolean; isPlayEnabled: boolean; isPauseEnabled: boolean };
}

function Media() {
  const { data, loading } = useHostAction<NowPlaying | null>('media.nowPlaying', { refreshMs: 3000 });
  const dispatch = useDispatch();
  const transport = (action: string) => void dispatch('media.transport', { action });

  if (!data || !data.song?.title) {
    return (
      <Stack direction="column" padding={16} gap={8} align="center" justify="center" grow>
        <Icon name="music" size={26} tone="text-dim" />
        <Text value={loading ? 'Loading…' : 'Nothing playing'} size={12} tone="text-faded" />
      </Stack>
    );
  }

  const { playback: p, controls: c } = data;
  return (
    <Stack direction="column" padding={16} gap={12} grow justify="center">
      <Stack direction="row" gap={12} align="center">
        <Icon name="music" size={26} tone="accent" />
        <Stack direction="column" gap={2} grow>
          <Text value={data.song.title} size={15} weight="bold" truncate />
          <Text value={data.song.artist} size={12} tone="text-dim" truncate />
        </Stack>
      </Stack>
      <Stack direction="row" gap={16} align="center" justify="center">
        <Button variant="ghost" icon="skip-back" disabled={!c.isPrevEnabled} onPress={() => transport('prev')} />
        <Button variant="soft" icon={p.playing ? 'pause' : 'play'} size="lg" onPress={() => transport(p.playing ? 'pause' : 'play')} />
        <Button variant="ghost" icon="skip-forward" disabled={!c.isNextEnabled} onPress={() => transport('next')} />
      </Stack>
      <Stack direction="row" gap={8} align="center">
        <Icon name="volume" size={14} tone="text-dim" />
        <Slider value={50} min={0} max={100} tone="accent" onChange={(v) => void dispatch('media.setVolume', { value: v / 100 })} />
      </Stack>
    </Stack>
  );
}

mount(Media);
