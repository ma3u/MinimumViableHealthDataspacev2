# Design System Specification: Clinical Clarity & Ethereal Trust

## 1. Overview & Creative North Star

**Creative North Star: "The Digital Sanctuary"**

This design system moves away from the sterile, rigid grids typical of medical software. Instead, it adopts a high-end editorial approach that treats sensitive health data with the reverence of a premium publication. By utilizing **intentional asymmetry**, **layered depth**, and **tonal boundaries**, we create a space that feels both surgically precise and humanly approachable.

The goal is to move beyond "functional" into "authoritative." We achieve this through "The Digital Sanctuary" philosophy: expansive white space that suggests breathing room, sophisticated typography that implies expertise, and a physical sense of depth that mirrors the security of a vault.

---

## 2. Colors & Surface Architecture

The palette is rooted in deep architectural blues and clinical teals, balanced by an expansive range of "off-white" surface tones.

### The "No-Line" Rule

**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section content. Boundaries must be defined solely through background color shifts or subtle tonal transitions.

- _Implementation:_ Use a `surface-container-low` section sitting directly on a `surface` background to denote a change in context.

### Surface Hierarchy & Nesting

Treat the UI as a series of physical layers—like stacked sheets of frosted glass.

- **Level 0 (Base):** `surface` (#f9f9ff) – The expansive canvas.
- **Level 1 (Sections):** `surface-container-low` (#f0f3ff) – Large content blocks.
- **Level 2 (Cards/Modules):** `surface-container-lowest` (#ffffff) – Focal points that "pop" forward.
- **Level 3 (Interactive):** `surface-container-high` (#e2e8f8) – For active states and elevated modals.

### The "Glass & Gradient" Rule

To avoid a flat, "Bootstrap" appearance, use **Glassmorphism** for floating elements (sidebars, floating headers).

- _Recipe:_ Use `surface` at 80% opacity with a `20px` backdrop-blur.
- _Signature Gradients:_ Main CTAs should utilize a subtle linear gradient from `primary` (#0058be) to `primary_container` (#2170e4) at a 135° angle to provide a sense of "visual soul."

---

## 3. Typography: Editorial Authority

We use **Inter** not just for legibility, but as a structural element. The scale is intentionally dramatic to create a clear information hierarchy.

- **Display (lg, md, sm):** Used for high-impact data summaries or welcome states. These should have a slight negative letter-spacing (-0.02em) to feel "tight" and professional.
- **Headlines & Titles:** These are your anchors. Use `headline-lg` (2rem) for page headers to establish immediate authority.
- **Body (lg, md, sm):** The workhorse. `body-lg` is preferred for health insights to ensure maximum readability for all demographics.
- **Labels:** Reserved for metadata and technical data points. These use `ui-monospace` for 5% of the UI to signal "raw data" accuracy within a "polished" container.

---

## 4. Elevation & Depth: Tonal Layering

Traditional drop shadows are often "dirty." We use light and tone to imply importance.

- **The Layering Principle:** Instead of a shadow, place a `surface-container-lowest` (#ffffff) card inside a `surface-container-low` (#f0f3ff) wrapper. The natural contrast creates a "soft lift."
- **Ambient Shadows:** When an element must float (e.g., a critical alert or dropdown), use a shadow tinted with `on_surface`:
  - _Shadow:_ `0px 12px 32px rgba(21, 28, 39, 0.06)`
- **The "Ghost Border" Fallback:** If accessibility requirements demand a stroke, use `outline_variant` at **15% opacity**. Never use 100% opaque lines.
- **Soft Roundedness:**
  - `md` (0.75rem) for standard cards.
  - `lg` (1rem) for major containers.
  - `full` (9999px) for status pills and chips.

---

## 5. Components

### Buttons

- **Primary:** Gradient of `primary` to `primary_container`. White text. `xl` roundedness.
- **Secondary:** `secondary_fixed` background with `on_secondary_fixed` text. No border.
- **Tertiary:** Transparent background, `primary` text. Use for low-priority actions.

### Input Fields

- **Style:** Minimalist. No bottom line. Use `surface_container_low` as the field background.
- **Focus State:** A 2px "Ghost Border" of `primary` at 40% opacity.

### Data Cards & Lists

- **Strict Rule:** No dividers. Use 24px or 32px of vertical white space from the spacing scale to separate list items.
- **Visual Grouping:** Use a slight background shift (`surface-variant`) on hover to define the interactive area.

### Specialized Health Components

- **Metric Orbs:** Use `secondary_container` with a soft inner glow to highlight vital signs (e.g., Heart Rate).
- **Privacy Shields:** Use Glassmorphism (Backdrop blur) over sensitive data charts until the user hovers/authenticates, reinforcing the "Secure" brand pillar.

---

## 6. Do's and Don'ts

### Do

- **DO** use "Asymmetric Balance." If a large chart sits on the left, balance it with generous white space and a small, high-contrast action label on the right.
- **DO** use `secondary` (Teal) for "Health" and "Positive Growth" metrics.
- **DO** use `tertiary` tones for "Historical" or "Passive" data.

### Don't

- **DON'T** use black (#000000). Use `on_surface` (#151c27) for all text to maintain a high-end, softened contrast.
- **DON'T** use "Heavy" shadows. If the shadow is clearly visible as a grey smudge, it is too dark.
- **DON'T** crowd the interface. If you can't fit it with 32px of padding, it belongs on a different layer or a sub-page.
