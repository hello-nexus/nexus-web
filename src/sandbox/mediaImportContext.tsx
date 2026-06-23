// React context providing the app's mediaImport capability allowlist to host
// components rendered inside a sandboxed widget tree.
//
// The list originates from the manifest's `capabilities.mediaImport` field,
// flows through SandboxedWidget props, and is checked by MediaImportHost
// before touching the file picker or the network.

import { createContext, useContext, type ReactNode } from 'react';

const MediaImportContext = createContext<string[]>([]);

export function MediaImportProvider({ allowed, children }: { allowed: string[]; children: ReactNode }) {
  return <MediaImportContext.Provider value={allowed}>{children}</MediaImportContext.Provider>;
}

/** Returns the list of service paths the current widget is allowed to upload to. */
export function useMediaImportAllowlist(): string[] {
  return useContext(MediaImportContext);
}
