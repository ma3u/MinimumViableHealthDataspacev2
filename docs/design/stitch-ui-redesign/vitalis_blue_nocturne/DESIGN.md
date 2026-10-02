# Design System Document: Clinical Nocturne

## 1. Overview & Creative North Star

### The Creative North Star: "The Ethereal Laboratory"

This design system moves away from the "standard dashboard" aesthetic toward a high-end, editorial experience designed for high-stakes clinical environments. Our goal is **Clinical Clarity & Ethereal Trust**. We achieve this by treating the interface not as a flat screen, but as a series of luminous, depth-charged layers.

By leveraging deep slate foundations and "glowing" interactive anchors, we create an atmosphere of calm authority. We break the "template" look by utilizing intentional asymmetry—placing key data points off-center to guide the eye—and replacing rigid dividers with tonal shifts that mimic natural light falling across architectural surfaces.

---

## 2. Colors & Surface Logic

The palette is rooted in the deep navy of the night sky, using blue accents not just as "decoration," but as functional light sources.

### Core Color Tokens

- **Background (Base):** `#0b1326` — Our deepest anchor.
- **Primary (Accent/Action):** `#adc6ff` — A luminous, breathable blue for high-visibility interactions.
- **Primary Container (Interactive):** `#4d8eff` — Used for active states and subtle glows.
- **Surface Tiers:**
  - `surface_container_lowest`: `#060e20` (Inset areas, deep background)
  - `surface_container`: `#171f33` (Standard card background)
  - `surface_container_highest`: `#2d3449` (Elevated modals or hover states)

### The "No-Line" Rule

**Strict Mandate:** Designers are prohibited from using 1px solid borders to define sections. Layout boundaries must be achieved through:

1.  **Background Shifts:** Place a `surface_container_low` card on a `surface` background.
2.  **Vertical Space:** Use generous white space (1.5x the standard) to define grouping.

### The "Glass & Gradient" Rule

To elevate the UI from "app" to "experience," apply a **Signature Glow**:

- **Hero CTAs:** Use a linear gradient from `primary` (`#adc6ff`) to `primary_container` (`#4d8eff`) at a 135-degree angle.
- **Glassmorphism:** For floating headers or navigation rails, use `surface_bright` at 60% opacity with a `20px` backdrop-blur. This creates the "Ethereal Trust" by showing the content moving beneath the surface.

---

## 3. Typography: Editorial Authority

We use **Inter** not as a system font, but as a precision instrument.

| Level        | Token         | Size      | Tracking | Weight     | Intent                                |
| :----------- | :------------ | :-------- | :------- | :--------- | :------------------------------------ |
| **Display**  | `display-lg`  | 3.5rem    | -0.02em  | 700        | High-impact data or hero statements.  |
| **Headline** | `headline-md` | 1.75rem   | -0.01em  | 600        | Section entry points.                 |
| **Title**    | `title-md`    | 1.125rem  | 0        | 500        | Card headings and primary navigation. |
| **Body**     | `body-md`     | 0.875rem  | +0.01em  | 400        | Clinical notes and descriptive text.  |
| **Label**    | `label-sm`    | 0.6875rem | +0.04em  | 700 (Caps) | Metadata and status indicators.       |

**Hierarchy Note:** Use `on_surface_variant` (#c2c6d6) for body text to reduce eye strain, reserving `on_surface` (#dae2fd) strictly for Headlines and Titles to create an immediate visual "read-path."

---

## 4. Elevation & Depth

In this design system, depth is a product of **Tonal Layering**, not geometry.

### The Layering Principle

Think of the UI as stacked sheets of tinted glass.

- **The Base:** `surface` (#0b1326).
- **The Object:** `surface_container` (#171f33).
- **The Interaction:** When a user interacts, the container should shift to `surface_container_high` (#222a3d), creating a "natural lift" through lightness rather than a shadow.

### Ambient Shadows

Shadows should be rare and invisible.

- **Token:** `Shadow_Ambient`
- **Spec:** `0px 24px 48px rgba(0, 0, 0, 0.4)`
- **Color:** Always use a tinted shadow (using a dark navy base) rather than pure black to maintain the "Clinical Blue" color profile.

### The "Ghost Border" Fallback

If contrast testing fails for accessibility, use a **Ghost Border**:

- `outline_variant` (#424754) at **15% opacity**. It should feel like a suggestion of an edge, not a cage.

---

## 5. Components & UI Patterns

### Buttons (The Luminous Core)

- **Primary:** Gradient (`primary` to `primary_container`), `on_primary` text. Apply a `drop-shadow` with the `primary` color at 20% opacity to create a "glow" effect.
- **Secondary:** Transparent fill with a Ghost Border. Text in `primary`.
- **Corner Radius:** Always `DEFAULT` (0.5rem / 8px) for a sophisticated, "rounded-square" architectural feel.

### Cards & Lists

- **No Dividers:** Lists should never use horizontal lines. Use `surface_container_low` for even-numbered rows or simply increase vertical padding to 24px to separate items.
- **Nesting:** A card (`surface_container`) can hold an input field (`surface_container_lowest`) to create a "sunken" ergonomic feel for data entry.

### Input Fields

- **Background:** `surface_container_lowest`.
- **Focus State:** Transition the border-tint to `primary` and add a `2px` outer glow using the `primary` color at 10% opacity.
- **Error:** Use `error` (#ffb4ab) text with a `surface_container_highest` background for the error message bubble.

---

## 6. Do's and Don'ts

### Do:

- **Do** use `tertiary` (#ffb786) sparingly for "Warning" or "Urgent" states—it provides a sophisticated contrast to the navy base.
- **Do** use `display-lg` typography for single, impactful numbers (e.g., a patient's heart rate or a system's uptime).
- **Do** maximize the use of "Surface Bright" for floating elements to give the interface an "airy" feel despite the dark palette.

### Don't:

- **Don't** use pure black (#000000). It breaks the "Ethereal" aesthetic and feels too heavy for clinical software.
- **Don't** use 100% opaque borders. They create visual noise and distract from the data.
- **Don't** use "Standard Blue" (#0000FF). Only use the specific `primary` (#adc6ff) and the user-defined accent (#3B82F6) for active "Glow" states.
- **Don't** crowd the layout. If you feel the need for a divider line, it usually means you haven't used enough white space.
