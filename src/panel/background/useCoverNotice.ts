import { useCallback, useEffect, useState } from 'react';

/**
 * The "this widget hides the background" notice for a single-widget preview.
 * `covered` is PanelApp's own signal (an opaque widget fills the panel). The
 * notice is armed when a quick edit applies a background while the widget
 * covers it (a widget that leaves the background visible needs no notice), and clears once the widget is removed or changed to one that does not.
 */
export function useCoverNotice(covered: boolean): { visible: boolean; arm: () => void } {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!covered) setArmed(false);
  }, [covered]);
  const arm = useCallback(() => { if (covered) setArmed(true); }, [covered]);
  return { visible: armed && covered, arm };
}
