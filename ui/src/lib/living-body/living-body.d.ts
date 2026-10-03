/** Types for living-body.js, which stays plain JavaScript as vendored. */

export type LivingBodyTheme = "auto" | "light" | "dark";

export interface LivingBodyOptions {
  /** "auto" follows html.dark, then [data-theme], then the OS. */
  theme?: LivingBodyTheme;
  /** Labels and values drawn into the canvas. Off by default. */
  text?: boolean;
  /** Dot density; "auto" starts high and steps down on slow devices. */
  detail?: "auto" | number;
}

export interface LivingBodyStats {
  detail: number;
  nodes: number;
  edges: number;
  frames: number;
  fps: number;
  interval: { p50: number; p95: number; p99: number; max: number };
  script: { p50: number; p95: number; max: number };
  longFrames: number;
}

export interface LivingBodyInstance {
  stats(): LivingBodyStats;
  resetStats(): void;
  destroy(): void;
  setTheme(theme: LivingBodyTheme): void;
}

export function mount(
  container: HTMLElement,
  opts?: LivingBodyOptions,
): LivingBodyInstance;
