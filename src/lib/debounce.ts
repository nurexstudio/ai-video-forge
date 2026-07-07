/**
 * Generic debounce helper with cancel(). We use it in the timeline to coalesce
 * the flood of `updateClip` mutations that fire during a single drag gesture
 * into one write, keeping the Convex DB in sync without spamming it.
 *
 * The returned function exposes `.cancel()` so callers (e.g. React effects on
 * unmount) can clear any pending timeout instead of letting it fire after the
 * component is gone.
 */
export interface DebouncedFn<TArgs extends unknown[]> {
  (...args: TArgs): void;
  cancel: () => void;
}

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void | Promise<void>,
  ms = 300,
): DebouncedFn<TArgs> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = ((...args: TArgs) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void fn(...args);
    }, ms);
  }) as DebouncedFn<TArgs>;
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}
