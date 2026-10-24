import { useEffect, useState } from 'react';
import { pingService } from '../api/service';

/** The service host's platform ('windows', 'macos', 'linux'), empty until the ping lands. */
export function useServicePlatform(enabled: boolean): string {
  const [platform, setPlatform] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    pingService().then(p => {
      if (!cancelled && p?.platform) setPlatform(p.platform);
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return platform;
}
