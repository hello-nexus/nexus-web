import { useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetSettingsProps } from '../types';
import { Slider } from '../../../components/common/Slider/Slider';
import { DesktopOnlyBadge } from '../../../components/common/DesktopOnlyBadge/DesktopOnlyBadge';
import { canEditFreeText } from '../../types';
import { SettingsHint, SettingsInput, SettingsRow, SettingsSection, SettingsSelect } from '../common/SettingsRow/SettingsRow';
import { REFRESH_CHOICES, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, resolveRefreshMinutes, resolveZoom, snapZoom } from './webViewConfig';
import { normalizeWebViewUrl } from './webViewUrl';

export function WebViewSettings({ widget, surface, desktopEditor, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const saved = typeof widget.config?.url === 'string' ? widget.config.url : '';
  const [draft, setDraft] = useState(saved);
  const normalized = normalizeWebViewUrl(draft);
  const savedZoom = resolveZoom(widget.config?.zoom);
  // The Slider is controlled, so a drag needs somewhere to land before the commit.
  const [dragZoom, setDragZoom] = useState<number | null>(null);
  const refresh = resolveRefreshMinutes(widget.config?.refreshMinutes);
  const hasKeyboard = canEditFreeText(surface, desktopEditor);
  const invalid = draft.trim() !== '' && normalized === null;

  // Saved on blur or Enter, never per keystroke: a half-typed address would
  // otherwise navigate the live view.
  const commit = () => {
    if (draft.trim() === '') {
      if (saved !== '') onUpdate({ url: '' });
      return;
    }
    if (normalized === null) return;
    setDraft(normalized);
    if (normalized !== saved) onUpdate({ url: normalized });
  };

  return (
    <>
    <SettingsSection title={t('panel.widget.web-view')} description={invalid ? t('panel.widget.web-view.settings.invalid') : t('panel.widget.web-view.settings.hint')}>
      {hasKeyboard ? (
        <SettingsRow label={t('panel.settings.url')}>
          <SettingsInput
            type="text"
            inputMode="url"
            spellCheck={false}
            value={draft}
            // eslint-disable-next-line i18next/no-literal-string -- URL format hint
            placeholder="https://example.com"
            aria-invalid={invalid}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          />
        </SettingsRow>
      ) : (
        <>
          <SettingsRow label={t('panel.settings.url')}>
            <SettingsHint>{saved}</SettingsHint>
          </SettingsRow>
          <DesktopOnlyBadge />
        </>
      )}
    </SettingsSection>
    <SettingsSection>
      <Slider
        label={t('panel.widget.web-view.settings.zoom')}
        value={dragZoom ?? savedZoom}
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={ZOOM_STEP}
        // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
        orientation="stacked"
        editable
        trackFill
        formatValue={v => t('panel.widget.web-view.settings.zoomValue', { n: v.toFixed(2) })}
        onChange={v => setDragZoom(v)}
        onCommit={v => { setDragZoom(null); onUpdate({ zoom: snapZoom(v) }); }}
      />
      <SettingsSelect
        label={t('panel.widget.web-view.settings.refresh')}
        value={String(refresh)}
        options={REFRESH_CHOICES.map(m => ({
          value: String(m),
          label: m === 0
            ? t('panel.widget.web-view.settings.refreshOff')
            : m === 1
              ? t('panel.widget.web-view.settings.refreshOne')
              : t('panel.widget.web-view.settings.refreshMany', { n: m }),
        }))}
        onChange={v => onUpdate({ refreshMinutes: resolveRefreshMinutes(Number(v)) })}
      />
    </SettingsSection>
    </>
  );
}
