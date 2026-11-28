import { useCallback, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, type ButtonTone } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { useTranslation } from '../../../lib/i18n';
import { findAppUsage, removeAppEverywhere, type AppUsage } from '../../../api/storeUsage';
import { postService } from '../../../api/service';
import { reloadMarketplaceApps } from '../../../widgets/marketplaceRegistry';

interface RemoveAppButtonProps {
  app: { id: string; name: string };
  onRemoved?: () => void;
  /** Button label; the confirm dialog reuses it as its confirm action. */
  label: string;
  /** Renders the trash glyph alone, for a row action that has no room for a label. */
  iconOnly?: boolean;
  /** Button tone; defaults to danger. A quieter tone suits a secondary spot beside a primary action. */
  tone?: ButtonTone;
}

/**
 * Uninstall, after showing where the app is placed. The panel reconciler drops
 * orphaned widgets silently, so a user who uninstalls without being told would
 * find widgets simply missing from panels they were not thinking about.
 */
export function RemoveAppButton({ app, onRemoved, label, iconOnly, tone = 'danger' }: RemoveAppButtonProps) {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<AppUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const ask = useCallback(async () => {
    setFailed(false);
    setUsage(await findAppUsage(app.id, t('nav.dashboard')));
  }, [app.id, t]);

  const confirm = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      // Uninstall first: if the service refuses, the app's widgets are still in place.
      // A load already in flight can predate the uninstall, so the reload must not join it.
      const res = await postService<{ error?: string }>('/apps-api/uninstall', { id: app.id });
      if (!res || res.error) {
        setFailed(true);
        return;
      }
      await removeAppEverywhere(app.id);
      await reloadMarketplaceApps();
      setUsage(null);
      onRemoved?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [app.id, onRemoved]);

  // Just the place, the way the user names it. A count only when it is there
  // more than once, since "Dashboard (1)" reads like a bug.
  const bullets = (usage?.places ?? []).map(p =>
    p.count > 1 ? `${p.name} (${p.count})` : p.name);

  return (
    <>
      <Button
        type="button"
        tone={tone}
        size="sm"
        icon={<Trash2 size={14} />}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        onClick={() => void ask()}
      >
        {iconOnly ? null : label}
      </Button>
      <ConfirmModal
        open={usage !== null}
        title={t('store.removeTitle', { name: app.name })}
        message={usage && usage.total > 0 ? t('store.removeUsed') : t('store.removeUnused')}
        bullets={bullets}
        confirmLabel={label}
        confirmDisabled={busy}
        note={failed ? t('store.removeFailed', { name: app.name }) : undefined}
        // eslint-disable-next-line i18next/no-literal-string -- enum tone value, not user-facing text
        noteTone="critical"
        onConfirm={() => { void confirm(); }}
        onCancel={() => setUsage(null)}
      />
    </>
  );
}
