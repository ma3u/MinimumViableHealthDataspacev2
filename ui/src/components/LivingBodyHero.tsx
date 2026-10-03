"use client";

import { useEffect, useRef } from "react";
import type {
  LivingBodyInstance,
  LivingBodyTheme,
} from "@/lib/living-body/living-body";

/**
 * The start page's hero animation: the body as a network of organs, walking in
 * place, drawn on a canvas by the vendored living-body library. It loads on the
 * client only, in its own chunk, after the page has painted, and pauses while
 * scrolled out of view. The canvas carries its own aria-label.
 */
export function LivingBodyHero({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    // jsdom, where the unit tests render this page, has no matchMedia and no
    // 2D canvas; the library needs both.
    if (!el || typeof window.matchMedia !== "function") return;

    // The UI marks dark mode with the "dark" class on <html> and nothing else.
    // Left on "auto", the library would read a missing class as "follow the
    // OS" and draw a dark figure on the light page for anyone with a dark OS.
    const root = document.documentElement;
    const theme = (): LivingBodyTheme =>
      root.classList.contains("dark") ? "dark" : "light";

    let body: LivingBodyInstance | null = null;
    let cancelled = false;
    const observer = new MutationObserver(() => body?.setTheme(theme()));

    import("@/lib/living-body/living-body")
      .then(({ mount }) => {
        if (cancelled) return;
        body = mount(el, { theme: theme() });
        observer.observe(root, {
          attributes: true,
          attributeFilter: ["class"],
        });
      })
      .catch((err) => {
        console.warn("Living body animation did not start:", err);
      });

    return () => {
      cancelled = true;
      observer.disconnect();
      body?.destroy();
    };
  }, []);

  return <div ref={ref} className={className} />;
}
