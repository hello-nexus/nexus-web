// Family-level names for the tile's spec rows: no vendor where the family says it, no part numbers, speeds, kit
// breakdowns or parenthetical detail. The full string stays available to the tooltip.

const clean = (s: string) => s.replace(/\((?:R|TM|C)\)/gi, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

/** "AMD Ryzen 7 9800X3D" to "Ryzen 7 9800X3D"; "Intel(R) Core(TM) i7-12700KF @ 3.60GHz" to "Core i7-12700KF". */
export function shortCpu(name: string): string {
  const s = clean(name)
    .replace(/@\s*[\d.]+\s*GHz/i, '')
    .replace(/\b\d+-Core Processor\b/i, '')
    .replace(/\b(?:CPU|Processor)\b/gi, '')
    .replace(/\b(?:AMD|Intel)\s+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || name.trim();
}

/** "NVIDIA GeForce RTX 5080" to "RTX 5080"; "AMD Radeon RX 7900 XTX" to "RX 7900 XTX"; "Intel Arc A770" to "Arc A770". */
export function shortGpu(name: string): string {
  const s = clean(name)
    .replace(/\b(?:NVIDIA|AMD|Intel|Founders Edition|Graphics Card|Laptop GPU)\b/gi, '')
    .replace(/(\bArc\b.*?)\s+Graphics\b/i, '$1')
    .replace(/\bGeForce\b/i, '')
    .replace(/\bRadeon\b(?=\s+(?:RX|PRO|VII|R\d))/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return name.trim();
  // An integrated adapter is left as its family, not "Graphics" alone.
  return s === 'Graphics' ? clean(name).replace(/^(?:AMD|Intel)\s+/i, '') : s;
}

/** "32 GB DDR5-5600 (2 x 16 GB Crucial CP16G60C48U5.M8B2)" to "32 GB DDR5". */
export function shortRam(memory: string): string {
  const gb = memory.match(/(\d+(?:\.\d+)?)\s*GB/i);
  const ddr = memory.match(/\b(DDR\d|LPDDR\d\w?)/i);
  if (!gb) return clean(memory);
  return `${gb[1]} GB${ddr ? ` ${ddr[1].toUpperCase()}` : ''}`;
}

// Marketed capacities in GB; operating systems report a little less (a 2 TB drive as 1.82 TB).
const MARKETED_GB = [128, 256, 500, 512, 1000, 2000, 4000, 8000, 16000];

function marketedCapacity(value: number, unit: string): string {
  const gb = /tb/i.test(unit) ? value * 1000 : value;
  const nearest = MARKETED_GB.reduce((best, c) => (Math.abs(Math.log(gb / c)) < Math.abs(Math.log(gb / best)) ? c : best), MARKETED_GB[0]);
  return nearest >= 1000 ? `${nearest / 1000} TB` : `${nearest} GB`;
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
