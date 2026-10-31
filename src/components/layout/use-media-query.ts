"use client";

import { useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query. Returns `false` during server rendering and
 * hydration, then the live value, so markup never mismatches.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const subscribeNever = () => () => {};

/** True on Apple platforms, where the shortcut modifier is ⌘ rather than Ctrl. */
export function useIsApplePlatform(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () =>
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}
