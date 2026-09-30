import classNames from 'classnames';
import { GripVertical, X } from 'lucide-react';
import { Button } from '../../components/common/Button/Button';
import { SettingSelect, SettingToggle } from '../../components/common/SettingRow/SettingRow';
import { SortableList } from '../../components/common/SortableList/SortableList';
import { useTranslation } from '../../lib/i18n';
import { SLIDESHOW_INTERVALS, slideshowIntervalLabel } from '../slideshow/slideshow';
import type { PanelWidgetPlaylist } from '../types';
import { lookupApp } from '../widgets/registry';
import styles from './WidgetPlaylistEditor.module.scss';

export interface WidgetPlaylistEditorProps {
  playlist: PanelWidgetPlaylist;
  onChange: (patch: Partial<PanelWidgetPlaylist>) => void;
  /** Opens the type's widget settings. */
  onEdit: (type: string) => void;
}

/** Order, timing and removal for a single-widget panel's playlist; the catalog below it adds entries. */
export function WidgetPlaylistEditor({ playlist, onChange, onEdit }: WidgetPlaylistEditorProps) {
  const { t, language } = useTranslation();
  const { types } = playlist;

  return (
    <div className={styles.root}>
      <SettingSelect
        label={t('slideshow.interval')}
        value={String(playlist.interval)}
        options={SLIDESHOW_INTERVALS.map(seconds => ({
          value: String(seconds),
          label: slideshowIntervalLabel(t, language, seconds),
        }))}
        onChange={value => onChange({ interval: Number(value) })}
      />
      <SettingToggle
        label={t('slideshow.shuffle')}
        checked={playlist.shuffle}
        onChange={shuffle => onChange({ shuffle })}
      />
      {types.length > 0 && (
        <SortableList
          className={styles.list}
          ariaLabel={t('panel.playlist.order')}
          ids={types}
          onReorder={next => onChange({ types: next })}
          renderRow={(type, row) => {
            const def = lookupApp(type);
            const Icon = def?.meta.icon;
            const label = (def && t(def.meta.i18nKey)) || type;
            return (
              <div
                ref={row.ref}
                role="listitem"
                style={row.style}
                {...row.attributes}
                {...row.listeners}
                className={classNames(styles.row, row.isDragging && row.placeholderClassName)}
                title={t('panel.widget.editWidget')}
                onClick={() => onEdit(type)}
              >
                <GripVertical className={styles.grip} size={16} aria-hidden />
                <span className={styles.index} aria-hidden>{types.indexOf(type) + 1}</span>
                {Icon && <span className={styles.icon}><Icon size={16} aria-hidden /></span>}
                <span className={styles.name}>{label}</span>
                <span data-no-dnd="true" onClick={event => event.stopPropagation()}>
                  <Button
                    type="button"
                    tone="ghost"
                    size="sm"
                    icon={<X />}
                    aria-label={t('panel.playlist.remove', { name: label })}
                    onClick={() => onChange({ types: types.filter(entry => entry !== type) })}
                  />
                </span>
              </div>
            );
          }}
        />
      )}
      <p className={styles.hint}>
        {t(types.length === 0 ? 'panel.playlist.empty' : types.length === 1 ? 'panel.playlist.addMore' : 'panel.playlist.hint')}
      </p>
    </div>
  );
}
