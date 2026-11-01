import { useEffect, useState } from 'react';
import { fetchService } from '../../../api/service';
import { useSystemSpecs } from '../../../hooks/useSystemSpecs';
import { buildSpecRows, coolerNames, sizeShowsSpecs, type BuildSpecRow } from './buildSpecRows';

/** The spec rows of a tile of this size: the PC's report plus its detected coolers; empty for the image-only size. */
export function useBuildSpecs(enabled: boolean, size: string): BuildSpecRow[] {
  const listed = enabled && sizeShowsSpecs(size);
  const { specs } = useSystemSpecs(listed);
  const [coolers, setCoolers] = useState<string[]>([]);
  useEffect(() => {
    if (!listed) return undefined;
    let cancelled = false;
    // An older service answers 404, which leaves the cooler row out.
    void fetchService<{ devices?: { category?: string; vendor?: string; model?: string }[] }>('/system/devices')
      .then((res) => { if (!cancelled && Array.isArray(res?.devices)) setCoolers(coolerNames(res.devices)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [listed]);
  return buildSpecRows({ specs, coolers }, size);
}
