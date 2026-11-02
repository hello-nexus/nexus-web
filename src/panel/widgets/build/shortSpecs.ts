// Family-level names for the tile's spec rows: no vendor where the family says it, no part numbers, speeds, kit
// breakdowns or parenthetical detail. The full string stays available to the tooltip.

const clean = (s: string) => s.replace(/\((?:R|TM|C)\)/gi, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

/** "AMD Ryzen 7 9800X3D" to "Ryzen 7 9800X3D"; "Intel(R) Core(TM) i7-12700KF @ 3.60GHz" to "Core i7-12700KF". */
export function shortCpu(name: string): string {
  const s = clean(name)
    .replace(/@\s*[\d.]+\s*GHz/i, '')
    .replace(/\b\d+-Core Processor\b/i, '')
    .replace(/\b(?:CPU|Processor)\b/gi, '')
    .replace(/^\d+(?:st|nd|rd|th)\s+Gen\s+/i, '')
    .replace(/\b(?:AMD|Intel)\s+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || name.trim();
}

/** "NVIDIA GeForce RTX 5080" to "RTX 5080"; "AMD Radeon RX 7900 XTX" to "RX 7900 XTX"; "Intel Arc A770" to "Arc A770". */
export function shortGpu(name: string): string {
  const whole = clean(name);
  // An integrated adapter has no model to show: it stays as the family it is, vendor included for Intel.
  if (/^(?:Intel\s+)?(?:Arc\s+)?Graphics$/i.test(whole)) return whole;
  const s = whole
    .replace(/\b(?:NVIDIA|AMD|Intel|Founders Edition|Graphics Card|Laptop GPU)\b/gi, '')
    .replace(/(\bArc\b.*?)\s+Graphics\b/i, '$1')
    .replace(/\bGeForce\b/i, '')
    .replace(/\bRadeon\b(?=\s+(?:RX|PRO|VII|R\d))/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return name.trim();
  return s === 'Graphics' ? whole.replace(/^AMD\s+/i, '') : s;
}

/** "32 GB DDR5-5600 (2 x 16 GB Crucial CP16G60C48U5.M8B2)" to "32 GB DDR5". */
export function shortRam(memory: string): string {
  const gb = memory.match(/(\d+(?:\.\d+)?)\s*GB/i);
  const ddr = memory.match(/\b(DDR\d|LPDDR\d\w?)/i);
  if (!gb) return clean(memory);
  return `${gb[1]} GB${ddr ? ` ${ddr[1].toUpperCase()}` : ''}`;
}

// Marketed sizes in decimal GB that drives are sold at; a reading within 3% of one is that size.
const MARKETED_GB = [16, 32, 64, 120, 128, 240, 250, 256, 480, 500, 512, 960, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 16000, 20000];
const SNAP = 0.03;

/**
 * The service reports binary units (a 2 TB drive reads 1.82 TB, a 250 GB one 232.83 GB). The reading goes to decimal bytes,
 * then to a common marketed size when it is within 3% of one, else to two significant digits.
 */
export function marketedCapacity(value: number, unit: string): string {
  const bytes = value * (/tb/i.test(unit) ? 1024 ** 4 : 1024 ** 3);
  const gb = bytes / 1e9;
  const nearest = MARKETED_GB.reduce((best, size) => (Math.abs(gb - size) < Math.abs(gb - best) ? size : best), MARKETED_GB[0]);
  const near = Math.abs(gb - nearest) / nearest <= SNAP ? nearest : undefined;
  const rounded = near ?? Number(gb.toPrecision(2));
  return rounded >= 1000 ? `${Number((rounded / 1000).toFixed(2))} TB` : `${rounded} GB`;
}

/** "1.82 TB WDS200T1X0E-00AFY0 NVMe" to "2 TB NVMe": the capacity and the interface, never the model string. */
export function shortStorage(storage: string): string {
  return storage
    .split(/\s*\+\s*/)
    .map((drive) => {
      const size = drive.match(/(\d+(?:\.\d+)?)\s*(TB|GB)\b/i);
      const kind = drive.match(/\b(NVMe|SSD|HDD|SATA)\b/i);
      if (!size) return clean(drive);
      return [marketedCapacity(Number(size[1]), size[2]), kind ? (/nvme/i.test(kind[1]) ? 'NVMe' : kind[1].toUpperCase()) : null].filter(Boolean).join(' ');
    })
    .join(' + ');
}

const BOARD_VENDORS = /^(?:ASUSTeK(?: COMPUTER INC\.?)?|ASUS|Gigabyte(?: Technology Co\.?,? Ltd\.?)?|Micro-Star International Co\.?,? Ltd\.?|MSI|ASRock|Biostar|EVGA|NZXT)\s+/i;

/** "Gigabyte B850I AORUS PRO" to "B850I AORUS PRO". */
export function shortBoard(name: string): string {
  const s = clean(name).replace(BOARD_VENDORS, '').trim();
  return s || name.trim();
}

const COOLER_VENDORS = /^(?:Corsair|NZXT|Arctic|Noctua|be quiet!|Cooler Master|DeepCool|Lian Li|Thermalright|EK|Fractal Design|Scythe|Thermaltake|ID-COOLING|MSI|ASUS)\s+/i;

/** "Corsair iCUE H150i Elite" to "iCUE H150i Elite": the model without its maker. */
export function shortCooler(name: string): string {
  const s = clean(name).replace(COOLER_VENDORS, '').trim();
  return s || name.trim();
}
