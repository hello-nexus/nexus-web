import { DeviceModal } from '../DeviceModal/DeviceModal';
import { ImportCenter, type ImportSourceId } from './ImportCenter';

/** Sources that only exist on Windows, so no other platform offers them. */
const WINDOWS_ONLY: ImportSourceId[] = ['fancontrol', 'nexus2'];

/**
 * Which of `wanted` can exist on `platform`, in the order given. An empty
 * result means the entry point that would open this dialog should not be
 * there at all - it could only ever show a permanent "not found".
 */
export function availableImportSources(platform: string, wanted: ImportSourceId[]): ImportSourceId[] {
  if (platform === 'windows') return wanted;
  return wanted.filter(id => !WINDOWS_ONLY.includes(id));
}

export interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Modal heading. Each entry point names what it is bringing over. */
  title: string;
  /** Apps to offer, in list order. */
  sources: ImportSourceId[];
  /** Fires after a successful import so the host can refetch. */
  onImported?: () => void;
}

/**
 * Modal host for <ImportCenter>: the on-demand entry points (the cooling
 * page's preset dropdown, the Settings entry) open this, while the onboarding
 * gates embed the same ImportCenter in their own full-screen surface.
 *
 * The modal body is the single scroller, so a tall preview scrolls as one page.
 */
export function ImportDialog({ open, onClose, title, sources, onImported }: ImportDialogProps) {
  return (
    <DeviceModal open={open} onClose={onClose} title={title} large>
      <ImportCenter open={open} sources={sources} onImported={onImported} />
    </DeviceModal>
  );
}
