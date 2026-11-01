'use client';

/**
 * "New since your last visit" (#414 step 3). Kept in this browser only; nothing is sent.
 *
 * The site notes when it was last open (`clearnews.lastSeen`). A visit starts
 * after 30 minutes away, and its baseline (`clearnews.visitBase`) is the moment
 * the previous visit ended: stories published after it are new. A reload or a
 * quick tab switch keeps the baseline. On a first visit nothing is marked.
 */

import { useSyncExternalStore } from 'react';

const LAST_SEEN = 'clearnews.lastSeen';
const BASE = 'clearnews.visitBase';
const GAP_MS = 30 * 60e3;

let base: number | null = null;
let started = false;
/** Whether the page has been visible; a tab opened in the background is not a visit yet. */
let shown = false;
const listeners = new Set<() => void>();
const newVisitHandlers = new Set<() => void>();

function read(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function write(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    // Storage off (a private window or blocked site data): no "new" marks.
  }
}

function setBase(next: number | null): void {
  if (next === base) return;
  base = next;
  listeners.forEach((l) => l());
}

/** On load, and each time the page becomes visible again. */
function arrive(onLoad: boolean): void {
  shown = true;
  const now = Date.now();
  const lastSeen = read(LAST_SEEN);
  write(LAST_SEEN, now);
  if (lastSeen === null) return;
  if (now - lastSeen <= GAP_MS) {
    setBase(read(BASE));
    return;
  }
  write(BASE, lastSeen);
  setBase(lastSeen);
  if (!onLoad) newVisitHandlers.forEach((h) => h());
}

function start(): void {
  if (started) return;
  started = true;
  if (document.visibilityState === 'visible') arrive(true);
  const touch = () => shown && write(LAST_SEEN, Date.now());
  document.addEventListener('visibilitychange', () => {
    // Shown again (or for the first time, after loading in the background): a new visit
    // after 30 minutes away also reloads the stories.
    if (document.visibilityState !== 'visible') touch();
    else arrive(false);
  });
  window.addEventListener('pagehide', touch);
  setInterval(() => document.visibilityState === 'visible' && touch(), 60e3);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

/** When the previous visit ended (stories published after it are new); null on a first visit. */
export function useVisitBase(): number | null {
  return useSyncExternalStore(subscribe, () => base, () => null);
}

/** Runs `handler` when the reader comes back after 30 minutes away with the page still open. */
export function onNewVisit(handler: () => void): () => void {
  newVisitHandlers.add(handler);
  return () => newVisitHandlers.delete(handler);
}

export const isNew = (publishedAt: string | undefined, since: number | null): boolean =>
  since !== null && !!publishedAt && Date.parse(publishedAt) > since;
