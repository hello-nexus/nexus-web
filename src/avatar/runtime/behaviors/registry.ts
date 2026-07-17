/**
 * Tiered script-sync registry: one entry per Unity MonoBehaviour type that
 * appears in a pack's scripts.json (the exporter inventories every script on
 * the exported hierarchy with a sha256 of its C# source).
 *
 * scripts/check-script-sync.mjs compares a pack against this map: a ported
 * script whose sourceHash no longer matches portedFromHash, or a script type
 * with no entry at all, is a flagged port task.
 *
 * Statuses:
 * - ported: `module` implements the behavior; `portedFromHash` is the C#
 *   sourceHash the port was last verified against. Re-porting a diff ends by
 *   updating portedFromHash to the new hash.
 * - unported: real feature, not yet ported; `module` is the planned target.
 * - ignored: intentionally never ported (reason in `notes`).
 *
 * Keep the entries JSON-compatible object literals (no computed values); the
 * checker has a text-extraction fallback for Node runtimes without TS type
 * stripping.
 */

export type ScriptPortStatus = 'ported' | 'unported' | 'ignored';

export interface ScriptPortEntry {
  /** Runtime module implementing (or planned to implement) the behavior; '' when ignored. */
  module: string;
  status: ScriptPortStatus;
  /** sha256 of the C# source the port tracks (scripts.json sourceHash); null unless ported. */
  portedFromHash: string | null;
  notes?: string;
}

export const scriptRegistry: Record<string, ScriptPortEntry> = {
  NexusBridge: {
    module: 'src/runtime/behaviors/nexusBridge.ts',
    status: 'ported',
    portedFromHash: '9bd5ee8d686342d419d40be1d773d7b47dc98300d82d7b95a850e8cd2109e494',
  },
  CameraController: {
    module: 'src/runtime/behaviors/cameraController.ts',
    status: 'ported',
    portedFromHash: 'd21bb2386c40bbb2e7255d52ddd7e18532226a39b2edd3ba9dc1993b793adff4',
  },
  IntroSequence: {
    module: 'src/runtime/behaviors/introSequence.ts',
    status: 'ported',
    portedFromHash: '53241d82fa63a156696329de7b38adaa60ca62e6f3a09780bc0f75633d994f12',
    notes: 'fade overlay is host-driven via onFadeProgress',
  },
  DemoAnimationSequencer: {
    module: 'src/runtime/behaviors/demoSequencer.ts',
    status: 'ported',
    portedFromHash: '13690b3bbe506456f3b99f4f026d97bedc184653f19bba29cb9a367c5feb1174',
  },
  BakedLipSyncDriver: {
    module: 'src/runtime/behaviors/lipSyncDriver.ts',
    status: 'unported',
    portedFromHash: null,
    notes: 'baked lip-sync weights onto a blendshape; needs the audio pipeline',
  },
  HeartChargeController: {
    module: 'src/runtime/behaviors/heartCharge.ts',
    status: 'unported',
    portedFromHash: null,
  },
  GameController: {
    module: '',
    status: 'ignored',
    portedFromHash: null,
    notes: 'legacy React score bridge; superseded by NexusBridge',
  },
  DisplayController: {
    module: '',
    status: 'ignored',
    portedFromHash: null,
    notes: 'fullscreen/multi-display handling is a host concern',
  },
  DemoController: {
    module: '',
    status: 'ignored',
    portedFromHash: null,
    notes: 'folded into cameraController/demoSequencer options',
  },
};
