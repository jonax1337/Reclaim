/**
 * Per-route scroll restoration for the Layout `<main>` container.
 *
 * - `hashchange` (synchronous, before Svelte reactivity) captures the outgoing
 *   scrollTop while it's still accurate, and freezes the scroll listener so
 *   the browser's auto-clamp during route swap doesn't overwrite the saved
 *   value with 0.
 * - `onRouteChange(next)` is called from a Layout `$effect` tracking
 *   router.location. It schedules a single jump on the next paint.
 *
 * Each navigation cancels the previous pending restore so rapid clicks don't
 * fight each other.
 */

const positions = new Map<string, number>();

let scrollEl: HTMLElement | null = null;
let currentRoute: string | null = null;
let savingPaused = false;
let attached = false;
let pendingFrame: number | null = null;
let resumeTimer: ReturnType<typeof setTimeout> | null = null;

function onScroll() {
  if (savingPaused) return;
  if (!scrollEl || currentRoute === null) return;
  positions.set(currentRoute, scrollEl.scrollTop);
}

function onHashChange() {
  if (scrollEl && currentRoute !== null) {
    positions.set(currentRoute, scrollEl.scrollTop);
  }
  savingPaused = true;
  if (resumeTimer) {
    clearTimeout(resumeTimer);
    resumeTimer = null;
  }
}

export function setScrollContainer(el: HTMLElement, initialRoute: string): () => void {
  scrollEl = el;
  currentRoute = initialRoute;
  if (!attached) {
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("hashchange", onHashChange);
    attached = true;
  }
  return () => {
    if (attached) {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("hashchange", onHashChange);
      attached = false;
    }
    scrollEl = null;
    currentRoute = null;
  };
}

export function onRouteChange(nextRoute: string): void {
  currentRoute = nextRoute;
  if (!scrollEl) return;
  // Cancel any pending restore from a previous nav so we don't fight ourselves
  // when the user clicks two links in quick succession.
  if (pendingFrame !== null) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }
  const target = positions.get(nextRoute) ?? 0;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = null;
      if (scrollEl) scrollEl.scrollTop = target;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        savingPaused = false;
        resumeTimer = null;
      }, 200);
    });
  });
}

export function clearScrollFor(path: string): void {
  positions.delete(path);
}
