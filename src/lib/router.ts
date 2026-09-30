import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("popstate", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("popstate", fn);
  };
}

export function navigate(to: string, replace = false) {
  if (to === location.pathname) return;
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  window.scrollTo(0, 0);
  listeners.forEach((fn) => fn());
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => location.pathname);
}
