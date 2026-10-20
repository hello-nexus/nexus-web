import type { PanelSurface } from '../panel/types';

export interface SimulatedScreen {
  id: string;
  name: string;
  vendor: string;
  surface: PanelSurface;
  /** The capabilities.family the service stamps on the real device's record. */
  family?: string;
  /** Native pixels. */
  width: number;
  height: number;
  dpi: number;
  touch?: boolean;
}

export const GENERIC_VENDOR = 'generic';

// Equal to DEFAULT_SURFACE_DPI for the surface; not imported because panelGrid imports panelSimulation.
const LCD_DPI = 210;
const KRAKEN_DPI = 240;
const MONITOR_DPI = 110;

// Geometry mirrors the service driver tables; cooler glass records no density, so it takes the lcd surface default.
export const SIMULATED_SCREEN_CATALOG: readonly SimulatedScreen[] = [
  { id: 'y70', name: 'HYTE Y70 Touch 2.5K', vendor: 'HYTE', surface: 'y70', width: 682, height: 2560, dpi: 337, touch: true },
  { id: 'y70-4k', name: 'HYTE Y70 Touch 4K', vendor: 'HYTE', surface: 'y70', width: 1100, height: 3840, dpi: 283, touch: true },
  { id: 'q60', name: 'HYTE Q60', vendor: 'HYTE', surface: 'q60', width: 720, height: 1280, dpi: 240 },
  { id: 'q80', name: 'HYTE Q80', vendor: 'HYTE', surface: 'q60', width: 720, height: 1280, dpi: 240 },

  { id: 'kraken', name: 'NZXT Kraken Elite V2', vendor: 'NZXT', surface: 'kraken', family: 'nzxt-kraken', width: 640, height: 640, dpi: KRAKEN_DPI },
  { id: 'kraken-plus-v2', name: 'NZXT Kraken Plus V2', vendor: 'NZXT', surface: 'kraken', family: 'nzxt-kraken', width: 240, height: 240, dpi: KRAKEN_DPI },
  { id: 'kraken-elite-2023', name: 'NZXT Kraken Elite (2023)', vendor: 'NZXT', surface: 'kraken', family: 'nzxt-kraken', width: 640, height: 640, dpi: KRAKEN_DPI },
  { id: 'kraken-2023', name: 'NZXT Kraken (2023)', vendor: 'NZXT', surface: 'kraken', family: 'nzxt-kraken', width: 240, height: 240, dpi: KRAKEN_DPI },
  { id: 'kraken-z3', name: 'NZXT Kraken Z3', vendor: 'NZXT', surface: 'kraken', family: 'nzxt-kraken', width: 320, height: 320, dpi: KRAKEN_DPI },

  { id: 'lianli-hydroshift-lcd', name: 'Lian Li HydroShift LCD', vendor: 'Lian Li', surface: 'lcd-square', family: 'lianli-hydroshift-lcd', width: 480, height: 480, dpi: LCD_DPI },
  { id: 'lianli-galahad2-lcd', name: 'Lian Li Galahad II LCD', vendor: 'Lian Li', surface: 'lcd-square', family: 'lianli-galahad2-lcd', width: 480, height: 480, dpi: LCD_DPI },
  { id: 'lianli-hydroshift2-lcd-s', name: 'Lian Li HydroShift II LCD-S', vendor: 'Lian Li', surface: 'lcd-square', family: 'lianli-hydroshift2', width: 480, height: 480, dpi: LCD_DPI },
  { id: 'lianli-hydroshift2-lcd-c', name: 'Lian Li HydroShift II LCD-C', vendor: 'Lian Li', surface: 'lcd-round', family: 'lianli-hydroshift2', width: 480, height: 480, dpi: LCD_DPI },
  { id: 'lianli-hydroshift2-curve', name: 'Lian Li HydroShift II OLED Curved', vendor: 'Lian Li', surface: 'lcd-wide', family: 'lianli-hydroshift2-curve', width: 2288, height: 1080, dpi: 379 },
  { id: 'lianli-screen88', name: 'Lian Li Universal Screen 8.8', vendor: 'Lian Li', surface: 'monitor', family: 'lianli-screen88', width: 1920, height: 480, dpi: 225 },
  { id: 'lianli-tl-lcd', name: 'Lian Li Uni Fan TL LCD', vendor: 'Lian Li', surface: 'lcd-round', family: 'lianli-tl-lcd', width: 400, height: 400, dpi: LCD_DPI },
  { id: 'lianli-wireless-lcd', name: 'Lian Li Uni Fan SL/TL LCD Wireless', vendor: 'Lian Li', surface: 'lcd-round', family: 'lianli-wireless-lcd', width: 400, height: 400, dpi: LCD_DPI },
  { id: 'lianli-tl-lcd-flex', name: 'Lian Li Uni Fan TL LCD Flex', vendor: 'Lian Li', surface: 'lcd-round', family: 'lianli-flex-lcd', width: 400, height: 400, dpi: LCD_DPI },
  { id: 'lianli-sl-inf-lcd-flex', name: 'Lian Li Uni Fan SL-INF LCD Flex', vendor: 'Lian Li', surface: 'lcd-round', family: 'lianli-flex-lcd', width: 400, height: 400, dpi: LCD_DPI },

  { id: 'corsair-link-lcd', name: 'Corsair iCUE LINK LCD', vendor: 'Corsair', surface: 'lcd-round', family: 'corsair-link-lcd', width: 480, height: 480, dpi: LCD_DPI },
  { id: 'corsair-xc7-lcd', name: 'Corsair XC7 RGB Elite LCD', vendor: 'Corsair', surface: 'lcd-round', family: 'corsair-xc7-lcd', width: 480, height: 480, dpi: LCD_DPI },
  { id: 'corsair-capellix-lcd', name: 'Corsair Elite Capellix LCD', vendor: 'Corsair', surface: 'lcd-square', family: 'corsair-capellix-lcd', width: 480, height: 480, dpi: LCD_DPI },
  // The service records only the 294 dpi of the 5" glass; 720x1280 is the portrait 9:16 size that density implies.
  { id: 'icue-link-lcd5', name: 'Corsair iCUE LINK 5" LCD', vendor: 'Corsair', surface: 'monitor', family: 'icue-link-lcd5', width: 720, height: 1280, dpi: 294 },
  { id: 'xeneon-edge', name: 'Corsair Xeneon Edge', vendor: 'Corsair', surface: 'monitor', family: 'xeneon-edge', width: 2560, height: 720, dpi: 183, touch: true },

  { id: 'asus-ryujin-lcd', name: 'ASUS ROG Ryujin III LCD', vendor: 'ASUS', surface: 'lcd-square', family: 'asus-ryujin-lcd', width: 320, height: 240, dpi: LCD_DPI },

  { id: 'thermalright-grand-vision', name: 'Thermalright Grand Vision', vendor: 'Thermalright', surface: 'lcd-square', family: 'thermalright-lcd', width: 480, height: 480, dpi: LCD_DPI },
  { id: 'thermalright-core-vision', name: 'Thermalright Core Vision', vendor: 'Thermalright', surface: 'lcd-square', family: 'thermalright-lcd', width: 480, height: 480, dpi: LCD_DPI },
  { id: 'thermalright-hyper-vision', name: 'Thermalright Hyper Vision', vendor: 'Thermalright', surface: 'lcd-square', family: 'thermalright-lcd', width: 480, height: 480, dpi: LCD_DPI },
  { id: 'thermalright-mjolnir-vision', name: 'Thermalright Mjolnir Vision', vendor: 'Thermalright', surface: 'lcd-square', family: 'thermalright-lcd', width: 640, height: 480, dpi: LCD_DPI },
  { id: 'thermalright-frozen-vision', name: 'Thermalright Frozen Vision', vendor: 'Thermalright', surface: 'lcd-square', family: 'thermalright-lcd', width: 640, height: 480, dpi: LCD_DPI },
  { id: 'thermalright-stream-vision', name: 'Thermalright Stream Vision', vendor: 'Thermalright', surface: 'lcd-square', family: 'thermalright-lcd', width: 640, height: 480, dpi: LCD_DPI },
  { id: 'thermalright-vision-max', name: 'Thermalright Vision Max', vendor: 'Thermalright', surface: 'lcd-wide', family: 'thermalright-lcd', width: 854, height: 480, dpi: LCD_DPI },
  { id: 'thermalright-frozen-warframe-pro', name: 'Thermalright Frozen Warframe Pro', vendor: 'Thermalright', surface: 'lcd-square', family: 'thermalright-lcd', width: 320, height: 320, dpi: LCD_DPI },
  { id: 'thermalright-wonder-vision', name: 'Thermalright Wonder Vision', vendor: 'Thermalright', surface: 'lcd-wide', family: 'thermalright-lcd', width: 1600, height: 720, dpi: LCD_DPI },
  { id: 'thermalright-tl-m10-vision', name: 'Thermalright TL-M10 Vision', vendor: 'Thermalright', surface: 'lcd-wide', family: 'thermalright-lcd', width: 1920, height: 462, dpi: LCD_DPI },

  { id: 'idcooling-fx-lcd', name: 'ID-Cooling FX-LCD', vendor: 'ID-Cooling', surface: 'lcd-round', family: 'idcooling-fx-lcd', width: 240, height: 240, dpi: LCD_DPI },
  { id: 'asrock-lcd', name: 'ASRock AIO LCD', vendor: 'ASRock', surface: 'lcd-square', family: 'asrock-lcd', width: 480, height: 480, dpi: LCD_DPI },
  { id: 'zmatrices-lcd', name: 'Aftershock Glacier Matrix', vendor: 'Aftershock', surface: 'lcd-wide', family: 'zmatrices-lcd', width: 1120, height: 540, dpi: LCD_DPI },

  { id: 'phone', name: 'Phone Panel', vendor: GENERIC_VENDOR, surface: 'phone', width: 1206, height: 2622, dpi: 460 },
  { id: 'tablet', name: 'Tablet Panel', vendor: GENERIC_VENDOR, surface: 'phone', width: 1640, height: 2360, dpi: 264 },
  { id: 'monitor', name: 'Monitor', vendor: GENERIC_VENDOR, surface: 'monitor', width: 2560, height: 1440, dpi: MONITOR_DPI },
];

/** Stored ids of presets since replaced by a real model. */
export const LEGACY_SIMULATED_SCREEN_IDS: Readonly<Record<string, string>> = {
  'lcd-round-480': 'corsair-link-lcd',
  'lcd-square-480': 'lianli-galahad2-lcd',
  'lcd-wide-1600': 'thermalright-wonder-vision',
  'lcd-round-240': 'idcooling-fx-lcd',
};
