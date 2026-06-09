// The host-shared SDK runtime, bundled ONCE and served by the host. A widget
// worker imports this before the author bundle; it installs the @remote-dom
// polyfills and exposes react / react/jsx-runtime / @hellonexus/ui / @hellonexus/sdk
// on globalThis.__nexusRuntime. Author bundles are built with those modules
// externalized to thin shims that read this global — so each widget.mjs is ~5 KB
// (the author's code only) instead of re-inlining react-dom + remote-dom + the SDK.
//
// Why a global, not URL imports: workers have no import maps (Q60 / Chromium 83),
// and over the relay the worker can't live-import a service URL — so the host
// fetches this bundle as bytes → blob and the worker imports the blob, which
// populates the global the author shims resolve against.

import '@remote-dom/core/polyfill';
import '@remote-dom/react/polyfill';
import * as React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import * as UI from './ui';
import * as SDK from './sdk';

declare global {
  // eslint-disable-next-line no-var
  var __nexusRuntime: {
    React: typeof React;
    JsxRuntime: typeof JsxRuntime;
    UI: typeof UI;
    SDK: typeof SDK;
  } | undefined;
}

globalThis.__nexusRuntime = { React, JsxRuntime, UI, SDK };
