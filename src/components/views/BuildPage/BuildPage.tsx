import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, RotateCw } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { useTranslation } from '../../../lib/i18n';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { resolveTheme } from '../../../lib/settings';
import { useSystemSpecs } from '../../../hooks/useSystemSpecs';
import { useFpsGames } from '../../../hooks/useFpsGames';
import { buildFpsSignatureParams } from '../../../panel/widgets/frames/fpsSignatureParams';
import { isRemoteOrigin } from '../../../api/service';
import { openExternalUrl } from '../../../sandbox/ui/openExternal';
import styles from './BuildPage.module.scss';

export const BUILD_ORIGIN = 'https://build.hellonexus.com';
const DEFAULT_PATH = '/upgrade';
// No `ready` handshake within this window reads as the portal being
// unreachable, matching the plan's embed protocol fallback.
const READY_TIMEOUT_MS = 8000;
const MAX_GAMES = 10;
const BYTES_PER_GIB = 1024 ** 3;

interface BuildMachine {
  processor?: string;
  primaryGpu?: string;
  memory?: string;
  motherboard?: string;
  storage?: string;
  monitor?: string;
  res?: string;
  hz?: number;
  ramGb?: number;
}

interface BuildGame {
  gameKey: string;
  title: string;
}

interface FrameMessage {
  type: string;
  [key: string]: unknown;
}

function isFrameMessage(data: unknown): data is FrameMessage {
  return typeof data === 'object' && data !== null && typeof (data as { type?: unknown }).type === 'string';
}

interface BuildPageProps {
  /** Portal path (pathname + search), e.g. "/upgrade?bench=<id>". Defaults to "/upgrade". */
  path?: string | null;
}

/**
 * Build: a full-height iframe onto build.hellonexus.com, the upgrade
 * advisor portal. nexus-web carries no catalog/affiliate code itself - see
 * plans/build-app-embed.md for the postMessage protocol this implements.
 */
export function BuildPage({ path }: BuildPageProps) {
  const { t, language } = useTranslation();
  const { settings } = useUiSettings();
  const { specs } = useSystemSpecs(true);
  const { gamesByKey } = useFpsGames();

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [frameSrcPath, setFrameSrcPath] = useState(() => path ?? DEFAULT_PATH);
  const [lastPath, setLastPath] = useState(() => path ?? DEFAULT_PATH);

  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => resolveTheme(settings.themeMode));
  useEffect(() => {
    setResolvedTheme(resolveTheme(settings.themeMode));
    if (settings.themeMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => setResolvedTheme(resolveTheme('system'));
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [settings.themeMode]);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setTimedOut(true), READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [ready, reloadNonce]);

  const post = useCallback((message: FrameMessage) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(message, BUILD_ORIGIN);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== BUILD_ORIGIN) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data: unknown = event.data;
      if (!isFrameMessage(data)) return;
      switch (data.type) {
        case 'nexus-build:ready':
          setReady(true);
          setTimedOut(false);
          break;
        case 'nexus-build:navigate': {
          const nextPath = typeof data.path === 'string' ? data.path : null;
          if (nextPath) setLastPath(nextPath);
          break;
        }
        case 'nexus-build:open-external': {
          const url = typeof data.url === 'string' ? data.url : null;
          if (url) void openExternalUrl(url);
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const machine: BuildMachine | undefined = specs ? (() => {
    const sig = buildFpsSignatureParams(specs);
    return {
      processor: specs.processor || undefined,
      primaryGpu: specs.primaryGpu ?? specs.graphicsCard.split(' + ')[0]?.trim() ?? undefined,
      memory: specs.memory || undefined,
      motherboard: specs.motherboard || undefined,
      storage: specs.storage || undefined,
      monitor: specs.monitor || undefined,
      res: sig?.res,
      hz: sig?.hz,
      ramGb: sig?.ramBytes != null ? Math.round(sig.ramBytes / BYTES_PER_GIB) : undefined,
    };
  })() : undefined;

  const games: BuildGame[] = [...gamesByKey.values()]
    .sort((a, b) => b.focusedSec - a.focusedSec)
    .slice(0, MAX_GAMES)
    .map(g => ({ gameKey: g.gameKey, title: g.name }));

  // One-shot per handshake: fires when `ready` flips true, carrying whatever
  // machine/games/theme/locale are known at that moment.
  useEffect(() => {
    if (!ready) return;
    post({
      type: 'nexus-build:hello',
      v: 1,
      theme: resolvedTheme,
      locale: language,
      host: isRemoteOrigin ? 'web' : 'app',
      ...(machine ? { machine } : {}),
      ...(games.length > 0 ? { games } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per ready transition; live theme/locale changes post their own message below
  }, [ready]);

  const prevThemeRef = useRef(resolvedTheme);
  useEffect(() => {
    if (!ready || resolvedTheme === prevThemeRef.current) return;
    prevThemeRef.current = resolvedTheme;
    post({ type: 'nexus-build:theme', v: 1, theme: resolvedTheme });
  }, [resolvedTheme, ready, post]);

  const prevLangRef = useRef(language);
  useEffect(() => {
    if (!ready || language === prevLangRef.current) return;
    prevLangRef.current = language;
    post({ type: 'nexus-build:locale', v: 1, locale: language });
  }, [language, ready, post]);

  const prevPathRef = useRef(path);
  useEffect(() => {
    if (!ready || path == null || path === prevPathRef.current) return;
    prevPathRef.current = path;
    post({ type: 'nexus-build:route', v: 1, path });
    setLastPath(path);
  }, [path, ready, post]);

  const handleRetry = useCallback(() => {
    setReady(false);
    setTimedOut(false);
    setFrameSrcPath(path ?? lastPath);
    setReloadNonce(n => n + 1);
  }, [path, lastPath]);

  const openInBrowser = useCallback(() => {
    void openExternalUrl(`${BUILD_ORIGIN}${lastPath}`);
  }, [lastPath]);

  const showFallback = !ready && (offline || timedOut);

  return (
    <div className={styles.app}>
      <ViewHeader
        title={t('panel.widget.build')}
        actions={
          <Button size="sm" tone="ghost" icon={<ExternalLink size={14} />} onClick={openInBrowser}>
            {t('build.openInBrowser')}
          </Button>
        }
      />
      <div className={styles.body}>
        {showFallback ? (
          <div className={styles.fallbackWrap}>
            <EmptyState
              icon={<ExternalLink size={28} />}
              title={t('build.offline.title')}
              hint={t('build.offline.body')}
              action={
                <div className={styles.fallbackActions}>
                  <Button tone="accent" icon={<ExternalLink size={14} />} onClick={openInBrowser}>
                    {t('build.offline.open')}
                  </Button>
                  <Button tone="neutral" icon={<RotateCw size={14} />} onClick={handleRetry}>
                    {t('build.offline.retry')}
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <iframe
            key={reloadNonce}
            ref={iframeRef}
            src={`${BUILD_ORIGIN}${frameSrcPath}`}
            className={styles.frame}
            title={t('panel.widget.build')}
            allow=""
            referrerPolicy="strict-origin-when-cross-origin"
            loading="eager"
          />
        )}
      </div>
    </div>
  );
}

export default BuildPage;
