// Timer — countdown with a setup phase (H/M/S steppers) then run/pause/resume/stop.
// Exercises stepper events, conditional phases, and countdown math in plain React.

import { mount, useLocalState, useTick, formatDuration } from '@hellonexus/sdk';
import { Stack, Text, Button, Icon, Stepper } from '@hellonexus/ui';

interface TimerLocal {
  phase: 'setup' | 'running';
  hours: number; minutes: number; seconds: number;
  running: boolean; startedAt: number; remainingAtStart: number;
}

const DEFAULTS: TimerLocal = {
  phase: 'setup', hours: 0, minutes: 5, seconds: 0,
  running: false, startedAt: 0, remainingAtStart: 0,
};

function Timer() {
  const [s, set] = useLocalState<TimerLocal>(DEFAULTS);
  const now = useTick(s.phase === 'running' && s.running ? 250 : null);

  if (s.phase === 'running') {
    const remaining = s.running ? Math.max(0, s.remainingAtStart - (now - s.startedAt)) : s.remainingAtStart;
    return (
      <Stack direction="column" padding={12} gap={12} align="center" justify="center" grow>
        <Text value={formatDuration(remaining, 'hmsAuto')} size="3em" weight="black" tabular lineHeight={1} />
        <Stack direction="row" gap={10} align="center" justify="center">
          {s.running ? (
            <Button
              label="Pause" tone="accent"
              onPress={() => set({ running: false, remainingAtStart: Math.max(0, s.remainingAtStart - (Date.now() - s.startedAt)), startedAt: 0 })}
            ><Icon name="pause" size={16} /></Button>
          ) : (
            <Button label="Resume" tone="accent" onPress={() => set({ running: true, startedAt: Date.now() })}>
              <Icon name="play" size={16} />
            </Button>
          )}
          <Button label="Stop" onPress={() => set({ phase: 'setup', running: false, startedAt: 0, remainingAtStart: 0 })}>
            <Icon name="square" size={14} />
          </Button>
        </Stack>
      </Stack>
    );
  }

  const total = s.hours * 3600 + s.minutes * 60 + s.seconds;
  return (
    <Stack direction="column" padding={10} gap={12} align="center" justify="center" grow>
      <Stack direction="row" gap={6} align="center" justify="center">
        <Stepper value={s.hours} min={0} max={23} onChange={(v) => set({ hours: v })} />
        <Text value=":" size="1.4em" weight="bold" opacity={0.5} lineHeight={1} />
        <Stepper value={s.minutes} min={0} max={59} onChange={(v) => set({ minutes: v })} />
        <Text value=":" size="1.4em" weight="bold" opacity={0.5} lineHeight={1} />
        <Stepper value={s.seconds} min={0} max={59} onChange={(v) => set({ seconds: v })} />
      </Stack>
      <Button
        label="Start" tone="accent" disabled={total === 0}
        onPress={() => set({ phase: 'running', running: true, startedAt: Date.now(), remainingAtStart: total * 1000 })}
      ><Icon name="play" size={16} /></Button>
    </Stack>
  );
}

mount(Timer);
