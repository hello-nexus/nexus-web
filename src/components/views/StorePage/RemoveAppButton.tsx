import { useCallback, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { useTranslation } from '../../../lib/i18n';
import { findAppUsage, removeAppEverywhere, type AppUsage } from '../../../api/storeUsage';
import { postService } from '../../../api/service';
import { loadMarketplaceApps } from '../../../widgets/marketplaceRegistry';

interface RemoveAppButtonProps {
  app: { id: string; name: string };
  onRemoved?: () => void;
  /** Button label; the confirm dialog reuses it as its confirm action. */
  label: string;
}

/**
 * Uninstall, after showing where the app is placed. The panel reconciler drops
 * orphaned widgets silently, so a user who uninstalls without being told would
 * find widgets simply missing from panels they were not thinking about.
 */
export function RemoveAppButton({ app, onRemoved, label }: RemoveAppButtonProps) {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<AppUsage | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = useCallback(async () => {
    setUsage(await findAppUsage(app.id, t('nav.dashboard')));
  }, [app.id, t]);

  const confirm = useCallback(async () => {
    setBusy(true);
    await removeAppEverywhere(app.id);
    await postService('/apps-api/uninstall', { id: app.id });
    await loadMarketplaceApps();
    setBusy(false);
    setUsage(null);
    onRemoved?.();
  }, [app.id, onRemoved]);

  // Just the place, the way the user names it. A count only when it is there
  // more than once, since "Dashboard (1)" reads like a bug.
  const bullets = (usage?.places ?? []).map(p =>
    p.count > 1 ? `${p.name} (${p.count})` : p.name);

  return (
    <>
      <Button type="button" tone="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => void ask()}>
        {label}
      </Button>
      <ConfirmModal
        open={usage !== null}
        title={t('store.removeTitle', { name: app.name })}
        message={usage && usage.total > 0 ? t('store.removeUsed') : t('store.removeUnused')}
        bullets={bullets}
        confirmLabel={label}
        confirmDisabled={busy}
        onConfirm={() => { void confirm(); }}
        onCancel={() => setUsage(null)}
      />
    </>
  );
}
