import { useCallback, useEffect, useState } from 'react';

/**
 * The "this widget hides the background" notice for a single-widget preview.
 * `covered` is PanelApp's own signal (an opaque widget fills the panel). The
 * notice is armed when a quick edit applies a background while the widget
 * covers it (a widget that leaves the background visible needs no notice), and clears once the widget is removed or changed to one that does not.
 */
export function useCoverNotice(covered: boolean): { visible: boolean; arm: () => void; dismiss: () => void } {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!covered) setArmed(false);
  }, [covered]);
  const arm = useCallback(() => { if (covered) setArmed(true); }, [covered]);
  const dismiss = useCallback(() => setArmed(false), []);
  return { visible: armed && covered, arm, dismiss };
}

/**
 * A notice for a standing condition that the user may close. It stays closed until the
 * condition goes away and returns.
 */
export function useDismissibleNotice(active: boolean): { visible: boolean; dismiss: () => void } {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!active) setDismissed(false);
  }, [active]);
  const dismiss = useCallback(() => setDismissed(true), []);
  return { visible: active && !dismissed, dismiss };
}
