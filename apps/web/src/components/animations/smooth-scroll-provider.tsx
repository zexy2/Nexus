"use client";

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Lenis from "lenis";

/* ===========================================
   SMOOTH SCROLL CONTEXT
   Exposes both the Lenis instance and a live scrollVelocity value
   so any child component can react to scroll speed (parallax,
   header hide/show, velocity-based effects, etc.).
   =========================================== */

interface SmoothScrollContextValue {
  lenis: Lenis | null;
  /** Current scroll velocity (pixels/second). Updated every rAF tick. */
  scrollVelocity: number;
}

const SmoothScrollContext = createContext<SmoothScrollContextValue>({
  lenis: null,
  scrollVelocity: 0,
});

interface SmoothScrollProviderProps {
  children: ReactNode;
}

export function SmoothScrollProvider({ children }: SmoothScrollProviderProps) {
  const lenisRef = useRef<Lenis | null>(null);
  const rafIdRef = useRef<number>(0);
  const lenisSubscribersRef = useRef(new Set<() => void>());
  const [scrollVelocity, setScrollVelocity] = useState(0);

  const subscribeLenis = useCallback((listener: () => void) => {
    lenisSubscribersRef.current.add(listener);
    return () => {
      lenisSubscribersRef.current.delete(listener);
    };
  }, []);

  const getLenisSnapshot = useCallback(() => lenisRef.current, []);
  const getServerLenisSnapshot = useCallback(() => null, []);

  const lenisInstance = useSyncExternalStore(
    subscribeLenis,
    getLenisSnapshot,
    getServerLenisSnapshot,
  );

  useEffect(() => {
    const lenisSubscribers = lenisSubscribersRef.current;

    // Initialize Lenis smooth scroll with fine-tuned physics
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      lerp: 0.075,
      wheelMultiplier: 0.8,
      touchMultiplier: 1.5,
    });

    lenisRef.current = lenis;
    lenisSubscribers.forEach((listener) => listener());

    // Expose Lenis on window so external scripts / devtools can access it
    (window as unknown as { lenis?: Lenis }).lenis = lenis;

    // Track scroll velocity on every scroll event
    lenis.on("scroll", (e: Lenis) => {
      setScrollVelocity(e.velocity);
    });

    // Animation frame loop with proper cleanup
    function raf(time: number) {
      lenis.raf(time);
      rafIdRef.current = requestAnimationFrame(raf);
    }

    rafIdRef.current = requestAnimationFrame(raf);

    // Cleanup
    return () => {
      cancelAnimationFrame(rafIdRef.current);
      lenis.destroy();
      lenisRef.current = null;
      lenisSubscribers.forEach((listener) => listener());
      delete (window as unknown as { lenis?: Lenis }).lenis;
    };
  }, []);

  return (
    <SmoothScrollContext.Provider
      value={{ lenis: lenisInstance, scrollVelocity }}
    >
      {children}
    </SmoothScrollContext.Provider>
  );
}

/* ===========================================
   HOOKS
   =========================================== */

/**
 * Access the Lenis instance and current scroll velocity.
 *
 * Usage:
 *   const { lenis, scrollVelocity } = useSmoothScroll();
 *
 * To prevent Lenis from intercepting scroll on a particular element
 * (e.g. a scrollable modal or code block), add the `data-lenis-prevent`
 * attribute to that element:
 *
 *   <div data-lenis-prevent>
 *     {/* scrollable content that Lenis should not hijack *\/}
 *   </div>
 *
 * You can also use `data-lenis-prevent-wheel` or `data-lenis-prevent-touch`
 * for more granular control.
 */
export function useSmoothScroll(): SmoothScrollContextValue {
  return useContext(SmoothScrollContext);
}

/**
 * Legacy hook — returns just the Lenis instance for backwards compatibility.
 */
export function useLenis(): Lenis | null {
  const { lenis } = useContext(SmoothScrollContext);
  return lenis;
}
