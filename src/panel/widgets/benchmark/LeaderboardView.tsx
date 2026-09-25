import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Trophy, ArrowLeft } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { getBenchmarkVersions, getLeaderboard, getLastSubmissionId } from '../../../api/nexusApi';
import type { BenchmarkVersionInfo, LeaderboardEntry, LeaderboardResponse } from '../../../types/benchmark';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { Button } from '../../../components/common/Button/Button';
import { Select } from '../../../components/common/Select/Select';
import { Pager } from '../../../components/common/Pager/Pager';
import { requestOpenBuild } from '../../../components/views/BuildPage/buildNav';
import { publicProfileUrl } from '../../../lib/publicProfile';
import { DEV_TOOLS } from '../../../lib/devTools';
import { LeaderboardList } from './LeaderboardList';
import { BenchmarkEntryDetail } from './BenchmarkEntryDetail';
import styles from './LeaderboardView.module.scss';

const PAGE_SIZE = 50;

function pageScroller(): HTMLElement {
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(p).overflowY)) return p;
  }
  return pageScroller();
}

function revealTop(section: HTMLElement, scroller: HTMLElement) {
  const scrollerTop = scroller === pageScroller() ? 0 : scroller.getBoundingClientRect().top;
  const offset = section.getBoundingClientRect().top - scrollerTop;
  if (offset < 0) scroller.scrollTop += offset;
}

export function LeaderboardView() {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [scoringVersion, setScoringVersion] = useState('');
  const [page, setPage] = useState(0);
  // null = not loaded yet or the versions endpoint errored - either way the
  // filter stays hidden rather than showing an empty/broken dropdown.
  const [versions, setVersions] = useState<BenchmarkVersionInfo[] | null>(null);
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const listScrollTop = useRef<number | null>(null);
  const lastOpenedId = useRef<string | null>(null);
  const myId = getLastSubmissionId();

  const openEntry = (entry: LeaderboardEntry) => {
    if (sectionRef.current) listScrollTop.current = scrollParent(sectionRef.current).scrollTop;
    setSelected(entry);
  };

  const changePage = (next: number) => {
    setPage(next);
    if (sectionRef.current) revealTop(sectionRef.current, scrollParent(sectionRef.current));
  };

  const changeVersion = (version: string) => {
    setScoringVersion(version);
    setPage(0);
  };

  // The list is far taller than an entry page: opening a low row would leave
  // the scroller clamped past the headline, and Back would lose the row. The
  // focused element unmounts on each swap, so focus moves with the view.
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const scroller = scrollParent(section);
    if (selected) {
      lastOpenedId.current = selected.id;
      revealTop(section, scroller);
      section.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    } else if (listScrollTop.current !== null) {
      scroller.scrollTop = listScrollTop.current;
      listScrollTop.current = null;
      section.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(lastOpenedId.current ?? '')}"]`)?.focus({ preventScroll: true });
    }
  }, [selected]);

  useEffect(() => {
    void getBenchmarkVersions().then(res => setVersions(res ?? null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void getLeaderboard({ scoringVersion, limit: PAGE_SIZE, offset: page * PAGE_SIZE }).then(res => {
      if (cancelled) return;
      const lastPage = res ? Math.max(0, Math.ceil(res.total / PAGE_SIZE) - 1) : 0;
      if (res === null) {
        setError(true);
        setData(null);
      } else if (page > lastPage) {
        setPage(lastPage);
        return;
      } else {
        setData(res);
        setError(false);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [scoringVersion, page, reloadKey]);

  const showVersionSelector = versions !== null && versions.length > 0;
  const versionOptions = [
    { value: '', label: t('benchmark.leaderboard.version') },
    ...(versions ?? []).map(v => ({ value: v.scoringVersion, label: v.scoringVersion })),
  ];

  if (selected) {
    return (
      <section className={styles.leaderboard} ref={sectionRef}>
        <div className={styles.backBar}>
          <Button tone="ghost" icon={<ArrowLeft size={16} />} onClick={() => setSelected(null)}>
            {t('benchmark.detail.back')}
          </Button>
        </div>
        <BenchmarkEntryDetail
          entry={selected}
          numberFormat={numberFormat}
          ownerHref={selected.displayName ? publicProfileUrl(selected.displayName) : undefined}
          ownerNewTab
          actions={DEV_TOOLS ? (
            <>
              <Button tone="accent" onClick={() => requestOpenBuild(`/upgrade?bench=${encodeURIComponent(selected.id)}`)}>
                {t('benchmark.detail.findUpgrades')}
              </Button>
              <Button tone="ghost" onClick={() => requestOpenBuild('/builder')}>
                {t('benchmark.detail.planUpgrade')}
              </Button>
            </>
          ) : undefined}
        />
      </section>
    );
  }

  return (
    <section className={styles.leaderboard} ref={sectionRef}>
      {showVersionSelector && (
        <div className={styles.filters}>
          <label className={styles.filterLabel}>
            {t('benchmark.leaderboard.filterVersion')}
          </label>
          <Select
            value={scoringVersion}
            onChange={changeVersion}
            options={versionOptions}
            ariaLabel={t('benchmark.leaderboard.filterVersion')}
          />
        </div>
      )}

      <div className={styles.body}>
        {loading && (
          <div className={styles.loadingMsg} role="status">{t('benchmark.leaderboard.loading')}</div>
        )}

        {!loading && error && (
          <EmptyState
            icon={<Trophy size={32} />}
            title={t('benchmark.leaderboard.error')}
            action={
              <Button tone="ghost" onClick={() => setReloadKey(k => k + 1)}>
                {t('benchmark.leaderboard.retry')}
              </Button>
            }
          />
        )}

        {!loading && !error && (!data || data.entries.length === 0) && (
          <EmptyState
            icon={<Trophy size={32} />}
            title={t('benchmark.leaderboard.empty')}
          />
        )}

        {!loading && !error && data && data.entries.length > 0 && (
          <LeaderboardList entries={data.entries} ownId={myId} onOpen={openEntry} />
        )}
      </div>

      {!error && data && (
        <Pager page={page} pageCount={Math.ceil(data.total / PAGE_SIZE)} onPageChange={changePage} />
      )}
    </section>
  );
}
