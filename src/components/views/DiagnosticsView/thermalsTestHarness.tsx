import { useState } from 'react';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import { ThermalsTab } from './ThermalsTab';
import { INITIAL_THERMALS_SELECTION, type ThermalsSelection } from './thermalsHelpers';

interface HarnessProps {
  history: UseMetricHistoryResult;
  coolingHistory?: UseMetricHistoryResult;
  onAlertDismissed: () => void;
  initialSelection?: ThermalsSelection;
  onSelection?: (next: ThermalsSelection) => void;
}

/** ThermalsTab with its selection state owned locally, as DiagnosticsView owns it; `history` feeds the Custom sensors chart. */
export function ThermalsHarness({ history, coolingHistory, onAlertDismissed, initialSelection, onSelection }: HarnessProps) {
  const [selection, setSelection] = useState<ThermalsSelection>(initialSelection ?? INITIAL_THERMALS_SELECTION);
  return (
    <ThermalsTab
      coolingHistory={coolingHistory ?? { ...history, silhouette: history.silhouette ?? [], series: [] }}
      sensorHistory={history}
      episodes={[]}
      serviceOnline
      onGuardTripDismissed={() => {}}
      selection={selection}
      onSelectionChange={next => { setSelection(next); onSelection?.(next); }}
      onAlertDismissed={onAlertDismissed}
    />
  );
}
