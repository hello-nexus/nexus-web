import { describe, expect, it } from 'vitest';
import { shortBoard, shortCooler, shortCpu, shortGpu, shortRam, shortStorage } from './shortSpecs';

describe('shortCpu', () => {
  it.each([
    ['AMD Ryzen 7 9800X3D', 'Ryzen 7 9800X3D'],
    ['AMD Ryzen 9 7950X 16-Core Processor', 'Ryzen 9 7950X'],
    ['Intel(R) Core(TM) i7-12700KF @ 3.60GHz', 'Core i7-12700KF'],
    ['Intel(R) Core(TM) Ultra 9 285K', 'Core Ultra 9 285K'],
    ['12th Gen Intel(R) Core(TM) i5-12400', '12th Gen Core i5-12400'],
  ])('%s -> %s', (input, expected) => expect(shortCpu(input)).toBe(expected));
});

describe('shortGpu', () => {
  it.each([
    ['NVIDIA GeForce RTX 5080', 'RTX 5080'],
    ['NVIDIA GeForce GTX 1660 SUPER', 'GTX 1660 SUPER'],
    ['NVIDIA Founders Edition GeForce RTX 5080', 'RTX 5080'],
    ['AMD Radeon RX 7900 XTX', 'RX 7900 XTX'],
    ['AMD Radeon(TM) Graphics', 'Radeon Graphics'],
    ['Intel(R) Arc(TM) A770 Graphics', 'Arc A770'],
    ['NVIDIA GeForce RTX 4070 Laptop GPU', 'RTX 4070'],
  ])('%s -> %s', (input, expected) => expect(shortGpu(input)).toBe(expected));
});

describe('shortRam', () => {
  it.each([
    ['32 GB DDR5-5600 (2 × 16 GB Crucial CP16G60C48U5.M8B2)', '32 GB DDR5'],
    ['16 GB DDR4-3200 (2 × 8 GB Corsair CMK16GX4M2B3200C16)', '16 GB DDR4'],
    ['64 GB LPDDR5X-7500', '64 GB LPDDR5X'],
    ['8 GB', '8 GB'],
  ])('%s -> %s', (input, expected) => expect(shortRam(input)).toBe(expected));
});

describe('shortStorage', () => {
  it.each([
    ['1.82 TB WDS200T1X0E-00AFY0 NVMe', '2 TB NVMe'],
    ['931 GB Samsung SSD 870 EVO SSD', '1 TB SSD'],
    ['465 GB WDC WD5000 HDD', '500 GB HDD'],
    ['238 GB KBG40ZNS256G NVMe', '256 GB NVMe'],
    ['3.64 TB ST4000DM004', '4 TB'],
    ['1.82 TB A NVMe + 931 GB B SSD', '2 TB NVMe + 1 TB SSD'],
  ])('%s -> %s', (input, expected) => expect(shortStorage(input)).toBe(expected));
});

describe('shortBoard', () => {
  it.each([
    ['Gigabyte B850I AORUS PRO', 'B850I AORUS PRO'],
    ['ASUSTeK COMPUTER INC. ROG STRIX B650-A GAMING WIFI', 'ROG STRIX B650-A GAMING WIFI'],
    ['Micro-Star International Co., Ltd. MAG B550 TOMAHAWK', 'MAG B550 TOMAHAWK'],
    ['ASRock X670E Taichi', 'X670E Taichi'],
  ])('%s -> %s', (input, expected) => expect(shortBoard(input)).toBe(expected));
});

describe('shortCooler', () => {
  it.each([
    ['Corsair iCUE H150i Elite', 'iCUE H150i Elite'],
    ['NZXT Kraken Plus 240mm AIO', 'Kraken Plus 240mm AIO'],
    ['Noctua NH-D15', 'NH-D15'],
    ['Unknown Thing', 'Unknown Thing'],
  ])('%s -> %s', (input, expected) => expect(shortCooler(input)).toBe(expected));
});
