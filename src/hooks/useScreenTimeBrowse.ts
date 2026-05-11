import { useCallback, useEffect, useState } from 'react';
import { deleteService, fetchService, postService } from '../api/service';

export interface DayBreakdown {
  date: string;
  totalMs: number;
  pickups: number;
  apps: { name: string; totalMs: number }[];
  hourlyMs: number[];
}

export interface DayTotal {
  date: string;
  totalMs: number;
  pickups: number;
}

export interface AppHistory {
  appName: string;
  daily: DayTotal[];
  longestSessionMs: number;
  totalPickups: number;
  totalMs: number;
}

export interface DeleteResult {
  deleted: number;
}

export interface TrackingStatus {
  enabled: boolean;
}

const EMPTY_DAY: DayBreakdown = {
  date: '',
  totalMs: 0,
  pickups: 0,
  apps: [],
  hourlyMs: new Array(24).fill(0),
};

export function useScreenTimeDay(date: string) {
  const [data, setData] = useState<DayBreakdown>(EMPTY_DAY);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true);
    const r = await fetchService<DayBreakdown>(`/api/screentime/day/${date}`);
    setData(r ?? { ...EMPTY_DAY, date });
    setLoading(false);
  }, [date]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload };
}

export function useScreenTimeRange(from: string, to: string) {
  const [data, setData] = useState<DayTotal[]>([]);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true);
    const r = await fetchService<DayTotal[]>(`/api/screentime/range?from=${from}&to=${to}`);
    setData(r ?? []);
    setLoading(false);
  }, [from, to]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload };
}

export function useScreenTimeApp(name: string, from: string, to: string) {
  const [data, setData] = useState<AppHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!name) {
      setData(null);
      return;
    }
    setLoading(true);
    const r = await fetchService<AppHistory>(`/api/screentime/app/${encodeURIComponent(name)}?from=${from}&to=${to}`);
    setData(r);
    setLoading(false);
  }, [name, from, to]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload };
}

export function useScreenTimeHour(date: string, hour: number | null) {
  const [data, setData] = useState<{ name: string; totalMs: number }[]>([]);
  useEffect(() => {
    if (hour === null) {
      setData([]);
      return;
    }
    let cancelled = false;
    fetchService<{ name: string; totalMs: number }[]>(`/api/screentime/day/${date}/hour/${hour}`)
      .then(r => { if (!cancelled) setData(r ?? []); });
    return () => { cancelled = true; };
  }, [date, hour]);
  return data;
}

export function deleteScreenTimeDay(date: string) {
  return deleteService<DeleteResult>(`/api/screentime/day/${date}`);
}

export function deleteScreenTimeRange(from: string, to: string) {
  return deleteService<DeleteResult>(`/api/screentime/range?from=${from}&to=${to}`);
}

export function deleteScreenTimeApp(name: string) {
  return deleteService<DeleteResult>(`/api/screentime/app/${encodeURIComponent(name)}`);
}

export function deleteScreenTimeAll() {
  return deleteService<DeleteResult>('/api/screentime/all');
}

export function getTrackingStatus() {
  return fetchService<TrackingStatus>('/api/screentime/tracking');
}

export function setTrackingEnabled(enabled: boolean) {
  return postService<TrackingStatus>('/api/screentime/tracking', { enabled });
}
