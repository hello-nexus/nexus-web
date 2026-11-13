import { useEffect, useState, type CSSProperties } from 'react';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../src/components/common/Button/Button';
import { Toggle } from '../src/components/common/Toggle/Toggle';
import { Slider } from '../src/components/common/Slider/Slider';
import { Select } from '../src/components/common/Select/Select';
import { Tabs } from '../src/components/common/Tabs/Tabs';
import { TextInput } from '../src/components/common/TextInput/TextInput';
import { ChipGroup } from '../src/components/common/ChipGroup/ChipGroup';
import { SettingsSection } from '../src/components/common/SettingsSection/SettingsSection';
import { SettingRow, SettingToggle } from '../src/components/common/SettingRow/SettingRow';
import { ToastProvider, useToast } from '../src/components/common/Toast/Toast';
import { ConfirmModal } from '../src/components/common/ConfirmModal/ConfirmModal';
import { HoverTooltip } from '../src/components/common/HoverTooltip/HoverTooltip';
import { PanelPageIndicator } from '../src/panel/chrome/PanelPageIndicator';
import { WidgetContextMenu } from '../src/panel/widgets/common/WidgetContextMenu';
import { usePanelSkinAttrs } from '../src/components/common/ThemeScope/PanelSkinScope';

// The panel's own chrome over a dimmed stage: a drawer of real shared
// controls, a real widget context menu, a toast, page dots, and with ?open=1
// a Select menu and a confirm dialog (portaled through the skin host).
const FONTS = [{ value: 'a', label: 'Lexend' }, { value: 'b', label: 'Jura' }, { value: 'c', label: 'Tektur' }];

function Toasts() {
  const { push } = useToast();
  useEffect(() => { push({ title: 'Layout saved', body: 'Synced to the panel', durationMs: 600000 }); }, [push]);
  return null;
}

export function ChromeScene({ open, themeMode, themeVars }: { open: boolean; themeMode: 'dark' | 'light'; themeVars: CSSProperties }) {
  const skinAttrs = usePanelSkinAttrs();
  const [on, setOn] = useState(true);
  const [v, setV] = useState(60);
  const [tab, setTab] = useState('a');
  const [font, setFont] = useState('a');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>('[data-chrome-select] button')?.click();
      setConfirm(true);
    }, 400);
    return () => window.clearTimeout(id);
  }, [open]);
  return (
    <ToastProvider>
      <Toasts />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end' }}>
        <div className="panel-root" {...skinAttrs} data-theme={themeMode} data-surface="phone"
          style={{ ...themeVars, position: 'relative', width: 250, height: '100%', background: 'var(--backdrop-base)', borderLeft: '1px solid var(--panel-border)', color: 'var(--text)', padding: 10, boxSizing: 'border-box', overflow: 'hidden' }}
          data-skin-part="surface">
          <Tabs tabs={[{ key: 'a', label: 'Widget' }, { key: 'b', label: 'Theme' }]} activeKey={tab} onChange={setTab} fullWidth ariaLabel="Sheet" />
          <SettingsSection title="Controls">
            <SettingToggle label="Enabled" checked={on} onChange={setOn} />
            <SettingRow label="Off"><Toggle checked={false} onChange={() => {}} ariaLabel="Off" /></SettingRow>
            <SettingRow label="Disabled" disabled><Toggle checked onChange={() => {}} disabled ariaLabel="Disabled" /></SettingRow>
            <Slider label="Level" value={v} min={0} max={100} onChange={setV} trackFill />
            <span data-chrome-select><Select value={font} onChange={setFont} options={FONTS} ariaLabel="Font" /></span>
            <TextInput value="Panel name" ariaLabel="Name" />
            <ChipGroup ariaLabel="Mode" activeKey="a" onChange={() => {}} options={[{ key: 'a', label: 'Dark' }, { key: 'b', label: 'Light', disabled: true }]} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <Button tone="accent" size="sm">Save</Button>
              <Button size="sm">Cancel</Button>
              <Button tone="danger" size="sm" disabled>Delete</Button>
            </div>
          </SettingsSection>
        </div>
      </div>
      <WidgetContextMenu
        x={40}
        y={60}
        title="Monitoring"
        themeMode={themeMode}
        themeStyle={themeVars}
        surface="phone"
        hasConfig
        onEdit={() => {}}
        onRemove={() => {}}
        items={[{ key: 'c', label: 'Copy', icon: Copy, onSelect: () => {} }, { key: 'e', label: 'Rename', icon: Pencil, onSelect: () => {} }, { key: 'd', label: 'Delete', icon: Trash2, onSelect: () => {} }]}
        onClose={() => {}}
      />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 8, display: 'flex', justifyContent: 'center' }}>
        <PanelPageIndicator total={4} active={1} onSelect={() => {}} />
      </div>
      <HoverTooltip title="Tip" body="Hover text"><span style={{ position: 'absolute', left: 8, top: 8, width: 1, height: 1 }} /></HoverTooltip>
      <ConfirmModal open={confirm} title="Remove widget?" message="This cannot be undone." confirmLabel="Remove" cancelLabel="Cancel" onConfirm={() => setConfirm(false)} onCancel={() => setConfirm(false)} />
    </ToastProvider>
  );
}
