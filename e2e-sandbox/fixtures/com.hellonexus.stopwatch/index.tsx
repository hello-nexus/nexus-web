// Stopwatch - SDK sandbox fixture. Exercises tick-driven state and host-backed
// local state; see fixtures/README.md.

import { mount, useLocalState, useTick, formatDuration } from '@hello-nexus/sdk';
import { Stack, Text, Button, Icon } from '@hello-nexus/sdk/ui';

interface StopwatchLocal {
  running: boolean;
  startedAt: number;
  pausedElapsed: number;
}

function Stopwatch() {
  const [s, set] = useLocalState<StopwatchLocal>({ running: false, startedAt: 0, pausedElapsed: 0 });
  const now = useTick(s.running ? 100 : null);
  const elapsed = s.running ? now - s.startedAt + s.pausedElapsed : s.pausedElapsed;
  const canReset = s.running || s.pausedElapsed !== 0;

  return (
    <Stack direction="column" padding={12} gap={10} align="center" justify="center" grow>
      <Stack direction="row" gap={0} align="baseline" justify="center">
        <Text value={formatDuration(elapsed, 'hmsAuto')} size="2.6em" weight="black" tabular lineHeight={1} />
        <Text value={formatDuration(elapsed, 'hundredths')} size="1.5em" weight="semibold" opacity={0.55} tabular lineHeight={1} />
      </Stack>

      <Stack direction="row" gap={8} align="center" justify="center">
        <Button
          label="Reset"
          disabled={!canReset}
          onPress={() => set({ running: false, startedAt: 0, pausedElapsed: 0 })}
        >
          <Icon name="rotate-ccw" size={16} />
        </Button>

        {s.running ? (
          <Button
            label="Pause"
            tone="accent"
            onPress={() => set({ running: false, pausedElapsed: Date.now() - s.startedAt + s.pausedElapsed })}
          >
            <Icon name="pause" size={16} />
          </Button>
        ) : (
          <Button
            label="Start"
            tone="accent"
            onPress={() => set({ running: true, startedAt: Date.now() })}
          >
            <Icon name="play" size={16} />
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

mount(Stopwatch);
