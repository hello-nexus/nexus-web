// Screen Time — SDK widget on the host-action data path (useHostAction →
// /widgets-api/dispatch → screentime.today). Richer than the declarative one:
// a prominent total + current-app highlight + a ranked app list with
// proportional bars and percentages, scaling content per size.

import { mount, useHostAction, useSize } from '@hellonexus/sdk';
import { Stack, Text, Bar, Icon, Divider } from '@hellonexus/ui';

interface Focus { name: string; totalMs: number; formatted: string }
interface AppEntry { name: string; totalMs: number; formatted: string; pctOfMax: number }
interface ScreentimeToday {
  focus: Focus | null;
  history: AppEntry[];
  totalMs: number;
  totalFormatted: string;
  maxMs: number;
  hasData: boolean;
}

function AppRow({ app, total }: { app: AppEntry; total: number }) {
  const pctOfDay = total > 0 ? Math.round((app.totalMs / total) * 100) : 0;
  return (
    <Stack direction="column" gap={4}>
      <Stack direction="row" gap={8} align="baseline" justify="between">
        <Text value={app.name} size={12} weight="medium" truncate />
        <Stack direction="row" gap={6} align="baseline">
          <Text value={`${pctOfDay}%`} size={10} tone="text-faded" tabular />
          <Text value={app.formatted} size={11} tone="text-dim" tabular />
        </Stack>
      </Stack>
      <Bar value={app.pctOfMax} max={100} tone="accent" />
    </Stack>
  );
}

function Screentime() {
  const { data, loading } = useHostAction<ScreentimeToday>('screentime.today', { refreshMs: 30000 });
  const { width, height } = useSize();
  const layout = height >= 300 ? 'full' : width >= 300 ? 'wide' : 'sm';

  if (!data || !data.hasData) {
    return (
      <Stack direction="column" padding={14} gap={6} align="center" justify="center" grow>
        <Icon name="clock" size={28} tone="text-dim" />
        <Text value={loading ? 'Loading…' : 'No usage tracked yet today'} size={12} tone="text-faded" align="center" />
      </Stack>
    );
  }

  const header = (
    <Stack direction="row" gap={10} align="end" justify="between">
      <Stack direction="column" gap={2}>
        <Text value="Screen Time" size={10} weight="semibold" tone="text-faded" transform="uppercase" letterSpacing={0.08} />
        <Text value={data.totalFormatted} size={layout === 'sm' ? '2.1em' : '2.6em'} weight="black" tabular lineHeight={1} />
      </Stack>
      {data.focus && (
        <Stack direction="column" gap={2} align="end">
          <Stack direction="row" gap={5} align="center" justify="end">
            <Icon name="activity" size={11} tone="accent-glow" />
            <Text value="Active now" size={9} weight="semibold" tone="text-faded" transform="uppercase" letterSpacing={0.05} />
          </Stack>
          <Text value={data.focus.name} size={12} weight="medium" align="end" truncate />
          <Text value={data.focus.formatted} size={11} tone="accent" tabular align="end" />
        </Stack>
      )}
    </Stack>
  );

  if (layout === 'sm') {
    return <Stack direction="column" padding={14} gap={6} grow justify="center">{header}</Stack>;
  }

  const count = layout === 'full' ? 8 : 4;
  return (
    <Stack direction="column" padding={14} gap={12} grow>
      {header}
      <Divider />
      <Stack direction="column" gap={layout === 'full' ? 9 : 8} grow justify="start">
        {data.history.slice(0, count).map((app, i) => (
          <AppRow key={i} app={app} total={data.totalMs} />
        ))}
      </Stack>
    </Stack>
  );
}

mount(Screentime);
