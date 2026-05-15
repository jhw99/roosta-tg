'use client';

/**
 * Local "circles being deleted" registry.
 *
 * After a user submits an EmergencyCancel intent we mark the circle locally so
 * the home list can show a non-clickable "Deleting…" row until the indexer
 * flips the on-chain status to `cancelled` (typically 30 s – 2 min). Entries
 * auto-expire after a few minutes so a stuck row never lingers forever.
 */
const STORAGE_KEY = 'roosta_deleting_circles_v1';
const TTL_MS = 5 * 60 * 1000;

interface Entry {
  address: string;
  ts: number;
}

function read(): Entry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Entry[];
    const now = Date.now();
    return arr.filter((e) => e && typeof e.address === 'string' && now - e.ts < TTL_MS);
  } catch {
    return [];
  }
}

function write(entries: Entry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full or disabled — best-effort only
  }
}

export function markDeleting(address: string): void {
  const entries = read().filter((e) => e.address !== address);
  entries.push({ address, ts: Date.now() });
  write(entries);
}

export function clearDeleting(address: string): void {
  write(read().filter((e) => e.address !== address));
}

export function getDeletingSet(): Set<string> {
  return new Set(read().map((e) => e.address));
}
