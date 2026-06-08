// Showcase — exercises the generic UI primitives (Chart, Input, Scroll, Image)
// so authors can see them composed. Not installed; loaded by the e2e harness.

import { useState } from 'react';
import { mount } from '@hellonexus/sdk';
import { Stack, Text, Frame, Scroll, Input, Image, Chart } from '@hellonexus/ui';

// A tiny inline avatar (data: URL) so the demo needs no network.
const AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='16' fill='%2367e8f9'/%3E%3Ccircle cx='16' cy='13' r='6' fill='%230b0b0c' opacity='0.55'/%3E%3Crect x='6' y='22' width='20' height='10' rx='5' fill='%230b0b0c' opacity='0.55'/%3E%3C/svg%3E";

const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima'];

function Showcase() {
  const [q, setQ] = useState('');
  const rows = NAMES.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
  return (
    <Stack direction="column" padding={12} gap={10} grow>
      <Text value="UI Primitives" size={11} weight="semibold" tone="text-faded" transform="uppercase" letterSpacing={0.06} />
      {/* ui-chart: multi-point area line */}
      <Chart series={[{ values: [3, 7, 4, 9, 6, 11, 8, 12, 9, 13], area: true }]} height={60} gridlines tone="accent" />
      {/* ui-input: uncontrolled typing, value reported via onValueChange */}
      <Input placeholder="Filter…" type="search" onValueChange={setQ} />
      {/* ui-scroll + ui-image: a scrollable list with avatars */}
      <Scroll direction="vertical" gap={6} grow>
        {rows.map((n) => (
          <Frame key={n} direction="row" align="center" gap={10} padding={8} tone="bg-card" radius={8}>
            <Image src={AVATAR} width={28} height={28} radius={14} />
            <Text value={n} size={13} weight="medium" />
          </Frame>
        ))}
        {rows.length === 0 && <Text value="No matches" size={12} tone="text-faded" align="center" />}
      </Scroll>
    </Stack>
  );
}

mount(Showcase);
