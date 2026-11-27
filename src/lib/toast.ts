import { useSyncExternalStore } from 'react';

export type ToastKind = 'achievement' | 'level' | 'info' | 'record';

export type ToastItem = {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  icon?: string;
};

let items: ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function pushToast(toast: Omit<ToastItem, 'id'>, ttl = 4200) {
  const item: ToastItem = { ...toast, id: ++counter };
  items = [...items.slice(-2), item];
  emit();
  window.setTimeout(() => dismissToast(item.id), ttl);
}

export function dismissToast(id: number) {
  const next = items.filter((t) => t.id !== id);
  if (next.length !== items.length) {
    items = next;
    emit();
  }
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, () => items);
}
