import { useState, useRef, useEffect } from 'react';
import { Share2, Link, FileText } from 'lucide-react';
import type { Build } from '../../../types/builder';
import { BUILDER_CATEGORIES, CATEGORY_LABELS } from '../../../types/builder';
import { encodeBuild } from '../../../lib/buildCodec';
import { useTranslation } from '../../../lib/i18n';
import styles from './BuildShare.module.scss';

interface BuildShareProps {
  build: Build;
}

function generateRedditTable(build: Build): string {
  const lines: string[] = [];
  lines.push('| Component | Selection | Price |');
  lines.push('|---|---|---|');

  for (const cat of BUILDER_CATEGORIES) {
    const entries = build.slots[cat] ?? [];
    for (const entry of entries) {
      if (entry.selection) {
        const label = CATEGORY_LABELS[cat];
        const name = entry.selection.title;
        const price = entry.selection.bestPrice != null
          ? `$${entry.selection.bestPrice.toFixed(2)}`
          : '-';
        lines.push(`| ${label} | ${name} | ${price} |`);
      }
    }
  }

  return lines.join('\n');
}

export function BuildShare({ build }: BuildShareProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const copyUrl = async () => {
    const encoded = encodeBuild(build);
    const url = `${window.location.origin}${window.location.pathname}#builder?b=${encoded}`;
    await navigator.clipboard.writeText(url);
    setCopied('url');
    setTimeout(() => setCopied(null), 2000);
  };

  const copyReddit = async () => {
    const table = generateRedditTable(build);
    await navigator.clipboard.writeText(table);
    setCopied('reddit');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className={styles.wrapper} ref={ref}>
      <button type="button" className={styles.shareBtn} onClick={() => setOpen(o => !o)}>
        <Share2 size={16} />
        <span>{t('builder.share')}</span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          <button type="button" className={styles.dropItem} onClick={copyUrl}>
            <Link size={14} />
            <span>{copied === 'url' ? t('builder.copied') : t('builder.copy_url')}</span>
          </button>
          <button type="button" className={styles.dropItem} onClick={copyReddit}>
            <FileText size={14} />
            <span>{copied === 'reddit' ? t('builder.copied') : t('builder.copy_reddit')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
