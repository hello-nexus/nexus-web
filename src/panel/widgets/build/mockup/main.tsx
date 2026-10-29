/* eslint-disable i18next/no-literal-string -- throwaway mockup page, never shipped */
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { Button } from '../../../../components/common/Button/Button';
import { I18nProvider } from '../../../../lib/i18n';
import { applyAccentColor, applyThemeMode } from '../../../../lib/settings';
import { PanelPreviewProvider } from '../../common/PanelPreviewContext';
import { PanelTouchCell } from '../../../dnd/PanelDragCells';
import type { PanelWidget } from '../../../types';
import panelStyles from '../../../PanelApp.module.scss';
import '../../../../styles/variables.scss';
import '../../../../styles/global.scss';
import '../../../styles/tokens.scss';
import { CASELESS_FIXTURE_IDS, type CaselessFixtureId } from './caselessFixtures';
import styles from './mockup.module.scss';

const SETS: Record<CaselessFixtureId, string> = {
  aio: 'With an AIO',
  air: 'With an air cooler',
  few: 'Few parts detected',
};

const CELL_SIZES = [96, 120, 150] as const;
const GAP = 8;
const pointers = { onPointerDown: () => {}, onPointerMove: () => {}, onPointerUp: () => {}, onPointerCancel: () => {} };

function readQuery() {
  const q = new URLSearchParams(location.search);
  const set = q.get('set');
  return {
    set: (CASELESS_FIXTURE_IDS as readonly string[]).includes(set ?? '') ? (set as CaselessFixtureId) : 'aio',
    theme: q.get('theme') === 'light' ? ('light' as const) : ('dark' as const),
    cell: Number(q.get('cell')) || 120,
  };
}

function Mockup() {
  const [initial] = useState(readQuery);
  const [set, setSet] = useState<CaselessFixtureId>(initial.set);
  const [theme, setTheme] = useState<'light' | 'dark'>(initial.theme);
  const [cell, setCell] = useState<number>(initial.cell);
  const [opened, setOpened] = useState(0);

  useEffect(() => {
    applyThemeMode(theme);
    applyAccentColor('#7c5cff');
  }, [theme]);

  const widget = useMemo(
    () => ({ id: 'build-4x4', type: 'build', size: '4x4', col: 0, row: 0, config: { previewSet: set } }) as PanelWidget,
    [set],
  );
  const width = 4 * cell + 3 * GAP;

  return (
    <div className={styles.page}>
      <div className={styles.controls}>
        <div className={styles.group}>
          {CASELESS_FIXTURE_IDS.map(id => (
            <Button key={id} size="sm" tone={set === id ? 'accent' : 'neutral'} onClick={() => setSet(id)}>{SETS[id]}</Button>
          ))}
        </div>
        <div className={styles.group}>
          {(['dark', 'light'] as const).map(mode => (
            <Button key={mode} size="sm" tone={theme === mode ? 'accent' : 'neutral'} onClick={() => setTheme(mode)}>{mode === 'dark' ? 'Dark' : 'Light'}</Button>
          ))}
        </div>
        <div className={styles.group}>
          {CELL_SIZES.map(px => (
            <Button key={px} size="sm" tone={cell === px ? 'accent' : 'neutral'} onClick={() => setCell(px)}>{`Cell ${px}`}</Button>
          ))}
        </div>
      </div>
      <div
        className={`panel-root ${panelStyles.panelRoot}`}
        data-surface="desktop"
        data-theme={theme}
        data-show-widget-labels="true"
        style={{
          '--panel-columns': 4,
          '--panel-rows': 4,
          '--panel-cell-size': `${cell}px`,
          '--panel-row-size': `${cell}px`,
          '--panel-widget-padding': `${GAP}px`,
          width,
          height: 'auto',
          flex: 'none',
        } as React.CSSProperties}
      >
        <DndContext>
          <SortableContext items={[widget.id]}>
            <div className={panelStyles.grid}>
              <PanelPreviewProvider value>
                <PanelTouchCell
                  widget={widget}
                  surface="desktop"
                  rearranging={false}
                  onContextMenu={() => {}}
                  cellPointers={{ ...pointers, onPointerUp: () => setOpened(n => n + 1) }}
                />
              </PanelPreviewProvider>
            </div>
          </SortableContext>
        </DndContext>
      </div>
      <p className={styles.note} aria-live="polite">
        {opened === 0 ? 'Click the tile: the cell opens the Build page.' : `The Build page would open (clicks: ${opened}).`}
      </p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider initialLanguage="en">
      <Mockup />
    </I18nProvider>
  </StrictMode>,
);
