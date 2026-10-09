import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { describe, it, expect, vi } from 'vitest';
import { makePresetDeckTarget } from './deckTarget';
import type { DeckPresetFull } from '../../../api/deck';
import type { DeckConfig, DeckDial } from './types';

vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));
vi.mock('../../../api/service', () => ({
  fetchService: vi.fn((path: string) => Promise.resolve(path === '/system/audio/devices'
    ? { outputs: [{ id: 'out1', name: 'Speakers' }], inputs: [{ id: 'in1', name: 'Headset mic' }] }
    : path === '/devices/lighting-devices/layout-presets' ? { presets: [{ id: 'p1', name: 'Preset one' }] }
    : path === '/displays' ? { displays: [{ id: 'd1', name: 'Left monitor' }] } : null)),
  isRelayActive: vi.fn(() => false),
  isDirectActive: vi.fn(() => false),
  pickSystemPath: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('../../../api/mixer', () => ({
  fetchAudioMixer: vi.fn(() => Promise.resolve({ sessions: [{ id: 'spotify', name: 'Spotify' }] })),
}));
vi.mock('../../../app/windowActions', () => ({
  isWindowsAppShell: vi.fn(() => false),
  isMacAppShell: vi.fn(() => false),
}));
vi.mock('../../../api/weather', () => ({
  geocodeWeatherLocations: vi.fn(() => Promise.resolve({ results: [] })),
}));
vi.mock('../../../hooks/useSensors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useSensors')>();
  return {
    ...actual,
    useSensors: () => ({
      summary: [
        { id: 'summary/cpu-usage', name: 'CPU Usage', type: 'Load', value: 10, units: '%', formatted: '10 %', parent: { id: 'summary', name: 'Quick' } },
      ],
      cpu: [], gpu: [], gpuModel: '', gpuComponents: [],
      memory: [], storage: [], storageComponents: {}, storageSensors: [],
      motherboard: [],
      motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
    }),
  };
});

import { DeckDialInspector } from './DeckDialInspector';

function preset(deck: DeckConfig): DeckPresetFull {
  return { id: 'p', name: 'P', cols: 4, rows: 2, pageCount: deck.pages.length, deck };
}

const saved: { config: DeckConfig } = { config: { pages: [] } };

function Harness({ dials, part, selected = 0, base }: { dials: DeckDial[]; part: 'picker' | 'editor'; selected?: number; base?: DeckConfig }) {
  const [config, setConfig] = useState<DeckConfig>(base ?? { pages: [{ slots: [], dials }] });
  const [entry, setEntry] = useState(0);
  const save = (next: DeckConfig) => { saved.config = next; setConfig(next); };
  const target = makePresetDeckTarget(preset(config), { cols: 4, rows: 2, dials: 4 }, 'physical', save);
  return (
    <DndContext>
      <DeckDialInspector
        target={target}
        page={0}
        folderPath={[]}
        selectedDial={selected}
        entryIndex={entry}
        onEntryIndexChange={setEntry}
        surface="desktop"
        desktopEditor
        part={part}
      />
    </DndContext>
  );
}

const dialsOf = () => saved.config.pages[0].dials!;

describe('DeckDialInspector picker', () => {
  it('lists every dial action under the Audio, Display, Navigation, Nexus and Custom groups', () => {
    render(<Harness dials={[]} part="picker" />);
    for (const type of ['volume', 'micVolume', 'appVolume', 'displayBrightness', 'deckBrightness', 'y70Brightness', 'page', 'lightingBrightness', 'monitoring', 'custom']) {
      expect(screen.getByRole('option', { name: `panel.settings.deck.dial.action.${type}` })).toBeInTheDocument();
    }
  });

  it('picking an action binds it to the selected dial and keeps its look', () => {
    render(<Harness dials={[{ label: 'Keep', color: '#fff' }]} part="picker" />);
    fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.dial.action.volume' }));
    expect(dialsOf()[0]).toEqual({ label: 'Keep', color: '#fff', action: { type: 'volume' } });
  });

  it('marks the selected dial\'s action type active', () => {
    render(<Harness dials={[{ action: { type: 'page' } }]} part="picker" />);
    expect(screen.getByRole('option', { name: 'panel.settings.deck.dial.action.page' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'panel.settings.deck.dial.action.volume' })).toHaveAttribute('aria-selected', 'false');
  });
});

describe('DeckDialInspector editor', () => {
  it('shows the empty hint for a dial without an action', () => {
    render(<Harness dials={[{}]} part="editor" />);
    expect(screen.getByText('panel.settings.deck.dial.emptyHint')).toBeInTheDocument();
  });

  it('volume offers the output devices plus the default and a step slider', async () => {
    render(<Harness dials={[{ action: { type: 'volume' } }]} part="editor" />);
    fireEvent.click(await screen.findByLabelText('panel.settings.deck.audioOutput'));
    expect(await screen.findByRole('option', { name: 'Speakers' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Speakers' }));
    expect(dialsOf()[0].action).toEqual({ type: 'volume', deviceId: 'out1' });
    expect(screen.getByRole('slider', { name: 'panel.settings.deck.dial.step' })).toBeInTheDocument();
  });

  it('choosing the default output removes the device id', async () => {
    render(<Harness dials={[{ action: { type: 'volume', deviceId: 'out1' } }]} part="editor" />);
    fireEvent.click(await screen.findByLabelText('panel.settings.deck.audioOutput'));
    fireEvent.click(await screen.findByRole('option', { name: 'panel.settings.deck.dial.defaultOutput' }));
    expect(dialsOf()[0].action).toEqual({ type: 'volume' });
  });

  it('mic volume lists input devices', async () => {
    render(<Harness dials={[{ action: { type: 'micVolume' } }]} part="editor" />);
    fireEvent.click(await screen.findByLabelText('panel.settings.deck.audioInput'));
    expect(await screen.findByRole('option', { name: 'Headset mic' })).toBeInTheDocument();
  });

  it('app volume lists mixer sessions and stores the app id and name', async () => {
    render(<Harness dials={[{ action: { type: 'appVolume', appId: '' } }]} part="editor" />);
    fireEvent.click(await screen.findByLabelText('panel.settings.deck.dial.app'));
    fireEvent.click(await screen.findByRole('option', { name: 'Spotify' }));
    expect(dialsOf()[0].action).toEqual({ type: 'appVolume', appId: 'spotify', appName: 'Spotify' });
  });

  it('display brightness seeds the first display once the list loads', async () => {
    render(<Harness dials={[{ action: { type: 'displayBrightness', displayId: '' } }]} part="editor" />);
    await screen.findByLabelText('panel.settings.deck.display');
    await vi.waitFor(() => expect(dialsOf()[0].action).toEqual({ type: 'displayBrightness', displayId: 'd1' }));
  });

  it('page explains its behaviour and has no fields', () => {
    render(<Harness dials={[{ action: { type: 'page' } }]} part="editor" />);
    expect(screen.getByText('panel.settings.deck.dial.pageHint')).toBeInTheDocument();
  });

  it('monitoring seeds a concrete sensor and offers the press action', async () => {
    render(<Harness dials={[{ action: { type: 'monitoring', category: 'quick', sensor: '', press: 'none' } }]} part="editor" />);
    await vi.waitFor(() => expect(dialsOf()[0].action).toMatchObject({ type: 'monitoring', sensor: 'summary/cpu-usage' }));
    expect(screen.getByLabelText('panel.settings.deck.monitoringPressOp')).toBeInTheDocument();
  });

  it('custom binds and clears each of turn right, turn left, press and touch', () => {
    render(<Harness dials={[{ action: { type: 'custom' } }]} part="editor" />);
    const adds = screen.getAllByRole('button', { name: 'panel.settings.deck.dial.custom.add' });
    expect(adds).toHaveLength(4);
    fireEvent.click(adds[1]);
    expect(dialsOf()[0].action).toMatchObject({ type: 'custom', turnLeft: { type: 'hotkey' } });
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.dial.custom.clear' }));
    expect(dialsOf()[0].action).toEqual({ type: 'custom' });
  });

  it('writes the label and clears the whole dial', () => {
    render(<Harness dials={[{ action: { type: 'volume' } }]} part="editor" />);
    fireEvent.change(screen.getByLabelText('panel.settings.deck.label'), { target: { value: 'Music' } });
    expect(dialsOf()[0]).toEqual({ action: { type: 'volume' }, label: 'Music' });
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.dial.clear' }));
    expect(dialsOf()[0]).toEqual({});
  });
});

describe('DeckDialInspector selection and inheritance', () => {
  it('viewing an inherited folder dial does not seed a sensor or display into the folder', async () => {
    saved.config = { pages: [] };
    const base: DeckConfig = {
      pages: [{ slots: [{ folder: { slots: [{ label: 'f' }] } }], dials: [{ action: { type: 'monitoring', category: 'quick', sensor: '', press: 'none' } }, { action: { type: 'displayBrightness', displayId: '' } }] }],
    };
    const Folder = () => {
      const [config, setConfig] = useState<DeckConfig>(base);
      const target = makePresetDeckTarget(preset(config), { cols: 4, rows: 2, dials: 4 }, 'physical', next => { saved.config = next; setConfig(next); });
      return (
        <DndContext>
          <DeckDialInspector target={target} page={0} folderPath={[0]} selectedDial={0} entryIndex={0} onEntryIndexChange={() => {}} surface="desktop" desktopEditor part="editor" />
          <DeckDialInspector target={target} page={0} folderPath={[0]} selectedDial={1} entryIndex={0} onEntryIndexChange={() => {}} surface="desktop" desktopEditor part="editor" />
        </DndContext>
      );
    };
    render(<Folder />);
    await screen.findAllByLabelText('panel.settings.deck.monitoringPressOp');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(saved.config.pages).toEqual([]);
  });

  it('viewing an inherited custom dial does not re-seed a deleted lighting preset into the folder', async () => {
    saved.config = { pages: [] };
    const base: DeckConfig = {
      pages: [{
        slots: [{ folder: { slots: [{ label: 'f' }] } }],
        dials: [{ action: { type: 'custom', push: { type: 'nexus', action: { op: 'lightingPreset', presetId: 'gone' } } } }],
      }],
    };
    const Folder = ({ folderPath }: { folderPath: number[] }) => {
      const [config, setConfig] = useState<DeckConfig>(base);
      const target = makePresetDeckTarget(preset(config), { cols: 4, rows: 2, dials: 4 }, 'physical', next => { saved.config = next; setConfig(next); });
      return (
        <DndContext>
          <DeckDialInspector target={target} page={0} folderPath={folderPath} selectedDial={0} entryIndex={0} onEntryIndexChange={() => {}} surface="desktop" desktopEditor part="editor" />
        </DndContext>
      );
    };
    const inFolder = render(<Folder folderPath={[0]} />);
    await screen.findByLabelText('panel.settings.deck.preset');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(saved.config.pages).toEqual([]);
    inFolder.unmount();

    render(<Folder folderPath={[]} />);
    await vi.waitFor(() => expect(saved.config.pages[0]?.dials?.[0].action).toMatchObject({ push: { action: { presetId: 'p1' } } }));
  });
});

describe('DeckDialInspector stack', () => {
  it('adding to a plain dial starts a two-entry stack and selects the new entry', () => {
    render(<Harness dials={[{ label: 'a', action: { type: 'volume' } }]} part="editor" />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.dial.stack.add' }));
    expect(dialsOf()[0]).toEqual({ stack: [{ label: 'a', action: { type: 'volume' } }, {}] });
    const rows = screen.getAllByRole('button', { pressed: true });
    expect(rows.some(r => r.textContent?.includes('panel.settings.deck.dial.stack.entry'))).toBe(true);
  });

  it('edits the chosen entry and removes down to a plain dial', () => {
    render(<Harness dials={[{ stack: [{ action: { type: 'volume' } }, { action: { type: 'page' } }] }]} part="editor" />);
    const list = screen.getByText('panel.settings.deck.dial.stack.title').closest('section') ?? document.body;
    const entries = within(list as HTMLElement).getAllByRole('button', { name: /panel.settings.deck.dial.stack.entry/ });
    fireEvent.click(entries[1]);
    expect(screen.getByText('panel.settings.deck.dial.pageHint')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('panel.settings.deck.label'), { target: { value: 'Second' } });
    expect(dialsOf()[0].stack?.[1]).toEqual({ action: { type: 'page' }, label: 'Second' });
    fireEvent.click(screen.getAllByRole('button', { name: 'panel.settings.deck.dial.stack.remove' })[0]);
    expect(dialsOf()[0]).toEqual({ action: { type: 'page' }, label: 'Second' });
  });

  it('keeps the edited entry selected across a move and a removal', () => {
    render(<Harness dials={[{ stack: [{ label: 'a', action: { type: 'page' } }, { label: 'b' }, { label: 'c' }] }]} part="editor" />);
    fireEvent.click(screen.getAllByRole('button', { name: /panel.settings.deck.dial.stack.entry/ })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'panel.settings.deck.dial.stack.moveDown' })[0]);
    expect(screen.getByText('panel.settings.deck.dial.pageHint')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'panel.settings.deck.dial.stack.remove' })[2]);
    expect(screen.getByText('panel.settings.deck.dial.pageHint')).toBeInTheDocument();
  });

  it('reorders entries', () => {
    render(<Harness dials={[{ stack: [{ label: 'a' }, { label: 'b' }] }]} part="editor" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'panel.settings.deck.dial.stack.moveDown' })[0]);
    expect(dialsOf()[0].stack?.map(e => e.label)).toEqual(['b', 'a']);
  });
});
