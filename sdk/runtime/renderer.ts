// `@hello-nexus/sdk/renderer`: the entry of an app's renderer module. The host
// runs the module in a dedicated worker and hands it a GPU canvas; see
// <Canvas> in `@hello-nexus/sdk/ui` for the widget side. Inlined into the
// app's renderer.mjs by `nexus-app build`; it has no react or runtime dependency.

import { runRenderer, type RendererContext, type RendererPort } from './rendererCore';

export type { RendererContext, RendererSize, CanvasPointerEvent } from './rendererCore';

export function defineRenderer(start: (ctx: RendererContext) => void | Promise<void>): void {
  runRenderer(start, globalThis as unknown as RendererPort);
}
