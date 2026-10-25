/**
 * What the solver treats as an obstacle, per case. A case with no entry here keeps the generic set, so adding a case means adding one entry.
 * Keys are `caseModel` names as Build resolves them.
 */
export interface CaseProfile {
  /** Part slots that are solid. */
  solidParts: ReadonlySet<string>;
  /** Part slots that slow air without stopping it. */
  porousParts: ReadonlySet<string>;
  /** Structure boxes of the case itself (chamber divider, tray and shroud plates): solid when their longest side is at least this many mm. Null leaves them out. */
  structureMinSideMm: number | null;
}

export const GENERIC_PROFILE: CaseProfile = {
  solidParts: new Set(['gpu', 'psu', 'motherboard', 'storage', 'ram', 'cpu']),
  porousParts: new Set(['cooler']),
  structureMinSideMm: null,
};

/** Dual chamber: the divider, the board tray and the PSU shroud are what air meets. RAM, drives and cables are too small to steer it. */
const DUAL_CHAMBER: CaseProfile = {
  solidParts: new Set(['gpu', 'psu', 'motherboard']),
  porousParts: new Set(['cooler']),
  structureMinSideMm: 150,
};

export const CASE_PROFILES: Readonly<Record<string, CaseProfile>> = {
  'HYTE Y70': DUAL_CHAMBER,
  'HYTE Y60': DUAL_CHAMBER,
  'HYTE Y50': DUAL_CHAMBER,
};

export const profileFor = (caseModel: string | undefined): CaseProfile => (caseModel ? CASE_PROFILES[caseModel] : undefined) ?? GENERIC_PROFILE;
