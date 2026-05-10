---
name: Academic Precision
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#464555'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fc'
  on-secondary-container: '#57657a'
  tertiary: '#004d70'
  on-tertiary: '#ffffff'
  tertiary-container: '#006693'
  on-tertiary-container: '#b8e0ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#d5e3fc'
  secondary-fixed-dim: '#b9c7df'
  on-secondary-fixed: '#0d1c2e'
  on-secondary-fixed-variant: '#3a485b'
  tertiary-fixed: '#c9e6ff'
  tertiary-fixed-dim: '#89ceff'
  on-tertiary-fixed: '#001e2f'
  on-tertiary-fixed-variant: '#004c6e'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 24px
  container-max: 1280px
---

## Brand & Style

The design system is rooted in the **Corporate / Modern** aesthetic, specifically tailored for the high-stakes environment of educational technology. It prioritizes cognitive ease and structural clarity to foster an atmosphere of focus and reliability. The visual language conveys competence and institutional trust while maintaining the agility of a modern SaaS platform.

The UI evokes an emotional response of organized calm. By utilizing generous whitespace and a disciplined color application, the design system ensures that users—whether students tracking progress or administrators managing workflows—feel empowered by the interface rather than overwhelmed. Every element is calibrated to look "high-fidelity," suggesting a premium, well-engineered tool that respects the user's time and intellectual effort.

## Colors

The color strategy for this design system is built upon a foundation of "Deep Indigo" (#4F46E5), a color that bridges the gap between traditional academic blue and modern digital vibrancy. This primary hue is used purposefully for calls to action, active states, and progress indicators to draw the eye without causing fatigue.

"Slate Grey" (#475569) serves as the anchor for secondary information and body text, providing high legibility while appearing softer and more sophisticated than pure black. The background strategy utilizes a "Crisp White" (#FFFFFF) for primary surfaces and a very light "Slate 50" (#F8FAFC) for secondary containers to create subtle depth. Borders are kept minimal and light (#E2E8F0) to define structure without adding visual noise.

## Typography

The design system employs **Inter** as its sole typeface to leverage its systematic, utilitarian nature. This choice ensures maximum readability across varying screen sizes and resolutions, which is critical for long-form educational content and complex data tables.

Hierarchy is established through weight and subtle shifts in value rather than expressive font pairings. Headlines use a tighter letter-spacing and heavier weights to feel "grounded," while body copy utilizes a generous line-height to prevent reader fatigue. Label styles are frequently used for metadata and small UI annotations, often in uppercase or semi-bold weights to maintain legibility at small scales.

## Layout & Spacing

The layout philosophy follows a **Fixed Grid** model for desktop views, centering content within a 1280px container to ensure optimal line lengths for reading. Inside this container, a 12-column fluid system handles responsive modularity. 

The spacing rhythm is strictly based on an 8px scale. This mathematical consistency creates a "locked-in" feel that contributes to the professional and organized aesthetic. Internal component padding typically uses the `md` (16px) or `lg` (24px) units to maintain the "clean" look requested, ensuring that no element ever feels cramped.

## Elevation & Depth

This design system utilizes **Tonal Layers** combined with **Ambient Shadows** to communicate hierarchy. Unlike flat designs that rely solely on borders, this system uses depth to indicate interactivity and importance.

Shadows are crafted to be "soft" and "deep," using a low-opacity Indigo tint (e.g., `rgba(79, 70, 229, 0.08)`) rather than pure grey. This prevents the interface from looking muddy. 
- **Level 0 (Base):** White or Light Grey background.
- **Level 1 (Cards):** Subtle 1px border with a very soft, large-spread shadow.
- **Level 2 (Dropdowns/Modals):** High-contrast shadow with more vertical offset to suggest they are floating significantly above the workspace.
- **Interactive State:** Elements like buttons may "lift" on hover, increasing shadow spread to provide tactile feedback.

## Shapes

The design system adopts a **Rounded** shape language. All primary UI elements, including buttons, input fields, and cards, utilize a consistent 0.5rem (8px) corner radius. This specific radius is the "sweet spot" for professional SaaS; it is soft enough to feel modern and accessible, yet sharp enough to maintain a sense of precision and structure.

Secondary elements like tags or "chips" may utilize a pill-shape for distinct visual differentiation, but the core structural components must adhere to the 8px standard to maintain a unified architectural feel.

## Components

### Buttons
Primary buttons use the Deep Indigo background with White text and no border. They feature a subtle inner-glow on hover to enhance the "high-fidelity" feel. Secondary buttons use a light Slate Grey outline with a transparent background.

### Input Fields
Inputs are defined by a 1px border (#E2E8F0) and an 8px radius. When focused, the border transitions to Deep Indigo with a 3px soft focus ring in a semi-transparent Indigo. Labels are positioned above the field in `label-md` Slate Grey.

### Cards
The primary container for data. Cards are White with a 1px border and the Level 1 shadow defined in the Elevation section. Headers within cards should be separated by a subtle horizontal rule.

### Chips & Badges
Used for course categories or status (e.g., "In Progress"). These use a lighter tint of the status color (e.g., Light Indigo) with darker text for high contrast. They have a 4px or fully rounded radius to distinguish them from buttons.

### Data Visualization
Charts should use a clean, monochromatic Indigo palette for single-data series, or a diverse but muted "Professional" palette (Indigo, Teal, Slate) for multi-series data. Grid lines in charts must be extremely subtle (#F1F5F9).

### Progress Bars
Track progress using a 8px height with a rounded track. The filled portion uses the Deep Indigo color, while the background track uses a light Grey (#F1F5F9).
