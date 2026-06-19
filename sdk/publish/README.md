# @hello-nexus/sdk

Author-facing SDK for building **sandboxed Nexus apps**. You write a normal React
(18) component; it runs in a sandboxed worker and the Nexus host renders it from a
closed, themed component set - so every app is visually consistent with native and
can't draw raw DOM.

> Private preview (GitHub Packages). Install needs a `read:packages` token - see below.

## Install

```jsonc
// .npmrc
@hello-nexus:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN   // a PAT with read:packages
```

```sh
npm install @hello-nexus/sdk react@^18
```

## Use

```tsx
import { mount, useSensor } from '@hello-nexus/sdk';
import { Stack, Text, Ring } from '@hello-nexus/sdk/ui';

function App() {
  const cpu = useSensor('cpu.package.temperature');
  return (
    <Stack direction="column" padding={12} gap={8}>
      <Text value="CPU" tone="text-dim" size={12} />
      <Ring value={cpu ?? 0} min={20} max={100} label={`${Math.round(cpu ?? 0)}°`} />
    </Stack>
  );
}

mount(App);
```

- `@hello-nexus/sdk` - `mount`, the `use*` hooks (`useSensor`, `useDispatch`, `useSettings`, `useTick`, …), and small format helpers.
- `@hello-nexus/sdk/ui` - the blessed component set (layout, text, indicators, controls, surfaces). No raw style/className: components theme through host tokens.

The heavy runtime (react-dom + the remote-component channel) is **provided by the host** at load; your app bundle externalizes `@hello-nexus/*` to it, so a shipped bundle is a few KB of your code.

## Status

Preview. The surface is stable enough to build "stat + control" apps; see the host's
`SDK-GAPS.md` for what isn't expressible yet. Versions follow `SDK_PROTOCOL_VERSION` -
an app built against one major must run on a host advertising the same protocol.
