import type { Build, CompatibilityIssue, ComponentOption } from '../types/builder';

/**
 * Check compatibility between selected components in a build.
 * Returns an array of issues. Skips rules where data is missing.
 */
export function checkCompatibility(build: Build): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = [];

  const get = (cat: keyof typeof build.slots): ComponentOption | null => {
    const entries = build.slots[cat];
    if (!entries || entries.length === 0) return null;
    return entries[0].selection;
  };

  const cpu = get('cpu');
  const mb = get('motherboard');
  const ram = get('ram');
  const gpu = get('gpu');
  const psu = get('psu');
  const cooler = get('cooler');
  const cas = get('case');

  // 1. CPU socket vs MB socket
  if (cpu && mb && cpu.specs.socket && mb.specs.socket) {
    if (cpu.specs.socket !== mb.specs.socket) {
      issues.push({
        severity: 'error',
        category: 'cpu',
        relatedCategory: 'motherboard',
        message: `CPU socket ${cpu.specs.socket} does not match motherboard socket ${mb.specs.socket}`,
      });
    }
  }

  // 2. RAM DDR type vs MB DDR type
  if (ram && mb && ram.specs.ddrType && mb.specs.ddrType) {
    if (ram.specs.ddrType !== mb.specs.ddrType) {
      issues.push({
        severity: 'error',
        category: 'ram',
        relatedCategory: 'motherboard',
        message: `RAM type ${ram.specs.ddrType} is not compatible with motherboard ${mb.specs.ddrType}`,
      });
    }
  }

  // 3. RAM modules vs MB slots
  if (ram && mb && ram.specs.modules && mb.specs.memorySlots) {
    const ramSlotCount = build.slots.ram?.length ?? 1;
    const totalModules = ram.specs.modules * ramSlotCount;
    if (totalModules > mb.specs.memorySlots) {
      issues.push({
        severity: 'error',
        category: 'ram',
        relatedCategory: 'motherboard',
        message: `${totalModules} RAM modules exceed motherboard's ${mb.specs.memorySlots} memory slots`,
      });
    }
  }

  // 4. MB form factor vs Case
  if (mb && cas && mb.specs.formFactor && cas.specs.formFactors) {
    const supported: string[] = cas.specs.formFactors;
    if (!supported.includes(mb.specs.formFactor)) {
      issues.push({
        severity: 'error',
        category: 'motherboard',
        relatedCategory: 'case',
        message: `Motherboard form factor ${mb.specs.formFactor} is not supported by this case (supports: ${supported.join(', ')})`,
      });
    }
  }

  // 5. GPU length vs Case clearance
  if (gpu && cas && gpu.specs.lengthMm && cas.specs.maxGpuLengthMm) {
    if (gpu.specs.lengthMm > cas.specs.maxGpuLengthMm) {
      issues.push({
        severity: 'error',
        category: 'gpu',
        relatedCategory: 'case',
        message: `GPU length ${gpu.specs.lengthMm}mm exceeds case maximum ${cas.specs.maxGpuLengthMm}mm`,
      });
    }
  }

  // 6. Cooler height vs Case (air coolers only)
  if (cooler && cas && cooler.specs.height && cas.specs.maxCoolerHeightMm && !cooler.specs.radiatorMm) {
    if (cooler.specs.height > cas.specs.maxCoolerHeightMm) {
      issues.push({
        severity: 'error',
        category: 'cooler',
        relatedCategory: 'case',
        message: `Cooler height ${cooler.specs.height}mm exceeds case maximum ${cas.specs.maxCoolerHeightMm}mm`,
      });
    }
  }

  // 7. AIO radiator vs Case
  if (cooler && cas && cooler.specs.radiatorMm && cas.specs.radiatorSupport) {
    const supported: number[] = cas.specs.radiatorSupport;
    if (!supported.includes(cooler.specs.radiatorMm)) {
      issues.push({
        severity: 'warning',
        category: 'cooler',
        relatedCategory: 'case',
        message: `${cooler.specs.radiatorMm}mm radiator may not be supported by this case (supports: ${supported.join(', ')}mm)`,
      });
    }
  }

  // 8. Cooler socket vs CPU socket
  if (cooler && cpu && cpu.specs.socket && cooler.specs.sockets) {
    const supported: string[] = cooler.specs.sockets;
    if (!supported.includes(cpu.specs.socket)) {
      issues.push({
        severity: 'error',
        category: 'cooler',
        relatedCategory: 'cpu',
        message: `Cooler does not support CPU socket ${cpu.specs.socket}`,
      });
    }
  }

  // 9. PSU wattage vs total TDP
  if (psu && psu.specs.wattage) {
    let totalTdp = 0;
    if (cpu?.specs.tdp) totalTdp += cpu.specs.tdp;
    if (gpu?.specs.tdp) totalTdp += gpu.specs.tdp;
    if (totalTdp > 0) {
      if (totalTdp > psu.specs.wattage) {
        issues.push({
          severity: 'error',
          category: 'psu',
          message: `Total TDP ${totalTdp}W exceeds PSU capacity ${psu.specs.wattage}W`,
        });
      } else if (totalTdp > psu.specs.wattage * 0.8) {
        issues.push({
          severity: 'warning',
          category: 'psu',
          message: `Total TDP ${totalTdp}W is close to PSU capacity ${psu.specs.wattage}W (low headroom)`,
        });
      }
    }
  }

  // 10. NVMe M.2 count vs MB
  if (mb && mb.specs.m2Slots != null) {
    const storageEntries = build.slots.storage ?? [];
    let nvmeCount = 0;
    for (const entry of storageEntries) {
      if (entry.selection?.specs.interface === 'NVMe M.2') {
        nvmeCount++;
      }
    }
    if (nvmeCount > mb.specs.m2Slots) {
      issues.push({
        severity: 'error',
        category: 'storage',
        relatedCategory: 'motherboard',
        message: `${nvmeCount} NVMe M.2 drives exceed motherboard's ${mb.specs.m2Slots} M.2 slots`,
      });
    }
  }

  return issues;
}
