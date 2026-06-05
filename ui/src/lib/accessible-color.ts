/**
 * Accessible derivations of brand / graph-layer accent colours.
 *
 * The five layer accents (L1 #2471A3 … L5 #7D3C98) and the insurer brand
 * colours are tuned for the graph visualisation, where they sit on large
 * nodes and only need to clear WCAG's 3:1 non-text threshold. Several of them
 * (L2 teal, L3 green, L4 orange) fall below the 4.5:1 ratio AA requires when
 * the same hex is used as small text, or as a solid background behind white
 * text. These helpers nudge a brand hex just dark/light enough to clear 4.5:1
 * on a given surface while preserving its hue — so the patient cards keep
 * their per-source colour coding without failing the contrast audit
 * (`__tests__/e2e/journeys/27-wcag-accessibility.spec.ts`).
 */

const AA_NORMAL = 4.5;

type RGB = [number, number, number];

function srgbToLinear(channel: number): number {
  const x = channel / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: RGB): number {
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

function parseHex(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: RGB): string {
  const channel = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** WCAG contrast ratio between two colours (order-independent). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseHex(a));
  const lb = relativeLuminance(parseHex(b));
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

function darken([r, g, b]: RGB, factor: number): RGB {
  return [r * factor, g * factor, b * factor];
}

function lighten([r, g, b]: RGB, amount: number): RGB {
  return [
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  ];
}

/**
 * Darken `hex` (preserving hue) until it clears 4.5:1 against a light `bg`.
 * Use for brand-as-text in light mode, and — since contrast is symmetric — as
 * a solid background that carries white text.
 */
export function onLightSurface(hex: string, bg = "#ffffff"): string {
  let rgb = parseHex(hex);
  for (let i = 0; i < 48 && contrastRatio(toHex(rgb), bg) < AA_NORMAL; i++) {
    rgb = darken(rgb, 0.92);
  }
  return toHex(rgb);
}

/** Lighten `hex` (preserving hue) until it clears 4.5:1 on a dark `bg`. */
export function onDarkSurface(hex: string, bg = "#060e20"): string {
  let rgb = parseHex(hex);
  for (let i = 0; i < 48 && contrastRatio(toHex(rgb), bg) < AA_NORMAL; i++) {
    rgb = lighten(rgb, 0.08);
  }
  return toHex(rgb);
}

/**
 * A brand colour darkened just enough that WHITE text on it clears 4.5:1.
 * Theme-independent (white-on-colour reads the same in both modes).
 */
export function brandBackgroundForWhiteText(hex: string): string {
  return onLightSurface(hex, "#ffffff");
}

/**
 * Light- and dark-mode text colours derived from a brand hex, each meeting
 * AA on the respective card surface (light `#ffffff`, dark `#060e20`).
 * Apply via CSS custom properties + `text-[var(--x)] dark:text-[var(--y)]`.
 */
export function accessibleBrandText(hex: string): {
  light: string;
  dark: string;
} {
  return { light: onLightSurface(hex), dark: onDarkSurface(hex) };
}
