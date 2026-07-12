import { useState } from 'react';
import { LayoutList, LineChart } from 'lucide-react';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { DesktopOnlyBadge } from '../../../components/common/DesktopOnlyBadge/DesktopOnlyBadge';
import { useTranslation } from '../../../lib/i18n';
import { canEditFreeText } from '../../types';
import type { WidgetSettingsProps } from '../types';
import {
  SettingsHint, SettingsInput, SettingsRow, SettingsSection, SettingsSelect, SettingsToggle,
} from '../common/SettingsRow/SettingsRow';
import { DEFAULT_SYMBOLS, normalizeSymbols, resolveMode, resolvePeriod } from './stocksUtils';
import styles from './StocksSettings.module.scss';

export function StocksSettings({ widget, surface, desktopEditor, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const mode = resolveMode(widget.config?.mode);
  const period = resolvePeriod(widget.config?.period);
  const useAccentColor = ((widget.config?.useAccentColor as boolean | undefined) ?? false);
  const savedSymbols = (widget.config?.symbols as string | undefined) ?? DEFAULT_SYMBOLS;
  const [symbolsInput, setSymbolsInput] = useState(savedSymbols);
  const hasKeyboard = canEditFreeText(surface, desktopEditor);

  function commitSymbols() {
    const normalized = normalizeSymbols(symbolsInput);
    const value = normalized.length > 0 ? normalized.join(',') : DEFAULT_SYMBOLS;
    setSymbolsInput(value);
    onUpdate({ symbols: value });
  }

  return (
    <div className={styles.container}>
      <SettingsSection title={t('panel.widget.stocks.settings.style')}>
        <div className={styles.modeRow}>
          <IconLabelButton
            active={mode === 'list'}
            icon={<LayoutList aria-hidden="true" />}
            title={t('panel.widget.stocks.settings.list')}
            ariaLabel={t('panel.widget.stocks.settings.list')}
            onPress={() => onUpdate({ mode: 'list' })}
          />
          <IconLabelButton
            active={mode === 'graph'}
            icon={<LineChart aria-hidden="true" />}
            title={t('panel.widget.stocks.settings.graph')}
            ariaLabel={t('panel.widget.stocks.settings.graph')}
            onPress={() => onUpdate({ mode: 'graph' })}
          />
        </div>
        {mode === 'graph' && (
          <SettingsSelect
            label={t('panel.widget.stocks.settings.period')}
            value={period}
            options={[
              // eslint-disable-next-line i18next/no-literal-string -- enum value
              { value: '1D', label: t('panel.widget.stocks.settings.period1d') },
              // eslint-disable-next-line i18next/no-literal-string -- enum value
              { value: '1W', label: t('panel.widget.stocks.settings.period1w') },
              // eslint-disable-next-line i18next/no-literal-string -- enum value
              { value: '1M', label: t('panel.widget.stocks.settings.period1m') },
              // eslint-disable-next-line i18next/no-literal-string -- enum value
              { value: '3M', label: t('panel.widget.stocks.settings.period3m') },
              // eslint-disable-next-line i18next/no-literal-string -- enum value
              { value: '1Y', label: t('panel.widget.stocks.settings.period1y') },
            ]}
            onChange={value => onUpdate({ period: value })}
          />
        )}
        <SettingsToggle
          label={t('panel.widget.stocks.settings.useAccentColor')}
          checked={useAccentColor}
          onChange={checked => onUpdate({ useAccentColor: checked })}
        />
      </SettingsSection>

      <SettingsSection title={t('panel.widget.stocks.settings.symbols')}>
        {hasKeyboard ? (
          <>
            <SettingsRow label={t('panel.widget.stocks.settings.symbols')}>
              <SettingsInput
                type="text"
                value={symbolsInput}
                onChange={e => setSymbolsInput(e.target.value)}
                onBlur={commitSymbols}
                placeholder={DEFAULT_SYMBOLS}
              />
            </SettingsRow>
            <SettingsHint>{t('panel.widget.stocks.settings.symbolsHint')}</SettingsHint>
          </>
        ) : (
          <DesktopOnlyBadge />
        )}
      </SettingsSection>
    </div>
  );
}

export default StocksSettings;
