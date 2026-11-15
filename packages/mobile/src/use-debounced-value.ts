import { useEffect, useState } from 'react';

/**
 * `value`, once it has stopped changing for `delay` ms. Unlike
 * useDeferredValue, this really waits, so typing "mowing" sends one search,
 * not six.
 */
export function useDebouncedValue<T>(value: T, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
