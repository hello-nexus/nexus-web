import { useEffect, useState } from 'react';
import * as store from '../lib/monitoringStore';

export interface ScreenTimeData {
  focus: { id: string; name: string; today: { total: number; hours: number; minutes: number; seconds: number } } | null;
  history: { name: string; totalMs: number }[];
}

export function useScreenTime(): ScreenTimeData {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump(v => v + 1);
    store.subscribe(fn);
    return () => store.unsubscribe(fn);
  }, []);
  return store.getScreenTime();
}
