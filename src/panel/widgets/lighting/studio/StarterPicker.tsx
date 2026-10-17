import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../../../../components/common/Button/Button';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import { EffectCard } from '../../../../components/common/EffectCard/EffectCard';
import { Popover } from '../../../../components/common/Popover/Popover';
import { SearchInput } from '../../../../components/common/SearchInput/SearchInput';
import { useTranslation } from '../../../../lib/i18n';
import { matchesAllWords } from '../../../../search/match';
import { renderRecipeStill } from './recipePreview';
import { STARTER_GROUPS, STUDIO_STARTERS } from './studioRecipes';
import pageStyles from '../LightingPage.module.scss';
import styles from './ShaderStudio.module.scss';

// Layout enum, not display text; hoisted so the JSX carries no literal.
const POPUP = 'dialog' as const;

// Stills come from the one shared WebGL context, a few frames apart so opening the picker never stalls.
const stillCache = new Map<string, string | null>();

// Each still compiles and links a shader, so they are spaced out rather than rendered back to back.
const STILL_GAP_MS = 90;

function useStarterStills(open: boolean): ReadonlyMap<string, string | null> {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!open) return;
    // A still that failed to render is not remembered, so the next open tries it again.
    const pending = STUDIO_STARTERS.filter(s => !stillCache.get(s.id));
    let timer = 0;
    const next = () => {
      const starter = pending.shift();
      if (!starter) return;
      const url = renderRecipeStill(starter.build());
      if (url) {
        stillCache.set(starter.id, url);
        bump(n => n + 1);
      }
      timer = window.setTimeout(next, STILL_GAP_MS);
    };
    timer = window.setTimeout(next, 0);
    return () => window.clearTimeout(timer);
  }, [open]);
  return stillCache;
}

/** The Studio's starters as a grid of small previews under the Lighting page's category headers, with a search on top. */
export function StarterPicker({ disabled, onPick }: { disabled?: boolean; onPick: (id: string) => void }) {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const stills = useStarterStills(open);
  const bodyRef = useRef<HTMLDivElement>(null);
  // The popover mounts its content after the click, so the search takes focus on the next frame.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => bodyRef.current?.querySelector('input')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const searching = query.trim() !== '';

  const groups = useMemo(() => STARTER_GROUPS
    .map(g => ({
      key: g.key,
      ids: g.ids.filter(id => matchesAllWords(query, [t(`lighting.studio.starter.${id}`), t(`lighting.category.${g.key}`)])),
    }))
    .filter(g => g.ids.length > 0), [query, t]);

  const close = () => { setOpen(false); setQuery(''); };
  // Escape closes only the picker: the Studio's own Escape (which would close it) listens on the document.
  const onEscape = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  };
  const toggle = (key: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div ref={anchorRef} className={styles.starterAnchor}>
      <Button
        size="sm" disabled={disabled} aria-haspopup={POPUP} aria-expanded={open}
        icon={<ChevronDown size={14} />} onClick={() => (open ? close() : setOpen(true))}
      >
        {t('lighting.studio.starters')}
      </Button>
      <Popover portal open={open} onClose={close} anchorRef={anchorRef} placement="bottom-start" className={styles.starterPopover} ariaLabel={t('lighting.studio.starters')}>
        <div ref={bodyRef} onKeyDown={onEscape}>
          <SearchInput
          value={query} onChange={setQuery}
          placeholder={t('lighting.effects.search')} ariaLabel={t('lighting.effects.search')}
          />
        </div>
        <div className={styles.starterScroll}>
          {groups.map(g => (
            <CollapsibleSection
              key={g.key} compact title={t(`lighting.category.${g.key}`)}
              open={searching || !collapsed.has(g.key)} onToggle={() => toggle(g.key)}
            >
              <div className={pageStyles.animateGridSection}>
                {g.ids.map(id => (
                  <EffectCard
                    key={id} overlay label={t(`lighting.studio.starter.${id}`)} thumbUrl={stills.get(id) ?? null}
                    thumbStatic={false} active={false}
                    onClick={() => { close(); onPick(id); }}
                  />
                ))}
              </div>
            </CollapsibleSection>
          ))}
          {searching && groups.length === 0 && <p className={pageStyles.browserHint}>{t('lighting.effects.noMatches')}</p>}
        </div>
      </Popover>
    </div>
  );
}
