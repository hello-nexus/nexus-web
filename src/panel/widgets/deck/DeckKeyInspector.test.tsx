import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Lock, Power } from 'lucide-react';
import { makePhysicalDeckTarget, makeWidgetDeckTarget } from './deckTarget';
import type { PanelWidget } from '../types';
import type { PanelSurface } from '../../types';
import type { DeckConfig, DeckSlot } from './types';

vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));
vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  isRelayActive: vi.fn(() => false),
  isDirectActive: vi.fn(() => false),
  pickSystemPath: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('../../../app/windowActions', () => ({
  isWindowsAppShell: vi.fn(() => false),
  isMacAppShell: vi.fn(() => false),
}));

import { isDirectActive, isRelayActive, pickSystemPath } from '../../../api/service';
import { isMacAppShell, isWindowsAppShell } from '../../../app/windowActions';

// A minimal, deterministic sensor fixture: 'quick' and 'cpu' each carry one
// sensor (so both categories stay visible under visibleDeviceKeys' "0
// sensors -> hidden" rule); gpu/memory/motherboard/storage stay empty.
vi.mock('../../../hooks/useSensors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useSensors')>();
  return {
    ...actual,
    useSensors: () => ({
      summary: [
        { id: 'summary/cpu-usage', name: 'CPU Usage', type: 'Load', value: 10, units: '%', formatted: '10 %', parent: { id: 'summary', name: 'Quick' } },
      ],
      cpu: [
        { id: 'cpu/load/0', name: 'CPU Total', type: 'Load', value: 12, units: '%', formatted: '12 %', parent: { id: 'cpu', name: 'CPU' } },
      ],
      gpu: [], gpuModel: '', gpuComponents: [],
      memory: [], storage: [], storageComponents: {}, storageSensors: [],
      motherboard: [],
      motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
    }),
  };
});

import { DeckKeyInspector, defaultActionFor, pickerKindIcon } from './DeckKeyInspector';

describe('defaultActionFor - new Stream Deck action kinds', () => {
  it('deckBrightness defaults to op set at 50%', () => {
    expect(defaultActionFor('deckBrightness')).toEqual({ type: 'deckBrightness', op: 'set', value: 50 });
  });
  it('deckSleep has no params', () => {
    expect(defaultActionFor('deckSleep')).toEqual({ type: 'deckSleep' });
  });
  it('hotkeySwitch defaults to two empty hotkey slots', () => {
    expect(defaultActionFor('hotkeySwitch')).toEqual({ type: 'hotkeySwitch', keysA: '', keysB: '' });
  });
});

/**
 * DeckKeyInspector is a controlled view over `target.config` - it has no
 * internal slot state, so a bare `vi.fn()` updateSlot mock never reflects
 * back into a re-render. This harness uses the real makePhysicalDeckTarget
 * (the same factory StreamDeckDevicePage uses) over a useState-backed config
 * so picker interactions round-trip exactly like production.
 */
function Harness({ initialSlots, surface, desktopEditor }: { initialSlots: DeckSlot[]; surface?: PanelSurface; desktopEditor?: boolean }) {
  const [config, setConfig] = useState<DeckConfig>({ pages: [{ slots: initialSlots }] });
  const target = makePhysicalDeckTarget(2, 1, initialSlots.length, config, setConfig);
  return (
    <DeckKeyInspector
      target={target}
      page={0}
      folderPath={[]}
      onFolderPathChange={() => {}}
      selectedSlot={0}
      onSelectedSlotChange={() => {}}
      surface={surface}
      desktopEditor={desktopEditor}
    />
  );
}

function renderInspector(slots: DeckSlot[] = [{}]) {
  return render(<Harness initialSlots={slots} />);
}

/** Same round-tripping contract as Harness, but over a touch-widget target (the
 * one editing surface with no physical Stream Deck to actually apply
 * deckBrightness/deckSleep). */
function WidgetHarness({ initialSlots }: { initialSlots: DeckSlot[] }) {
  const [widget, setWidget] = useState<PanelWidget>({
    id: 'w1', type: 'deck', size: '2x2', col: 0, row: 0,
    config: { deck: { pages: [{ slots: initialSlots }] } as never },
  });
  const target = makeWidgetDeckTarget(widget, patch => setWidget(w => ({ ...w, config: { ...w.config, ...patch } })));
  return (
    <DeckKeyInspector
      target={target}
      page={0}
      folderPath={[]}
      onFolderPathChange={() => {}}
      selectedSlot={0}
      onSelectedSlotChange={() => {}}
    />
  );
}

function renderWidgetInspector(slots: DeckSlot[] = [{}]) {
  render(<WidgetHarness initialSlots={slots} />);
}

function isBefore(a: Element, b: Element): boolean {
  return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('DeckKeyInspector section order', () => {
  it('renders Action, Icon, Title top to bottom', () => {
    // Icon + Title only appear once the slot has an action assigned.
    renderInspector([{ action: { type: 'hotkey', keys: '' } }]);
    const action = screen.getByText('panel.settings.deck.actionType');
    const icon = screen.getByText('panel.settings.icon');
    const iconColor = screen.getByText('panel.settings.deck.color'); // "Icon Color", folded into the Icon box
    const title = screen.getByText('panel.settings.deck.titleStyle.section');
    expect(isBefore(action, icon)).toBe(true);
    expect(isBefore(icon, iconColor)).toBe(true);
    expect(isBefore(iconColor, title)).toBe(true);
  });
});

describe('DeckKeyInspector action picker - collapsible category list', () => {
  it('starts with the current kind\'s category expanded and highlights the active kind', () => {
    renderInspector([{ action: { type: 'hotkey', keys: '' } }]);
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.hotkey' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.launchApp' })).toHaveAttribute('aria-selected', 'false');
  });

  it('shows every category expanded by default', () => {
    renderInspector([{ action: { type: 'hotkey', keys: '' } }]);
    // Every category starts expanded, so a Stream Deck category action is
    // present without first clicking its header.
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.deckBrightness' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.deckSleep' })).toBeInTheDocument();
  });

  it('clicking a kind entry selects that action and updates the highlight', () => {
    renderInspector();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.action.hotkey' }));

    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.hotkey' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('panel.settings.deck.hotkey')).toBeInTheDocument();
  });

  it('shows the generic Power icon for the power picker row, not its lock sub-op default', () => {
    expect(pickerKindIcon('power')).toBe(Power);
    expect(pickerKindIcon('power')).not.toBe(Lock);
  });

  it('offers a Stream Deck category containing Deck Brightness and Deck Sleep on a physical target', () => {
    renderInspector();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.category.streamdeck' })).toBeInTheDocument();
  });

  it('deckBrightness shows a value slider for op "set" and swaps to a step field for "up"/"down"', () => {
    renderInspector([{ action: { type: 'deckBrightness', op: 'set', value: 50 } }]);
    expect(screen.getByRole('slider', { name: 'panel.settings.deck.value' })).toBeInTheDocument();
    expect(screen.queryByText('panel.settings.deck.step')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.deckBrightnessOp' }));
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.deckBrightness.up' }));

    expect(screen.getByText('panel.settings.deck.step')).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'panel.settings.deck.value' })).toBeNull();
  });

  it('deckSleep renders only a description line, no params', () => {
    renderInspector([{ action: { type: 'deckSleep' } }]);
    expect(screen.getByText('panel.settings.deck.deckSleepDescription')).toBeInTheDocument();
  });

  it('offers Hotkey Switch in the System category with two independently capturable hotkey inputs', () => {
    renderInspector([{ action: { type: 'hotkeySwitch', keysA: '', keysB: '' } }]);

    expect(screen.getByText('panel.settings.deck.hotkeySwitch.firstPress')).toBeInTheDocument();
    expect(screen.getByText('panel.settings.deck.hotkeySwitch.secondPress')).toBeInTheDocument();
    const captureButtons = screen.getAllByText('panel.settings.deck.hotkeySet');
    expect(captureButtons).toHaveLength(2);

    fireEvent.click(captureButtons[0]);
    fireEvent.keyDown(captureButtons[0], { code: 'KeyM', ctrlKey: true });
    expect(screen.getByText('ctrl+m')).toBeInTheDocument();
    // Second slot is untouched.
    expect(screen.getByText('panel.settings.deck.hotkeySet')).toBeInTheDocument();
  });

  it('lists Hotkey Switch inside the System category (open by default for a launchApp slot)', () => {
    renderInspector();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.hotkeySwitch' })).toBeInTheDocument();
  });
});

describe('DeckKeyInspector - text action', () => {
  it('renders only the text field, no paste toggle', () => {
    const { container } = renderInspector([{ action: { type: 'text', text: 'hello' } }]);
    expect(screen.getByText('panel.settings.deck.text')).toBeInTheDocument();
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('hello');
    expect(screen.queryByText('panel.settings.deck.paste')).toBeNull();
  });

  it('updating the text field persists the new value', () => {
    const { container } = renderInspector([{ action: { type: 'text', text: '' } }]);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'typed' } });
    expect(textarea.value).toBe('typed');
  });
});

describe('DeckKeyInspector - deckBrightness/deckSleep are physical-deck-only', () => {
  it('hides the Stream Deck category entirely on a touch-widget target', () => {
    renderWidgetInspector();

    expect(screen.queryByRole('button', { name: 'panel.settings.deck.category.streamdeck' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.action.deckBrightness' })).toBeNull();
    // Every other category is still offered - only the physical-only one is gone.
    expect(screen.getByRole('button', { name: 'panel.settings.deck.category.system' })).toBeInTheDocument();
  });

  it('omits deckBrightness/deckSleep from a nested sequence step on a widget target', () => {
    renderWidgetInspector();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.action.sequence' }));

    fireEvent.click(screen.getByText('panel.settings.deck.sequence.addStep'));
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.actionType' }));

    expect(screen.queryByRole('option', { name: 'panel.settings.deck.action.deckBrightness' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.action.deckSleep' })).toBeNull();
    // hotkeySwitch works everywhere (best-effort on the widget), so the step's
    // own Select popup (an <li>, unlike the top-level category list's <button>
    // entries) still offers it.
    const hotkeySwitchOptions = screen.getAllByRole('option', { name: 'panel.settings.deck.action.hotkeySwitch' });
    expect(hotkeySwitchOptions.some(o => o.tagName === 'LI')).toBe(true);
  });

  it('still offers the Stream Deck category on a physical target', () => {
    renderInspector();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.category.streamdeck' })).toBeInTheDocument();
  });
});

describe('DeckKeyInspector title style section', () => {
  it('defaults to Show title off, disabling the rest of the title style controls', () => {
    renderInspector([{ action: { type: 'hotkey', keys: '' }, label: 'Hi' }]);
    expect(screen.getByRole('switch', { name: 'panel.settings.deck.titleStyle.show' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.bold' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.alignTop' })).toBeDisabled();
  });

  it('turning Show title on enables the title style controls', () => {
    renderInspector([{ action: { type: 'hotkey', keys: '' }, label: 'Hi' }]);
    fireEvent.click(screen.getByRole('switch', { name: 'panel.settings.deck.titleStyle.show' }));

    expect(screen.getByRole('switch', { name: 'panel.settings.deck.titleStyle.show' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.bold' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.alignTop' })).not.toBeDisabled();
  });

  it('picking Bold toggles it active', () => {
    renderInspector([{ action: { type: 'hotkey', keys: '' }, label: 'Hi', title: { show: true } }]);
    const bold = screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.bold' });
    expect(bold).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(bold);
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.bold' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('picking an alignment marks it active', () => {
    renderInspector([{ action: { type: 'hotkey', keys: '' }, label: 'Hi', title: { show: true } }]);
    // Middle is the default.
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.alignMiddle' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.alignTop' }));
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.alignTop' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.alignMiddle' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders an Auto swatch for both the key color and the title text color', () => {
    renderInspector([{ action: { type: 'hotkey', keys: '' }, label: 'Hi' }]);
    // One "Auto" swatch for the key's background color (existing section) and
    // one for the title's text color (new section) - both default-selected.
    expect(screen.getAllByText('panel.settings.deck.colorAuto')).toHaveLength(2);
  });
});

const MONITORING_ACTION = {
  type: 'monitoring' as const, category: 'cpu' as const, sensor: 'cpu/load/0', style: 'line' as const, showName: true, press: 'none' as const,
};

describe('DeckKeyInspector - monitoring action', () => {
  it('offers Monitoring inside the Nexus category on both physical and widget targets', () => {
    renderInspector();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.monitoring' })).toBeInTheDocument();
    renderWidgetInspector();
    expect(screen.getAllByRole('option', { name: 'panel.settings.deck.action.monitoring' }).length).toBeGreaterThan(0);
  });

  it('picking Monitoring assigns the default action shape and self-heals a concrete sensor id', async () => {
    renderInspector();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.action.monitoring' }));

    // The action box title AND the still-visible picker entry both show this
    // text (the picker highlights the now-active kind), so both match.
    expect(screen.getAllByText('panel.settings.deck.action.monitoring').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.monitoringStyleOp' }));
    expect(screen.getByRole('option', { name: 'panel.settings.deck.monitoringStyle.line' })).toHaveAttribute('aria-selected', 'true');

    // defaultActionFor seeds category 'cpu' with sensor: '' - the mocked cpu
    // sensor list has exactly one entry, which the self-heal effect writes in.
    expect(await screen.findByText('Total (Load)')).toBeInTheDocument();
  });

  it('switching category resets the sensor to the first option of the new category', async () => {
    renderInspector([{ action: MONITORING_ACTION }]);
    expect(await screen.findByText('Total (Load)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.device' }));
    fireEvent.click(screen.getByRole('option', { name: 'monitoring.settings.category.quick' }));

    expect(await screen.findByText('CPU Usage')).toBeInTheDocument();
    expect(screen.queryByText('Total (Load)')).toBeNull();
  });

  it('changing style persists the new value', () => {
    renderInspector([{ action: MONITORING_ACTION }]);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.monitoringStyleOp' }));
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.monitoringStyle.backdrop' }));

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.monitoringStyleOp' }));
    expect(screen.getByRole('option', { name: 'panel.settings.deck.monitoringStyle.backdrop' })).toHaveAttribute('aria-selected', 'true');
  });

  it('offers all four styles: line, segments, backdrop, number', () => {
    renderInspector([{ action: MONITORING_ACTION }]);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.monitoringStyleOp' }));
    expect(screen.getByRole('option', { name: 'panel.settings.deck.monitoringStyle.line' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.monitoringStyle.segments' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.monitoringStyle.backdrop' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.monitoringStyle.number' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.monitoringStyle.radial' })).toBeNull();
  });

  it('changing the on-press action persists the new value', () => {
    renderInspector([{ action: MONITORING_ACTION }]);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.monitoringPressOp' }));
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.monitoringPress.taskManager' }));

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.monitoringPressOp' }));
    expect(screen.getByRole('option', { name: 'panel.settings.deck.monitoringPress.taskManager' })).toHaveAttribute('aria-selected', 'true');
  });

  it('toggling Show name off disables the reused title-style controls', () => {
    renderInspector([{ action: MONITORING_ACTION }]);
    expect(screen.getByRole('switch', { name: 'panel.settings.deck.monitoringShowName' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.bold' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('switch', { name: 'panel.settings.deck.monitoringShowName' }));

    expect(screen.getByRole('switch', { name: 'panel.settings.deck.monitoringShowName' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.bold' })).toBeDisabled();
  });

  it('hides the generic Icon picker and the Show-title/align/underline controls, showing a Background swatch instead', () => {
    renderInspector([{ action: MONITORING_ACTION }]);
    expect(screen.queryByText('panel.settings.icon')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'panel.settings.deck.titleStyle.show' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.titleStyle.alignTop' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.titleStyle.underline' })).toBeNull();
    expect(screen.getByText('panel.settings.deck.monitoringBackground')).toBeInTheDocument();
  });

  it('carries a separate accent-color swatch row from the background and name-color swatches', () => {
    renderInspector([{ action: MONITORING_ACTION }]);
    // Three independent color swatch rows, each defaulting to Auto: the tile
    // background (slot.color), the graph/arc accent (action.color), and the
    // name's text color (slot.title.color, via the reused TitleFields).
    expect(screen.getAllByText('panel.settings.deck.colorAuto')).toHaveLength(3);
  });
});

describe('DeckKeyInspector action picker - search', () => {
  it('filters kinds by localized label and hides categories with zero matches', () => {
    renderInspector();
    fireEvent.change(screen.getByRole('textbox', { name: 'panel.settings.deck.actionSearch' }), { target: { value: 'hotkey' } });

    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.hotkey' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.hotkeySwitch' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'panel.settings.deck.action.launchApp' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.category.navigation' })).toBeNull();
  });

  it('clearing the search restores every category', () => {
    renderInspector();
    const search = screen.getByRole('textbox', { name: 'panel.settings.deck.actionSearch' });
    fireEvent.change(search, { target: { value: 'hotkey' } });
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.launchApp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.category.navigation' })).toBeInTheDocument();
  });

  it('hides the search bar on a keyboard-less surface (Y70)', () => {
    render(<Harness initialSlots={[{}]} surface="y70" />);
    expect(screen.queryByRole('textbox', { name: 'panel.settings.deck.actionSearch' })).toBeNull();
    // Every action is still offered - only the search affordance is gone.
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.launchApp' })).toBeInTheDocument();
  });

  it('shows the search bar on Y70 when desktopEditor is set (the routed device-page split editor)', () => {
    render(<Harness initialSlots={[{}]} surface="y70" desktopEditor />);
    expect(screen.getByRole('textbox', { name: 'panel.settings.deck.actionSearch' })).toBeInTheDocument();
  });
});

describe('DeckKeyInspector - openFile/openFolder Browse button', () => {
  afterEach(() => {
    vi.mocked(isWindowsAppShell).mockReturnValue(false);
    vi.mocked(isMacAppShell).mockReturnValue(false);
    vi.mocked(isRelayActive).mockReturnValue(false);
    vi.mocked(isDirectActive).mockReturnValue(false);
  });

  it('hides Browse in a plain browser tab (no app shell)', () => {
    renderInspector([{ action: { type: 'openFile', path: '' } }]);
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.browse' })).toBeNull();
  });

  it('shows Browse inside the Windows app shell', () => {
    vi.mocked(isWindowsAppShell).mockReturnValue(true);
    renderInspector([{ action: { type: 'openFile', path: '' } }]);
    expect(screen.getByRole('button', { name: 'panel.settings.deck.browse' })).toBeInTheDocument();
  });

  it('shows Browse inside the macOS app shell', () => {
    vi.mocked(isMacAppShell).mockReturnValue(true);
    renderInspector([{ action: { type: 'openFolder', path: '' } }]);
    expect(screen.getByRole('button', { name: 'panel.settings.deck.browse' })).toBeInTheDocument();
  });

  it('hides Browse over an active relay session even inside the app shell', () => {
    vi.mocked(isWindowsAppShell).mockReturnValue(true);
    vi.mocked(isRelayActive).mockReturnValue(true);
    renderInspector([{ action: { type: 'openFile', path: '' } }]);
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.browse' })).toBeNull();
  });

  it('hides Browse over an active direct-connect session even inside the app shell', () => {
    vi.mocked(isWindowsAppShell).mockReturnValue(true);
    vi.mocked(isDirectActive).mockReturnValue(true);
    renderInspector([{ action: { type: 'openFile', path: '' } }]);
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.browse' })).toBeNull();
  });

  it('hides Browse on a keyboard-less surface (Y70) even inside the app shell', () => {
    vi.mocked(isWindowsAppShell).mockReturnValue(true);
    render(<Harness initialSlots={[{ action: { type: 'openFile', path: '' } }]} surface="y70" />);
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.browse' })).toBeNull();
  });

  it('passes folder=false for openFile and fills the input with the picked path', async () => {
    vi.mocked(isWindowsAppShell).mockReturnValue(true);
    vi.mocked(pickSystemPath).mockResolvedValueOnce('C:\\Users\\me\\notes.txt');
    renderInspector([{ action: { type: 'openFile', path: '' } }]);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.browse' }));

    expect(await screen.findByDisplayValue('C:\\Users\\me\\notes.txt')).toBeInTheDocument();
    expect(vi.mocked(pickSystemPath)).toHaveBeenCalledWith(false);
  });

  it('passes folder=true for openFolder', async () => {
    vi.mocked(isWindowsAppShell).mockReturnValue(true);
    vi.mocked(pickSystemPath).mockResolvedValueOnce('C:\\Users\\me\\Documents');
    renderInspector([{ action: { type: 'openFolder', path: '' } }]);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.browse' }));

    await waitFor(() => expect(vi.mocked(pickSystemPath)).toHaveBeenCalledWith(true));
  });

  it('a cancelled dialog leaves the existing path untouched', async () => {
    vi.mocked(isWindowsAppShell).mockReturnValue(true);
    vi.mocked(pickSystemPath).mockResolvedValueOnce(null);
    renderInspector([{ action: { type: 'openFolder', path: 'C:\\existing' } }]);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.browse' }));
    await waitFor(() => expect(vi.mocked(pickSystemPath)).toHaveBeenCalled());

    expect(screen.getByDisplayValue('C:\\existing')).toBeInTheDocument();
  });

  it('the path input stays hand-editable after Browse renders', () => {
    vi.mocked(isWindowsAppShell).mockReturnValue(true);
    renderInspector([{ action: { type: 'openFile', path: '' } }]);

    const input = document.querySelector('[class*=pathRow] input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'C:\\typed\\path.txt' } });
    expect(screen.getByDisplayValue('C:\\typed\\path.txt')).toBeInTheDocument();
  });

  it('disables Browse while the dialog is open, re-enabling once it resolves', async () => {
    vi.mocked(isWindowsAppShell).mockReturnValue(true);
    let resolvePick: (path: string | null) => void = () => {};
    vi.mocked(pickSystemPath).mockReturnValueOnce(new Promise(resolve => { resolvePick = resolve; }));
    renderInspector([{ action: { type: 'openFile', path: '' } }]);

    const browse = screen.getByRole('button', { name: 'panel.settings.deck.browse' });
    fireEvent.click(browse);
    expect(browse).toBeDisabled();

    resolvePick(null);
    await waitFor(() => expect(browse).not.toBeDisabled());
  });
});
