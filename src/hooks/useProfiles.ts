import { useCallback, useEffect, useState } from 'react';
import {
  fetchProfiles, createProfile as apiCreate, switchProfile as apiSwitch,
  renameProfile as apiRename, deleteProfile as apiDelete,
  exportProfile as apiExport, importProfileFile as apiImport,
  fetchSharing, setPrimaryProfile as apiSetPrimary, setCategoryShared as apiSetCategoryShared,
  resetProfile as apiResetProfile, resetProfileCategory as apiResetProfileCategory,
  type ProfileEntry, type Preferences, type ProfileCategory, type SharingConfig,
} from '../api/profiles';

const ORDER_KEY = 'nexus_profile_order';

function loadOrder(): string[] {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); }
  catch { return []; }
}

function saveOrder(ids: string[]) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
}

function sortByOrder(profiles: ProfileEntry[], order: string[]): ProfileEntry[] {
  if (order.length === 0) return profiles;
  const indexMap = new Map(order.map((id, i) => [id, i]));
  return [...profiles].sort((a, b) => {
    const ai = indexMap.get(a.id) ?? Infinity;
    const bi = indexMap.get(b.id) ?? Infinity;
    return ai - bi;
  });
}

export interface UseProfilesResult {
  profiles: ProfileEntry[];
  activeId: string;
  switchProfile: (id: string) => Promise<Preferences | null>;
  createProfile: (name: string) => Promise<void>;
  renameProfile: (id: string, name: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  exportProfile: (id: string) => Promise<void>;
  importProfile: (file: File) => Promise<void>;
  reorderProfiles: (ids: string[]) => void;
  refresh: () => Promise<void>;
  loading: boolean;
}

export function useProfiles(enabled: boolean): UseProfilesResult {
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const data = await fetchProfiles();
    if (data) {
      const order = loadOrder();
      setProfiles(sortByOrder(data.profiles ?? [], order));
      setActiveId(data.activeId ?? '');
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [enabled, refresh]);

  const switchProfileFn = useCallback(async (id: string): Promise<Preferences | null> => {
    // Optimistic: flip the active highlight in the UI immediately so the
    // dropdown and settings list feel instant. The server call + manifest
    // refresh continue in the background; if the call fails the refresh
    // reverts the local state.
    setActiveId(id);
    try {
      const resp = await apiSwitch(id);
      if (resp) {
        if (resp.switched && resp.switched !== id) setActiveId(resp.switched);
        // Background refresh - manifest `updatedAt` etc. matter for the
        // settings list ordering but not for the switch UX.
        refresh().catch(() => { /* best-effort */ });
        return resp.prefs;
      }
    } catch {
      // fall through to revert
    }
    refresh().catch(() => { /* best-effort */ });
    return null;
  }, [refresh]);

  const createProfileFn = useCallback(async (name: string) => {
    await apiCreate(name);
    await refresh();
  }, [refresh]);

  const renameProfileFn = useCallback(async (id: string, name: string) => {
    await apiRename(id, name);
    await refresh();
  }, [refresh]);

  const deleteProfileFn = useCallback(async (id: string) => {
    await apiDelete(id);
    await refresh();
  }, [refresh]);

  const exportProfileFn = useCallback(async (id: string) => {
    const entry = profiles.find(p => p.id === id);
    await apiExport(id, entry?.name ?? 'profile');
  }, [profiles]);

  const importProfileFn = useCallback(async (file: File) => {
    await apiImport(file);
    await refresh();
  }, [refresh]);

  const reorderProfilesFn = useCallback((ids: string[]) => {
    saveOrder(ids);
    setProfiles(prev => sortByOrder(prev, ids));
  }, []);

  return {
    profiles, activeId, switchProfile: switchProfileFn,
    createProfile: createProfileFn, renameProfile: renameProfileFn,
    deleteProfile: deleteProfileFn, exportProfile: exportProfileFn,
    importProfile: importProfileFn, reorderProfiles: reorderProfilesFn,
    refresh, loading,
  };
}

export interface UseProfileSharingResult {
  config: SharingConfig | null;
  loading: boolean;
  setPrimary: (profileId: string) => Promise<void>;
  setCategoryShared: (category: ProfileCategory, shared: boolean) => Promise<void>;
  resetProfile: (profileId: string) => Promise<void>;
  resetCategory: (profileId: string, category: ProfileCategory) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useProfileSharing(enabled: boolean): UseProfileSharingResult {
  const [config, setConfig] = useState<SharingConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const data = await fetchSharing();
    if (data) setConfig(data);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [enabled, refresh]);

  const setPrimary = useCallback(async (profileId: string) => {
    await apiSetPrimary(profileId);
    await refresh();
  }, [refresh]);

  const setCategorySharedFn = useCallback(async (category: ProfileCategory, shared: boolean) => {
    await apiSetCategoryShared(category, shared);
    await refresh();
  }, [refresh]);

  const resetProfileFn = useCallback(async (profileId: string) => {
    await apiResetProfile(profileId);
  }, []);

  const resetCategoryFn = useCallback(async (profileId: string, category: ProfileCategory) => {
    await apiResetProfileCategory(profileId, category);
  }, []);

  return {
    config, loading,
    setPrimary,
    setCategoryShared: setCategorySharedFn,
    resetProfile: resetProfileFn,
    resetCategory: resetCategoryFn,
    refresh,
  };
}
