'use client';

/**
 * The topic sections under Today (#414 step 3): which tabs, in what order.
 * Kept in this browser only (`clearnews.topics`); nothing is sent.
 */

import { useSyncExternalStore } from 'react';

const KEY = 'clearnews.topics';
export const DEFAULT_TOPICS: readonly string[] = ['ai', 'physical_ai', 'space', 'local', 'india', 'finance'];

const listeners = new Set<() => void>();
/** Used when the browser refuses storage, so choices still last until the page closes. */
let memory: string | null = null;
let cache: { raw: string | null; value: readonly string[] } = { raw: null, value: DEFAULT_TOPICS };

function snapshot(): readonly string[] {
  let raw = memory;
  if (raw === null) {
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      raw = null;
    }
  }
  if (raw === cache.raw) return cache.value;
  let value = DEFAULT_TOPICS;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) value = parsed;
  } catch {
    // A damaged value: fall back to the defaults.
  }
  cache = { raw, value };
  return value;
}

function subscribe(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    memory = null;
    listener();
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useTopics(): readonly string[] {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_TOPICS);
}

export function saveTopics(ids: readonly string[]): void {
  const raw = JSON.stringify(ids);
  try {
    localStorage.setItem(KEY, raw);
    memory = null;
  } catch {
    memory = raw;
  }
  listeners.forEach((l) => l());
}
