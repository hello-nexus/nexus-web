// Worker-side @remote-dom element registration. Each blessed UI element from the
// shared contract becomes a RemoteElement custom element; rendering one in the
// worker's polyfilled DOM serializes a mutation to the host, which maps the
// element name back to a real React component. remote-root is the tree root.

import { RemoteRootElement, createRemoteElement } from '@remote-dom/core/elements';
import type { RemoteElementConstructor } from '@remote-dom/core/elements';
import { UI_ELEMENTS, type UiElementName } from '../../src/sandbox/contract/elements';

export const ELEMENT_CTORS = {} as Record<UiElementName, RemoteElementConstructor>;

let registered = false;

export function registerElements(): void {
  if (registered) return;
  registered = true;

  if (!customElements.get('remote-root')) {
    customElements.define('remote-root', RemoteRootElement);
  }

  for (const name of Object.keys(UI_ELEMENTS) as UiElementName[]) {
    const spec = UI_ELEMENTS[name];
    const properties: Record<string, object> = {};
    for (const prop of spec.properties) properties[prop] = {};
    const Ctor = createRemoteElement({
      properties,
      events: spec.events ? [...spec.events] : undefined,
    });
    ELEMENT_CTORS[name] = Ctor;
    if (!customElements.get(name)) customElements.define(name, Ctor);
  }
}
