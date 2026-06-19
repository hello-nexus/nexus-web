// Owned React-19 renderer over a @remote-dom RemoteReceiver. (We don't use
// @remote-dom/react/host - it peers React 17/18; the app is React 19.) Each
// remote node gets its own subscription, because the receiver only notifies a
// node's direct property/children changes, not nested ones.

import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { NODE_TYPE_ELEMENT, NODE_TYPE_TEXT } from '@remote-dom/core';
import type {
  RemoteReceiver,
  RemoteReceiverElement,
  RemoteReceiverNode,
  RemoteReceiverParent,
  RemoteReceiverText,
} from '@remote-dom/core/receivers';
import { ELEMENT_COMPONENTS } from './elementMap';

export function RemoteTree({ receiver }: { receiver: RemoteReceiver }) {
  return <RemoteChildren receiver={receiver} parent={receiver.root} />;
}

function useReceiverNode<T extends RemoteReceiverParent | RemoteReceiverNode>(
  receiver: RemoteReceiver,
  node: T,
): T {
  // The receiver mutates each node snapshot in place and bumps `version`, so the
  // node reference is stable. We must drive useSyncExternalStore off `version`
  // (a primitive that changes), then read the live node during render - otherwise
  // Object.is sees the same reference and skips the re-render.
  useSyncExternalStore(
    (onChange) => {
      const controller = new AbortController();
      receiver.subscribe(node, () => onChange(), { signal: controller.signal });
      return () => controller.abort();
    },
    () => receiver.get(node)?.version ?? -1,
  );
  return (receiver.get(node) as T | undefined) ?? node;
}

function RemoteChildren({ receiver, parent }: { receiver: RemoteReceiver; parent: RemoteReceiverParent }) {
  const current = useReceiverNode(receiver, parent);
  return (
    <>
      {current.children.map((child) => (
        <RemoteChild key={child.id} receiver={receiver} node={child} />
      ))}
    </>
  );
}

function RemoteChild({ receiver, node }: { receiver: RemoteReceiver; node: RemoteReceiverNode }): ReactNode {
  const current = useReceiverNode(receiver, node);

  if (current.type === NODE_TYPE_TEXT) {
    return <>{(current as RemoteReceiverText).data}</>;
  }
  if (current.type !== NODE_TYPE_ELEMENT) return null;

  const el = current as RemoteReceiverElement;
  const Component = ELEMENT_COMPONENTS[el.element as keyof typeof ELEMENT_COMPONENTS];
  if (!Component) return null; // unknown element -> nothing reaches the DOM

  const children = el.children.length
    ? el.children.map((child) => <RemoteChild key={child.id} receiver={receiver} node={child} />)
    : null;

  return (
    <Component {...el.properties} __events={el.eventListeners}>
      {children}
    </Component>
  );
}
