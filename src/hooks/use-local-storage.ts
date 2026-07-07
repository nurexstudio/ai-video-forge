import { useCallback, useEffect, useState } from "react";

/**
 * Reactive state backed by window.localStorage.
 *
 * - Hydrates from storage on mount (or the initial value / factory).
 * - Persists every setter call so cross-component reads stay in sync.
 * - Subscribes to the window `storage` event so other tabs/windows see updates.
 *
 * Use this in place of a raw `localStorage.getItem/setItem` pair whenever more
 * than one component reads or writes the same key, to avoid silent
 * stale-reads and race conditions.
 */
export function useLocalStorage<T>(
  key: string,
  initial: T | (() => T),
): [T, (next: T | ((cur: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return typeof initial === "function" ? (initial as () => T)() : initial;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      /* fall through to initial */
    }
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  // Persist on every change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / privacy mode — accept the loss silently */
    }
  }, [key, value]);

  // Listen for cross-tab updates so other windows of the app stay in sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue == null) return;
      try {
        setValue(JSON.parse(e.newValue) as T);
      } catch {
        /* ignore malformed writes */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const set = useCallback(
    (next: T | ((cur: T) => T)) => {
      setValue((cur) => {
        const resolved =
          typeof next === "function" ? (next as (cur: T) => T)(cur) : next;
        return resolved;
      });
    },
    [],
  );

  const clear = useCallback(() => {
    setValue(typeof initial === "function" ? (initial as () => T)() : initial);
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [initial, key]);

  return [value, set, clear];
}
