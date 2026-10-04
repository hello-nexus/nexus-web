import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, RotateCw } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { useTranslation } from '../../../lib/i18n';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { resolveTheme, currentAccentColor } from '../../../lib/settings';
import { useSystemSpecs } from '../../../hooks/useSystemSpecs';
import { useFpsGames } from '../../../hooks/useFpsGames';
import { buildFpsSignatureParams, primaryGpuModel } from '../../../panel/widgets/frames/fpsSignatureParams';
import { fetchService, isRemoteOrigin, putService } from '../../../api/service';
import { SCENE_3D } from '../../../lib/scene/sceneFeature';
import { openExternalUrl } from '../../../sandbox/ui/openExternal';
import { clearBuildFrameHistory, setBuildFrameHistory } from './buildNav';
import { relaySceneExport } from './buildScene';
import styles from './BuildPage.module.scss';

export const BUILD_ORIGIN = 'https://build.hellonexus.com';
const DEFAULT_PATH = '/builder';
const READY_TIMEOUT_MS = 8000;
const MAX_GAMES = 10;
// Same rule as the cloud api's device case id: a catalog part id.
const CASE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const BYTES_PER_GIB = 1024 ** 3;
// Only the iframe's own script/form/same-origin-storage capabilities are
// granted - no allow-top-navigation, no allow-popups, so the only way out of
// the frame is the open-external message.
const IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms';
// The async clipboard API is denied to a cross-origin frame unless the parent
// delegates clipboard-write; the portal's Share Build copies a permalink.
const IFRAME_ALLOW = 'clipboard-write';

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
  caseId?: string;
}

interface BuildGame {
  gameKey: string;
  title: string;
}

interface FrameMessage {
  type: string;
  [key: string]: unknown;
}

// Glass: the native shell paints the frosted backdrop behind a transparent web
// view (Dashboard.tsx, App.module.scss). The portal clears its own canvas on
// this flag so the frame shows the same glass instead of a solid page.
function isGlassBackdrop(): boolean {
  const root = document.documentElement;
  return root.classList.contains('nexus-shell-native-glass') && root.getAttribute('data-bg') === 'glass';
}

function isValidCaseId(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && CASE_ID_PATTERN.test(value));
}

function isFrameMessage(data: unknown): data is FrameMessage {
  return typeof data === 'object' && data !== null && typeof (data as { type?: unknown }).type === 'string';
}

// Must start with exactly one leading slash (rejects a protocol-relative
// "//host" segment) and carry no "@" before the query string, so
// `${BUILD_ORIGIN}${path}` can never resolve to a different host.
function isSafeBuildPath(path: string): boolean {
  if (!/^\/(?!\/)/.test(path)) return false;
  const queryIndex = path.indexOf('?');
  const beforeQuery = queryIndex === -1 ? path : path.slice(0, queryIndex);
  return !beforeQuery.includes('@');
}

// The router carries this as one URL-encoded path segment (see buildNav.ts +
// Dashboard's onOpenBuild wiring), so a slash or query character inside it
// never splits across route segments or leaks into the app's own query
// string. Anything that fails to decode, or decodes to an unsafe shape,
// falls back to the default page rather than reaching the iframe src.
export function sanitizeBuildPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_PATH;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return DEFAULT_PATH;
  }
  return isSafeBuildPath(decoded) ? decoded : DEFAULT_PATH;
}

interface BuildPageProps {
  /** URL-encoded portal path (pathname + search), e.g. encodeURIComponent("/upgrade?bench=<id>"). Defaults to "/builder". */
  path?: string | null;
  /** Opens the Benchmark page and starts a run; the hello advertises it so the portal's Start benchmark stays in the app. */
  onOpenBenchmark?: () => void;
  /** Opens the Lighting page after the frame sent the PC there as a 3D scene. */
  onOpenLighting?: () => void;
}

/**
 * Build: a full-height iframe onto build.hellonexus.com, the upgrade
 * advisor portal. nexus-web carries no catalog/affiliate code itself.
 */
export function BuildPage({ path, onOpenBenchmark, onOpenLighting }: BuildPageProps) {
  const { t, language } = useTranslation();
  const { settings } = useUiSettings();
  const { specs } = useSystemSpecs(true);
  const { gamesByKey } = useFpsGames();

  const safePath = sanitizeBuildPath(path);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const onOpenBenchmarkRef = useRef(onOpenBenchmark);
  useEffect(() => { onOpenBenchmarkRef.current = onOpenBenchmark; }, [onOpenBenchmark]);
  const onOpenLightingRef = useRef(onOpenLighting);
  useEffect(() => { onOpenLightingRef.current = onOpenLighting; }, [onOpenLighting]);
  const [ready, setReady] = useState(false);
  // Bumped on every `ready` message, not just the first: the portal navigates
  // between routes with full page loads inside the iframe, so each new page
  // re-announces `ready` and needs its own `hello` (fresh machine/theme/locale).
  const [helloNonce, setHelloNonce] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [frameSrcPath, setFrameSrcPath] = useState(safePath);
  const [lastPath, setLastPath] = useState(safePath);

  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => resolveTheme(settings.themeMode));
  useEffect(() => {
    setResolvedTheme(resolveTheme(settings.themeMode));
    if (settings.themeMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => setResolvedTheme(resolveTheme('system'));
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [settings.themeMode]);

  // This machine's case, the one part the app cannot detect: saved by the
  // service (machine-local, mirrored to the signed-in account) and picked in
  // the frame.
  const [caseId, setCaseId] = useState<string | null>(null);
  const caseTouchedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchService<{ caseId?: string | null }>('/system/case');
      if (cancelled || caseTouchedRef.current || !res) return;
      if (typeof res.caseId === 'string' && isValidCaseId(res.caseId)) setCaseId(res.caseId);
    })();
    return () => { cancelled = true; };
  }, []);

  const readyRef = useRef(ready);
  useEffect(() => { readyRef.current = ready; }, [ready]);

  const remount = useCallback((target: string) => {
    setReady(false);
    setTimedOut(false);
    setFrameSrcPath(target);
    setReloadNonce(n => n + 1);
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      if (!readyRef.current) remount(lastPath);
    };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [lastPath, remount]);

  // Tied to the iframe's own mount (reloadNonce), not to `ready`: a stale
  // `ready` from a prior mount would otherwise suppress the timer on a fresh
  // frame that never sends its own ready.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!readyRef.current) setTimedOut(true);
    }, READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [reloadNonce]);

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
          setHelloNonce(n => n + 1);
          break;
        case 'nexus-build:navigate': {
          const nextPath = typeof data.path === 'string' ? data.path : null;
          if (nextPath && isSafeBuildPath(nextPath)) setLastPath(nextPath);
          break;
        }
        case 'nexus-build:open-external': {
          const url = typeof data.url === 'string' ? data.url : null;
          if (url) void openExternalUrl(url);
          break;
        }
        case 'nexus-build:set-case': {
          const next = data.caseId;
          if (!isValidCaseId(next)) break;
          void (async () => {
            const res = await putService<{ caseId?: string | null; error?: boolean }>('/system/case', { caseId: next });
            if (!res || res.error === true) return;
            caseTouchedRef.current = true;
            setCaseId(typeof res.caseId === 'string' && isValidCaseId(res.caseId) ? res.caseId : null);
          })();
          break;
        }
        case 'nexus-build:open-benchmark':
          onOpenBenchmarkRef.current?.();
          break;
        case 'nexus-build:set-scene':
          if (!SCENE_3D || isRemoteOrigin) break;
          void relaySceneExport(data).then(ok => post({ type: 'nexus-build:scene-saved', v: 1, ok }));
          break;
        case 'nexus-build:open-lighting':
          onOpenLightingRef.current?.();
          break;
        case 'nexus-build:history':
          setBuildFrameHistory({ canGoBack: data.canGoBack === true, canGoForward: data.canGoForward === true });
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      clearBuildFrameHistory();
    };
  }, [post]);

  const machine: BuildMachine | undefined = specs ? (() => {
    const sig = buildFpsSignatureParams(specs);
    return {
      processor: specs.processor || undefined,
      primaryGpu: primaryGpuModel(specs),
      memory: specs.memory || undefined,
      motherboard: specs.motherboard || undefined,
      storage: specs.storage || undefined,
      monitor: specs.monitor || undefined,
      res: sig?.res,
      hz: sig?.hz,
      ramGb: sig?.ramBytes != null ? Math.round(sig.ramBytes / BYTES_PER_GIB) : undefined,
      ...(caseId ? { caseId } : {}),
    };
  })() : undefined;

  const games: BuildGame[] = [...gamesByKey.values()]
    .sort((a, b) => b.focusedSec - a.focusedSec)
    .slice(0, MAX_GAMES)
    .map(g => ({ gameKey: g.gameKey, title: g.name }));

  const machineKey = machine ? JSON.stringify(machine) : '';
  const gamesKey = games.length > 0 ? JSON.stringify(games) : '';
  const lastHelloNonceRef = useRef(0);
  const lastHelloSentRef = useRef<string | null>(null);

  // Fires once per `ready` message unconditionally (a page-to-page
  // renavigation inside the frame), and again - deduped by payload - when
  // specs or the games list resolve after the handshake already ran (a slow
  // service or relay can still be fetching either at that point).
  useEffect(() => {
    if (!ready || helloNonce === 0) return;
    const payload: FrameMessage = {
      type: 'nexus-build:hello',
      v: 1,
      theme: resolvedTheme,
      accent: currentAccentColor(),
      glass: isGlassBackdrop(),
      locale: language,
      host: isRemoteOrigin ? 'web' : 'app',
      ...(onOpenBenchmark ? { canOpenBenchmark: true } : {}),
      // A scene lands in this machine's service, so only the desktop app offers it.
      ...(SCENE_3D && !isRemoteOrigin ? { canExportScene: true } : {}),
      ...(onOpenLighting ? { canOpenLighting: true } : {}),
      ...(machine ? { machine } : {}),
      ...(games.length > 0 ? { games } : {}),
    };
    const serialized = JSON.stringify(payload);
    const isNewPage = helloNonce !== lastHelloNonceRef.current;
    if (!isNewPage && serialized === lastHelloSentRef.current) return;
    lastHelloNonceRef.current = helloNonce;
    lastHelloSentRef.current = serialized;
    post(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme/locale changes post their own delta message below; this only needs to re-run on a new page or on late-arriving machine/games data
  }, [ready, helloNonce, machineKey, gamesKey, post]);

  const prevThemeRef = useRef(resolvedTheme);
  useEffect(() => {
    if (!ready || resolvedTheme === prevThemeRef.current) return;
    prevThemeRef.current = resolvedTheme;
    post({ type: 'nexus-build:theme', v: 1, theme: resolvedTheme, accent: currentAccentColor(), glass: isGlassBackdrop() });
  }, [resolvedTheme, ready, post]);

  // The accent is applied as inline custom properties on <html> and the
  // backdrop mode as its class + data-bg, so a mutation there is the moment a
  // new accent (user pick or OS push) or backdrop exists.
  const prevAccentRef = useRef(currentAccentColor());
  const prevGlassRef = useRef(isGlassBackdrop());
  useEffect(() => {
    if (!ready) return undefined;
    // The hello that opened this ready window carried the accent and backdrop
    // of that moment; changes made before it must not be mistaken for the baseline.
    prevAccentRef.current = currentAccentColor();
    prevGlassRef.current = isGlassBackdrop();
    const observer = new MutationObserver(() => {
      const accent = currentAccentColor();
      const glass = isGlassBackdrop();
      if (accent === prevAccentRef.current && glass === prevGlassRef.current) return;
      prevAccentRef.current = accent;
      prevGlassRef.current = glass;
      post({ type: 'nexus-build:theme', v: 1, theme: prevThemeRef.current, accent, glass });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-bg'] });
    return () => observer.disconnect();
  }, [ready, post]);

  const prevLangRef = useRef(language);
  useEffect(() => {
    if (!ready || language === prevLangRef.current) return;
    prevLangRef.current = language;
    post({ type: 'nexus-build:locale', v: 1, locale: language });
  }, [language, ready, post]);

  const prevPathRef = useRef(safePath);
  useEffect(() => {
    if (!ready || safePath === prevPathRef.current) return;
    prevPathRef.current = safePath;
    post({ type: 'nexus-build:route', v: 1, path: safePath });
    setLastPath(safePath);
  }, [safePath, ready, post]);

  const handleRetry = useCallback(() => {
    remount(lastPath);
  }, [remount, lastPath]);

  const openInBrowser = useCallback(() => {
    void openExternalUrl(`${BUILD_ORIGIN}${lastPath}`);
  }, [lastPath]);

  const showFallback = !ready && (offline || timedOut);

  return (
    <div className={styles.app}>
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
            allow={IFRAME_ALLOW}
            sandbox={IFRAME_SANDBOX}
            referrerPolicy="strict-origin-when-cross-origin"
            loading="eager"
          />
        )}
      </div>
    </div>
  );
}

export default BuildPage;
