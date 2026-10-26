import { useEffect, useRef } from 'react';

/**
 * A `<details>` drop-down that behaves like a menu: it closes on a tap anywhere outside it and on
 * navigation (the header stays mounted across pages). Opening one header menu therefore closes the other.
 */
export function useDetailsMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = () => ref.current?.removeAttribute('open');
    const onDown = (e: PointerEvent) => {
      const d = ref.current;
      if (d?.open && !d.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('hashchange', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('hashchange', close);
    };
  }, []);
  return ref;
}
