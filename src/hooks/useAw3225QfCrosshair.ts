import { useEffect, useRef, useState } from 'react';
import { getAw3225QfCrosshair, setAw3225QfCrosshair, type Aw3225QfCrosshairConfig, type Aw3225QfCrosshairStatus } from '../api/aw3225qf';
import { useToast } from '../components/common/Toast/Toast';
import { useTranslation } from '../lib/i18n';

const DEFAULT_CONFIG: Aw3225QfCrosshairConfig = { type: 0, color: 2, maskControl: 0 };

export function useAw3225QfCrosshair() {
  const { t } = useTranslation();
  const { push } = useToast();
  const [status, setStatus] = useState<Aw3225QfCrosshairStatus | null>(null);
  const [config, setConfig] = useState<Aw3225QfCrosshairConfig>(DEFAULT_CONFIG);
  const [busy, setBusy] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const mounted = useRef(false);
  const writing = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const startedAt = revision.current;
      if (!writing.current) {
        try {
          const next = await getAw3225QfCrosshair();
          if (!cancelled && !writing.current && startedAt === revision.current) {
            setReadFailed(!next);
            if (next) { setStatus(next); setConfig(next.config); }
          }
        } catch {
          if (!cancelled && !writing.current && startedAt === revision.current) setReadFailed(true);
        }
      }
      if (!cancelled) timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => { cancelled = true; mounted.current = false; clearTimeout(timer); };
  }, []);

  const apply = async (enabled: boolean, nextConfig: Aw3225QfCrosshairConfig) => {
    if (writing.current) return;
    const previousConfig = config;
    writing.current = true;
    revision.current++;
    setBusy(true);
    setConfig(nextConfig);
    try {
      const result = await setAw3225QfCrosshair(enabled, nextConfig);
      if (!mounted.current) return;
      if (result && !result.error) {
        setStatus(result);
        setConfig(result.config);
        setReadFailed(false);
      } else {
        push({ title: t('devices.aw3225qf.failed'), body: result?.error });
        // A partially applied command may have turned the engine off. Read
        // the real state and restore the last saved selection after failure.
        const current = await getAw3225QfCrosshair();
        if (!mounted.current) return;
        setStatus(current ?? result ?? status);
        setConfig(current?.config ?? result?.config ?? previousConfig);
        setReadFailed(!current && !result);
      }
    } catch {
      if (mounted.current) {
        setConfig(previousConfig);
        setReadFailed(true);
        push({ title: t('devices.aw3225qf.failed') });
      }
    } finally {
      writing.current = false;
      revision.current++;
      if (mounted.current) setBusy(false);
    }
  };

  return { status, config, busy, readFailed, apply };
}
