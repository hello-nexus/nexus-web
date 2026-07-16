import { useCallback, useEffect, useState } from 'react';
import { Lock, SearchX, TriangleAlert } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { getPublicAccount, type PublicAccount } from '../../api/account';
import { Avatar } from '../../components/common/Avatar/Avatar';
import { Badge } from '../../components/common/Badge/Badge';
import { EmptyState } from '../../components/common/EmptyState/EmptyState';
import { Spinner } from '../../components/common/Spinner/Spinner';
import { Button } from '../../components/common/Button/Button';
import { PublicPageFrame } from './PublicPageFrame';
import { DeviceSpecsCard } from './DeviceSpecsCard';
import { PublicProfileBenchmarks } from './PublicProfileBenchmarks';
import styles from './PublicProfilePage.module.scss';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'not-found' }
  | { phase: 'loaded'; account: PublicAccount };

/** /u/<username> - public account profile page (browser-only). */
export function PublicProfilePage({ username }: { username: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });
    const controller = new AbortController();
    void getPublicAccount(username, controller.signal).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') setState({ phase: 'loaded', account: result.account });
      else if (result.status === 'not-found') setState({ phase: 'not-found' });
      else setState({ phase: 'error' });
    });
    return () => { cancelled = true; controller.abort(); };
  }, [username, retryToken]);

  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

  if (state.phase === 'loading') {
    return (
      <PublicPageFrame>
        <Spinner size={32} />
      </PublicPageFrame>
    );
  }

  if (state.phase === 'not-found') {
    return (
      <PublicPageFrame>
        <EmptyState icon={<SearchX />} title={t('publicProfile.notFound.title')} hint={t('publicProfile.notFound.hint')} />
      </PublicPageFrame>
    );
  }

  if (state.phase === 'error') {
    return (
      <PublicPageFrame>
        <EmptyState
          icon={<TriangleAlert />}
          title={t('publicProfile.error.title')}
          hint={t('publicProfile.error.hint')}
          action={<Button onClick={retry}>{t('publicProfile.error.retry')}</Button>}
        />
      </PublicPageFrame>
    );
  }

  const { account } = state;

  if (account.isPrivate) {
    return (
      <PublicPageFrame>
        <div className={styles.header}>
          <Avatar name={account.username} src={account.avatar?.large} size={96} />
          <h1 className={styles.username}>{account.username}</h1>
        </div>
        <EmptyState
          icon={<Lock />}
          title={t('publicProfile.private.title')}
          hint={t('publicProfile.private.hint', { username: account.username })}
        />
      </PublicPageFrame>
    );
  }

  const joined = new Date(account.createdAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <PublicPageFrame maxWidth={560}>
      <div className={styles.header}>
        <Avatar name={account.username} src={account.avatar?.large} size={96} />
        <h1 className={styles.username}>{account.username}</h1>
        <span className={styles.joined}>{t('publicProfile.joined', { date: joined })}</span>
      </div>
      {account.devices.length === 0 ? (
        <EmptyState title={t('publicProfile.devices.empty')} compact />
      ) : (
        <div className={styles.devices}>
          {account.devices.map((device, index) => (
            <DeviceSpecsCard
              key={`${device.hostname}-${index}`}
              hostname={device.hostname}
              specs={device.specs}
              manual={device.manual}
              lastSeenAt={device.lastSeenAt}
              badge={device.manual ? <Badge label={t('account.devices.manual.badge')} /> : undefined}
              className={styles.deviceCard}
            />
          ))}
        </div>
      )}
      <PublicProfileBenchmarks benchmarks={account.benchmarks} />
    </PublicPageFrame>
  );
}
