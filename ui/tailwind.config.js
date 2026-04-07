/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── 5-layer architecture palette ────────────────────────────────────
        // DEFAULT / light → fill, border, background use (no text AA required)
        // dark           → corrected to ≥4.5:1 on white for text/icon use
        layer1: {
          DEFAULT: "#5B8DEF",
          light: "#B3CCFA",
          dark: "#3A5FA8", // 6.2:1 on white ✅
        },
        layer2: {
          DEFAULT: "#45B7AA",
          light: "#8FD8CF",
          dark: "#2E7E75", // 4.8:1 on white ✅
        },
        layer3: {
          DEFAULT: "#6ABF69",
          light: "#A8DCA8",
          dark: "#3B6E3B", // 6.1:1 on white ✅  (was #468646 = 4.4:1 ❌)
        },
        layer4: {
          DEFAULT: "#F0A050",
          light: "#F8D0A0",
          dark: "#8A5520", // 6.2:1 on white ✅  (was #B07030 = 4.1:1 ❌)
        },
        layer5: {
          DEFAULT: "#A78BDB",
          light: "#D0C0ED",
          dark: "#7B5FB0", // 5.1:1 on white ✅
        },

        // ── Semantic surface tokens (CSS vars) ──────────────────────────────
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
        },

        // ── Role badge tokens (CSS vars) ────────────────────────────────────
        // Usage: text-role-admin, bg-role-admin, border-role-admin
        "role-admin": {
          text: "var(--role-admin-text)",
          bg: "var(--role-admin-bg)",
          border: "var(--role-admin-border)",
        },
        "role-holder": {
          text: "var(--role-holder-text)",
          bg: "var(--role-holder-bg)",
          border: "var(--role-holder-border)",
        },
        "role-user": {
          text: "var(--role-user-text)",
          bg: "var(--role-user-bg)",
          border: "var(--role-user-border)",
        },
        "role-hdab": {
          text: "var(--role-hdab-text)",
          bg: "var(--role-hdab-bg)",
          border: "var(--role-hdab-border)",
        },
        "role-patient": {
          text: "var(--role-patient-text)",
          bg: "var(--role-patient-bg)",
          border: "var(--role-patient-border)",
        },
        "role-trust": {
          text: "var(--role-trust-text)",
          bg: "var(--role-trust-bg)",
          border: "var(--role-trust-border)",
        },

        // ── FHIR resource type tokens (CSS vars) ────────────────────────────
        "fhir-patient": "var(--fhir-patient)",
        "fhir-encounter": "var(--fhir-encounter)",
        "fhir-condition": "var(--fhir-condition)",
        "fhir-observation": "var(--fhir-observation)",
        "fhir-medication": "var(--fhir-medication)",
        "fhir-procedure": "var(--fhir-procedure)",
        "fhir-immunization": "var(--fhir-immunization)",
        "fhir-diagnostic": "var(--fhir-diagnostic)",
        "fhir-allergy": "var(--fhir-allergy)",
        "fhir-careplan": "var(--fhir-careplan)",
      },

      backgroundColor: {
        base: "var(--bg)",
      },

      textColor: {
        base: "var(--text-primary)",
        muted: "var(--text-secondary)",
        // Status text tokens — safe for body copy in both modes
        "success-safe": "var(--success-text)",
        "warning-safe": "var(--warning-text)",
        "danger-safe": "var(--danger-text)",
        // Layer text tokens — dark shades in light, originals in dark
        "layer1-safe": "var(--layer1-text)",
        "layer2-safe": "var(--layer2-text)",
        "layer3-safe": "var(--layer3-text)",
        "layer4-safe": "var(--layer4-text)",
        "layer5-safe": "var(--layer5-text)",
      },

      borderColor: {
        base: "var(--border)",
        ui: "var(--border-ui)", // ≥3:1 contrast — use on inputs, cards, checkboxes
      },

      outlineColor: {
        "focus-ring": "var(--focus-ring)",
      },
    },
  },
  plugins: [],
};
