import { useEffect, useState } from 'react';
import { fetchSentry } from '../../../api/sentry';

/** Count of paired phones registered for push, read once on mount; null until known or when the read fails. */
export function useAlertPhones(): number | null {
  const [phones, setPhones] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchSentry()
      .then(state => { if (!cancelled) setPhones(state?.alertPhones ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return phones;
}
