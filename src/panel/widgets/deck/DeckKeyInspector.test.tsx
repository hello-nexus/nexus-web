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
vi.mock('../../../api/weather', () => ({
  geocodeWeatherLocations: vi.fn(() => Promise.resolve({ results: [] })),
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
function Harness({ initialSlots, surface, desktopEditor, part, onDeleteSlot }: {
  initialSlots: DeckSlot[]; surface?: PanelSurface; desktopEditor?: boolean; part?: 'all' | 'picker' | 'editor'; onDeleteSlot?: () => void;
}) {
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
      part={part}
      onDeleteSlot={onDeleteSlot}
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
  it('defaults to Show title off, hiding the text field and the rest of the title style controls', () => {
    renderInspector([{ action: { type: 'hotkey', keys: '' }, label: 'Hi' }]);
    expect(screen.getByRole('switch', { name: 'panel.settings.deck.titleStyle.show' })).not.toBeChecked();
    expect(screen.queryByPlaceholderText('panel.settings.deck.labelPlaceholder')).toBeNull();
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.titleStyle.bold' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'panel.settings.deck.titleStyle.alignTop' })).toBeNull();
  });

  it('turning Show title on reveals the text field and the title style controls', () => {
    renderInspector([{ action: { type: 'hotkey', keys: '' }, label: 'Hi' }]);
    fireEvent.click(screen.getByRole('switch', { name: 'panel.settings.deck.titleStyle.show' }));

    expect(screen.getByRole('switch', { name: 'panel.settings.deck.titleStyle.show' })).toBeChecked();
    expect(screen.getByPlaceholderText('panel.settings.deck.labelPlaceholder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.bold' })).not.toBeDisabled();
    expect(screen.getByRole('radio', { name: 'panel.settings.deck.titleStyle.alignTop' })).not.toBeDisabled();
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
    expect(screen.getByRole('radio', { name: 'panel.settings.deck.titleStyle.alignMiddle' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'panel.settings.deck.titleStyle.alignTop' }));
    expect(screen.getByRole('radio', { name: 'panel.settings.deck.titleStyle.alignTop' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'panel.settings.deck.titleStyle.alignMiddle' })).toHaveAttribute('aria-checked', 'false');
  });

  it('renders an Auto swatch for both the key color and the title text color', () => {
    // Show title on: off hides the title text colour row along with the rest.
    renderInspector([{ action: { type: 'hotkey', keys: '' }, label: 'Hi', title: { show: true } }]);
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

  it('picking Monitoring assigns the default action seeded with Quick CPU usage', async () => {
    renderInspector();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.action.monitoring' }));

    // The action box title AND the still-visible picker entry both show this
    // text (the picker highlights the now-active kind), so both match.
    expect(screen.getAllByText('panel.settings.deck.action.monitoring').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'panel.settings.deck.monitoringStyle.line' })).toHaveAttribute('aria-pressed', 'true');

    // defaultActionFor seeds category 'quick' with the summary/cpu-usage id.
    expect(await screen.findByText('CPU Usage')).toBeInTheDocument();
  });

  it('switching category resets the sensor to the first option of the new category', async () => {
    renderInspector([{ action: MONITORING_ACTION }]);
    expect(await screen.findByText('Total (Load)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.device' }));
    fireEvent.click(screen.getByRole('option', { name: 'monitoring.settings.category.quick' }));

    expect(await screen.findByText('CPU Usage')).toBeInTheDocument();
    expect(screen.queryByText('Total (Load)')).toBeNull();
  });

  it('changing the on-press action persists the new value', () => {
    renderInspector([{ action: MONITORING_ACTION }]);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.monitoringPressOp' }));
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.monitoringPress.taskManager' }));

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.monitoringPressOp' }));
    expect(screen.getByRole('option', { name: 'panel.settings.deck.monitoringPress.taskManager' })).toHaveAttribute('aria-selected', 'true');
  });

  it('hides the generic Icon picker and the Show-title/align/underline controls, showing a Background swatch instead', () => {
    renderInspector([{ action: MONITORING_ACTION }]);
    expect(screen.queryByText('panel.settings.icon')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'panel.settings.deck.titleStyle.show' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'panel.settings.deck.titleStyle.alignTop' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.titleStyle.underline' })).toBeNull();
    expect(screen.getByText('panel.settings.deck.monitoringBackground')).toBeInTheDocument();
  });

  it('hides the generic per-key label text field - the Sensor section\'s Label chips own the name now', () => {
    renderInspector([{ action: MONITORING_ACTION }]);
    expect(screen.queryByRole('textbox', { name: 'panel.settings.deck.label' })).toBeNull();
  });

  it('carries a separate accent-color swatch row from the background and name-color swatches', () => {
    renderInspector([{ action: MONITORING_ACTION }]);
    // Three independent color swatch rows, each defaulting to Auto: the tile
    // background (slot.color), the graph/arc accent (action.color, now inside
    // the Design section), and the name's text color (slot.title.color, via
    // the reused TitleFields).
    expect(screen.getAllByText('panel.settings.deck.colorAuto')).toHaveLength(3);
  });

  describe('Design section', () => {
    it('renders exactly the four wire-contract styles (no legacy radial) and writes the chosen one', () => {
      renderInspector([{ action: MONITORING_ACTION }]);
      for (const style of ['line', 'segments', 'backdrop', 'number']) {
        expect(screen.getByRole('button', { name: `panel.settings.deck.monitoringStyle.${style}` })).toBeInTheDocument();
      }
      expect(screen.queryByRole('button', { name: 'panel.settings.deck.monitoringStyle.radial' })).toBeNull();

      expect(screen.getByRole('button', { name: 'panel.settings.deck.monitoringStyle.line' })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.monitoringStyle.backdrop' }));
      expect(screen.getByRole('button', { name: 'panel.settings.deck.monitoringStyle.backdrop' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'panel.settings.deck.monitoringStyle.line' })).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('Range section (Adaptive/Fixed)', () => {
    it('is hidden for the number style (a plain value has no domain)', () => {
      renderInspector([{ action: { ...MONITORING_ACTION, style: 'number' as const } }]);
      expect(screen.queryByText('monitoring.settings.range')).toBeNull();
    });

    it('defaults to Adaptive, with no min/max fields', () => {
      renderInspector([{ action: MONITORING_ACTION }]);
      expect(screen.getByRole('button', { name: 'monitoring.settings.scaleAdaptive' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('spinbutton', { name: 'monitoring.settings.rangeMin' })).toBeNull();
    });

    it('selecting Fixed reveals min/max fields seeded 0 and the sensor default ceiling, and writes scale', () => {
      renderInspector([{ action: MONITORING_ACTION }]);
      fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));

      expect(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' })).toHaveAttribute('aria-pressed', 'true');
      const minInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' }) as HTMLInputElement;
      const maxInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMax' }) as HTMLInputElement;
      expect(minInput.value).toBe('0');
      expect(maxInput.value).toBe('100');
    });

    it('commits min and max on blur', () => {
      renderInspector([{ action: MONITORING_ACTION }]);
      fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));

      const minInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' });
      fireEvent.change(minInput, { target: { value: '20' } });
      fireEvent.blur(minInput);
      const maxInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMax' });
      fireEvent.change(maxInput, { target: { value: '90' } });
      fireEvent.blur(maxInput);

      expect(screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' })).toHaveValue(20);
      expect(screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMax' })).toHaveValue(90);
    });

    it('flags both fields invalid when the typed range is inverted', () => {
      renderInspector([{ action: MONITORING_ACTION }]);
      fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));

      const minInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' });
      fireEvent.change(minInput, { target: { value: '150' } });
      fireEvent.blur(minInput);

      expect(screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' })).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMax' })).toHaveAttribute('aria-invalid', 'true');
    });

    it('is hidden on a touch surface with no keyboard and no desktopEditor override; the Adaptive/Fixed chips stay', () => {
      render(<Harness initialSlots={[{ action: MONITORING_ACTION }]} surface="y70" />);
      fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));

      expect(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' })).toBeInTheDocument();
      expect(screen.queryByRole('spinbutton', { name: 'monitoring.settings.rangeMin' })).toBeNull();
    });

    it('switching category or sensor clears a stored Fixed range (scoped to the sensor it was set on)', async () => {
      renderInspector([{ action: { ...MONITORING_ACTION, scale: 'fixed' as const, min: 20, max: 80 } }]);
      expect(await screen.findByText('Total (Load)')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.device' }));
      fireEvent.click(screen.getByRole('option', { name: 'monitoring.settings.category.quick' }));

      await screen.findByText('CPU Usage');
      const minInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' }) as HTMLInputElement;
      expect(minInput.value).toBe('0');
    });
  });

  describe('Sensor Label chips (Auto / Hide / Custom)', () => {
    const chip = (name: string) => screen.getByRole('radio', { name });
    const AUTO = 'monitoring.settings.labelAuto';
    const HIDE = 'monitoring.settings.labelHide';
    const CUSTOM = 'monitoring.settings.labelCustom';
    const RESET = 'monitoring.settings.resetLabel';
    const FIELD = 'monitoring.settings.customLabel';

    it('defaults to Auto for a legacy action carrying none of the v3 fields', () => {
      renderInspector([{ action: MONITORING_ACTION }]);
      expect(chip(AUTO)).toHaveAttribute('aria-checked', 'true');
      expect(chip(HIDE)).toHaveAttribute('aria-checked', 'false');
      expect(screen.queryByRole('textbox', { name: FIELD })).toBeNull();
    });

    it('Hide writes showName false and leaves labelText untouched', () => {
      renderInspector([{ action: { ...MONITORING_ACTION, showName: true, labelText: 'Kept' } }]);
      expect(chip(CUSTOM)).toHaveAttribute('aria-checked', 'true');

      fireEvent.click(chip(HIDE));
      expect(chip(HIDE)).toHaveAttribute('aria-checked', 'true');
      expect(screen.queryByRole('textbox', { name: FIELD })).toBeNull();

      // Custom right after Hide restores the preserved text - Hide never
      // cleared labelText, only flipped showName.
      fireEvent.click(chip(CUSTOM));
      expect(screen.getByRole('textbox', { name: FIELD })).toHaveValue('Kept');
    });

    it('Custom with no prior text seeds the field with the derived sensor name and writes showName true', () => {
      renderInspector([{ action: MONITORING_ACTION }]);
      fireEvent.click(chip(CUSTOM));
      expect(screen.getByRole('textbox', { name: FIELD })).toHaveValue('CPU Total');
      expect(screen.getByRole('button', { name: RESET })).toBeInTheDocument();
    });

    it('typing updates labelText live and the tile name follows', () => {
      renderInspector([{ action: MONITORING_ACTION }]);
      fireEvent.click(chip(CUSTOM));
      fireEvent.input(screen.getByRole('textbox', { name: FIELD }), { target: { value: 'Hot' } });
      expect(screen.getByRole('textbox', { name: FIELD })).toHaveValue('Hot');
    });

    it('Auto clears labelText entirely (the contract discriminant, not just an inactive mode)', () => {
      renderInspector([{ action: MONITORING_ACTION }]);
      fireEvent.click(chip(CUSTOM));
      fireEvent.input(screen.getByRole('textbox', { name: FIELD }), { target: { value: 'Hot' } });

      fireEvent.click(chip(AUTO));
      expect(chip(AUTO)).toHaveAttribute('aria-checked', 'true');
      expect(screen.queryByRole('textbox', { name: FIELD })).toBeNull();

      // Re-entering Custom re-seeds from the derived name - Auto cleared the
      // typed text (unlike the monitoring widget's own mode, which keeps a
      // separate mode key and never clears the override).
      fireEvent.click(chip(CUSTOM));
      expect(screen.getByRole('textbox', { name: FIELD })).toHaveValue('CPU Total');
    });

    it('Reset refills the field with the derived sensor name and stays in Custom', () => {
      renderInspector([{ action: MONITORING_ACTION }]);
      fireEvent.click(chip(CUSTOM));
      fireEvent.input(screen.getByRole('textbox', { name: FIELD }), { target: { value: 'Hot' } });

      fireEvent.click(screen.getByRole('button', { name: RESET }));
      expect(chip(CUSTOM)).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('textbox', { name: FIELD })).toHaveValue('CPU Total');
    });

    it('on a keyboard-less kiosk, chips work but Custom shows a badge instead of the field', () => {
      render(<Harness initialSlots={[{ action: MONITORING_ACTION }]} surface="y70" />);
      fireEvent.click(chip(CUSTOM));
      expect(screen.queryByRole('textbox', { name: FIELD })).toBeNull();
      expect(screen.getByText('common.desktopOnly')).toBeInTheDocument();
    });
  });
});

describe('DeckKeyInspector - weather action', () => {
  it('offers Weather inside the Nexus category', () => {
    renderInspector();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.weather' })).toBeInTheDocument();
  });

  it('picking Weather assigns the default action (auto units, no location)', () => {
    expect(defaultActionFor('weather')).toEqual({ type: 'weather', units: 'auto' });

    renderInspector();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.action.weather' }));

    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.weather.settings.temperature' }));
    expect(screen.getByRole('option', { name: 'panel.widget.weather.settings.auto' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('panel.widget.weather.settings.currentLocation')).toBeNull();
  });

  it('hides the generic Icon picker, showing a Background swatch instead', () => {
    renderInspector([{ action: { type: 'weather', units: 'auto' } }]);
    expect(screen.queryByText('panel.settings.icon')).toBeNull();
    expect(screen.getByText('panel.settings.deck.monitoringBackground')).toBeInTheDocument();
  });

  it('hides Show-title/align/underline title controls, matching the monitoring tile treatment', () => {
    renderInspector([{ action: { type: 'weather', units: 'auto' } }]);
    expect(screen.queryByRole('switch', { name: 'panel.settings.deck.titleStyle.show' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'panel.settings.deck.titleStyle.alignTop' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.titleStyle.underline' })).toBeNull();
    // Bold/size/font/color stay - the tile applies them to the city text.
    expect(screen.getByRole('button', { name: 'panel.settings.deck.titleStyle.bold' })).not.toBeDisabled();
  });

  it('shows the units select defaulting to Auto and persists a change to Fahrenheit', () => {
    renderInspector([{ action: { type: 'weather', units: 'auto' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.weather.settings.temperature' }));
    fireEvent.click(screen.getByRole('option', { name: 'panel.widget.weather.settings.fahrenheit' }));

    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.weather.settings.temperature' }));
    expect(screen.getByRole('option', { name: 'panel.widget.weather.settings.fahrenheit' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the current location and clears it back to auto', () => {
    renderInspector([{ action: { type: 'weather', units: 'auto', lat: 1, lon: 2, city: 'Berlin', cc: 'DE' } }]);
    expect(screen.getByText('panel.widget.weather.settings.currentLocation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.weather.settings.clearLocation' }));
    expect(screen.queryByText('panel.widget.weather.settings.currentLocation')).toBeNull();
  });

  it('shows the location search field on a keyboard surface with no location yet', () => {
    renderInspector([{ action: { type: 'weather', units: 'auto' } }]);
    expect(screen.getByPlaceholderText('panel.widget.weather.settings.searchLocation')).toBeInTheDocument();
  });

  it('shows a desktop-only badge instead of the search field on a keyboard-less surface with no location', () => {
    render(<Harness initialSlots={[{ action: { type: 'weather', units: 'auto' } }]} surface="y70" />);
    expect(screen.queryByPlaceholderText('panel.widget.weather.settings.searchLocation')).toBeNull();
    expect(screen.getByText('common.desktopOnly')).toBeInTheDocument();
  });
});

describe('DeckKeyInspector - playAudio action', () => {
  afterEach(() => {
    vi.mocked(isWindowsAppShell).mockReturnValue(false);
    vi.mocked(isMacAppShell).mockReturnValue(false);
  });

  it('offers Play Audio inside the System category', () => {
    renderInspector();
    expect(screen.getByRole('option', { name: 'panel.settings.deck.action.playAudio' })).toBeInTheDocument();
  });

  it('picking Play Audio assigns the default action (empty path, full volume)', () => {
    expect(defaultActionFor('playAudio')).toEqual({ type: 'playAudio', path: '', volume: 100 });

    renderInspector();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.action.playAudio' }));

    const pathInput = document.querySelector('[class*=pathRow] input') as HTMLInputElement;
    expect(pathInput.value).toBe('');
    const slider = screen.getByRole('slider', { name: 'panel.settings.deck.volume' }) as HTMLInputElement;
    expect(slider.value).toBe('100');
  });

  it('typing a path persists it', () => {
    renderInspector([{ action: { type: 'playAudio', path: '', volume: 100 } }]);
    const input = document.querySelector('[class*=pathRow] input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'C:\\sounds\\boop.wav' } });
    expect(screen.getByDisplayValue('C:\\sounds\\boop.wav')).toBeInTheDocument();
  });

  it('shows Browse inside the Windows app shell and fills the path from the picked file', async () => {
    vi.mocked(isWindowsAppShell).mockReturnValue(true);
    vi.mocked(pickSystemPath).mockResolvedValueOnce('C:\\sounds\\boop.wav');
    renderInspector([{ action: { type: 'playAudio', path: '', volume: 100 } }]);

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.browse' }));
    expect(await screen.findByDisplayValue('C:\\sounds\\boop.wav')).toBeInTheDocument();
    expect(vi.mocked(pickSystemPath)).toHaveBeenCalledWith(false);
  });

  it('hides Browse in a plain browser tab (no app shell)', () => {
    renderInspector([{ action: { type: 'playAudio', path: '', volume: 100 } }]);
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.browse' })).toBeNull();
  });

  it('renders the volume slider at the stored value', () => {
    renderInspector([{ action: { type: 'playAudio', path: '/tmp/x.wav', volume: 42 } }]);
    const slider = screen.getByRole('slider', { name: 'panel.settings.deck.volume' }) as HTMLInputElement;
    expect(slider.value).toBe('42');
  });

  it('defaults the slider to full volume when volume is unset', () => {
    renderInspector([{ action: { type: 'playAudio', path: '/tmp/x.wav' } }]);
    const slider = screen.getByRole('slider', { name: 'panel.settings.deck.volume' }) as HTMLInputElement;
    expect(slider.value).toBe('100');
  });

  it('is nestable inside a sequence step (a one-shot press, unlike weather/monitoring)', () => {
    renderInspector();
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.action.sequence' }));
    fireEvent.click(screen.getByText('panel.settings.deck.sequence.addStep'));
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.actionType' }));
    // The step's own Select popup renders its options as <li>, distinct from
    // the top-level category picker's <button> entries (see the hotkeySwitch
    // nesting test above for the same distinction).
    const playAudioOptions = screen.getAllByRole('option', { name: 'panel.settings.deck.action.playAudio' });
    expect(playAudioOptions.some(o => o.tagName === 'LI')).toBe(true);
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

describe('DeckKeyInspector - Bug 6: Icon Color dims while the Custom image tab is active', () => {
  // The Icon Color swatch is the first "Auto" button in DOM order - the Icon
  // section renders above the Title section (see "section order" above),
  // whose own text-color swatch shares the same colorAuto label.
  const iconColorSwatch = () => screen.getAllByRole('button', { name: 'panel.settings.deck.colorAuto' })[0];

  it('starts enabled on Auto, dims on Custom, and re-enables when switching away', () => {
    renderInspector([{ action: { type: 'hotkey', keys: '' } }]);
    expect(iconColorSwatch()).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));
    expect(iconColorSwatch()).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.icons' }));
    expect(iconColorSwatch()).not.toBeDisabled();
  });

  it('does not dim any of the monitoring swatches (no IconPicker there at all)', () => {
    renderInspector([{ action: MONITORING_ACTION }]);
    for (const swatch of screen.getAllByRole('button', { name: 'panel.settings.deck.colorAuto' })) {
      expect(swatch).not.toBeDisabled();
    }
  });
});

describe('DeckKeyInspector - IconPicker remounts per slot (no sticky tab across slots)', () => {
  function SlotSwitchHarness() {
    const [config, setConfig] = useState<DeckConfig>({
      pages: [{
        slots: [
          { action: { type: 'hotkey', keys: '' }, icon: { kind: 'image', value: 'abc' } },
          { action: { type: 'openUrl', url: '' } },
        ],
      }],
    });
    const [selected, setSelected] = useState(0);
    const target = makePhysicalDeckTarget(2, 1, 2, config, setConfig);
    return (
      <>
        <button type="button" onClick={() => setSelected(1)}>select second slot</button>
        <DeckKeyInspector
          target={target}
          page={0}
          folderPath={[]}
          onFolderPathChange={() => {}}
          selectedSlot={selected}
          onSelectedSlotChange={setSelected}
        />
      </>
    );
  }

  it('resets to the new slot\'s own tab instead of keeping the previously selected slot\'s tab', () => {
    render(<SlotSwitchHarness />);
    expect(screen.getByRole('button', { name: 'panel.iconPicker.custom' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByText('select second slot'));

    expect(screen.getByRole('button', { name: 'panel.iconPicker.auto' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'panel.iconPicker.custom' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('DeckKeyInspector - delete action', () => {
  it('renders no delete control when onDeleteSlot is omitted (every existing caller)', () => {
    render(<Harness initialSlots={[{ action: { type: 'hotkey', keys: '' } }]} />);
    expect(screen.queryByText('panel.settings.deck.deleteKey')).toBeNull();
  });

  it('renders the delete control at the bottom of the editor once a binding exists, and it calls onDeleteSlot', () => {
    const onDeleteSlot = vi.fn();
    render(<Harness initialSlots={[{ action: { type: 'hotkey', keys: '' } }]} onDeleteSlot={onDeleteSlot} />);

    const title = screen.getByText('panel.settings.deck.titleStyle.section');
    const deleteBtn = screen.getByRole('button', { name: 'panel.settings.deck.deleteKey' });
    expect(isBefore(title, deleteBtn)).toBe(true);

    fireEvent.click(deleteBtn);
    expect(onDeleteSlot).toHaveBeenCalledTimes(1);
  });

  it('hides the delete control for an unbound (empty) slot, even when onDeleteSlot is provided', () => {
    render(<Harness initialSlots={[{}]} onDeleteSlot={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.deleteKey' })).toBeNull();
  });

  it('hides the delete control on the picker-only pane (nothing to delete there)', () => {
    render(<Harness initialSlots={[{ action: { type: 'hotkey', keys: '' } }]} part="picker" onDeleteSlot={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.deleteKey' })).toBeNull();
  });

  it('clearing the slot via onDeleteSlot hides the editor fields - the panel closes reactively, with no separate close call needed', () => {
    function SelfClearingHarness({ initialSlots }: { initialSlots: DeckSlot[] }) {
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
          onDeleteSlot={() => target.updateSlot(0, [], 0, {})}
        />
      );
    }
    render(<SelfClearingHarness initialSlots={[{ action: { type: 'hotkey', keys: '' } }]} />);
    expect(screen.getByText('panel.settings.deck.titleStyle.section')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.deleteKey' }));

    expect(screen.queryByText('panel.settings.deck.titleStyle.section')).toBeNull();
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.deleteKey' })).toBeNull();
  });
});

describe('DeckKeyInspector - empty key hint (split editor pane)', () => {
  it('shows the pick-an-action hint when an unbound key is selected in the editor pane', () => {
    render(<Harness initialSlots={[{}]} part="editor" />);
    expect(screen.getByText('panel.settings.deck.emptyKeyHint')).toBeInTheDocument();
  });

  it('hides the hint once the selected key has a binding', () => {
    render(<Harness initialSlots={[{ action: { type: 'hotkey', keys: '' } }]} part="editor" />);
    expect(screen.queryByText('panel.settings.deck.emptyKeyHint')).toBeNull();
  });

  it('never shows the hint on the picker-only pane', () => {
    render(<Harness initialSlots={[{}]} part="picker" />);
    expect(screen.queryByText('panel.settings.deck.emptyKeyHint')).toBeNull();
  });

  it('leaves the stacked touch-widget layout unchanged - no hint for an unbound key there', () => {
    render(<Harness initialSlots={[{}]} part="all" />);
    expect(screen.queryByText('panel.settings.deck.emptyKeyHint')).toBeNull();
  });
});
